import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { ProjectReviewsRepository } from "../db/repositories/project-reviews";
import { ProjectCommentsRepository } from "../db/repositories/project-comments";
import { ProjectExperienceClaimsRepository } from "../db/repositories/project-experience-claims";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertScopedRead, authenticatedUserId } from "../middleware/authorization";
import { recordAuditEvent } from "../services/audit";
import { parseJson } from "../validation";

const rating = z.number().int().min(1).max(5);
const optionalRating = rating.nullable().optional().default(null);
const reviewSchema = z.object({
  overallRating: rating, reliabilityRating: optionalRating, usabilityRating: optionalRating,
  valueRating: optionalRating, supportRating: optionalRating,
  relationship: z.enum(["owner", "operator", "evaluator", "observer"]),
  title: z.string().trim().min(5).max(200), body: z.string().trim().min(50).max(5_000),
}).strict();
const commentSchema = z.object({ parentId: z.string().trim().min(1).max(200).nullable().optional(), body: z.string().trim().min(2).max(4_000) }).strict();
const reportSchema = z.object({ entityType: z.enum(["review", "comment"]), entityId: z.string().trim().min(1).max(200), reason: z.enum(["spam", "harassment", "misinformation", "conflict_of_interest", "other"]), details: z.string().trim().max(2_000).optional() }).strict();
const claimSchema = z.object({ claimType: z.enum(["owner", "operator", "manufacturer_representative"]), evidenceFileId: z.string().trim().min(1).max(200), evidenceReference: z.string().trim().max(2_000).optional() }).strict();
const claimReviewSchema = z.object({ status: z.enum(["verified", "rejected", "revoked"]), privateModeratorNotes: z.string().trim().min(10).max(4_000) }).strict();
const moderationSchema = z.object({ status: z.enum(["published", "under_review", "removed"]), note: z.string().trim().min(10).max(4_000) }).strict();

type ProjectAccessRow = { id: string; owner_user_id: string | null; organization_id: string | null; visibility: "private" | "organization" | "unlisted" | "public"; status: string; is_demo: number };

export const projectSocialRoutes = new Hono<AppBindings>();

projectSocialRoutes.get("/projects/:projectId/reviews", async (c) => {
  await requirePublicProject(c.env.DB, c.req.param("projectId"));
  const result = await new ProjectReviewsRepository(c.env.DB).listPublished(c.req.param("projectId"));
  c.header("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  return c.json(result);
});

projectSocialRoutes.put("/projects/:projectId/reviews/mine", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const project = await readableProject(c.env.DB, c.req.param("projectId"), userId);
  const input = await parseJson(c, reviewSchema);
  try {
    const item = await new ProjectReviewsRepository(c.env.DB).upsert(project.id, userId, input);
    await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "project_review.upsert", entityType: "project_review", entityId: item.id, requestId: c.get("requestId"), after: { projectId: project.id, overallRating: item.overallRating, relationship: item.relationship, version: item.version } });
    return c.json({ item });
  } catch (error) {
    if (String(error).includes("PROJECT_REVIEW_VERSION_CONFLICT")) throw new AppError(409, "PROJECT_REVIEW_VERSION_CONFLICT", "The review changed; refresh and retry.");
    throw error;
  }
});

projectSocialRoutes.get("/projects/:projectId/comments", loadAuthSession, async (c) => {
  await requirePublicProject(c.env.DB, c.req.param("projectId"));
  const viewer = c.get("authSession")?.user?.id ?? null;
  return c.json({ items: await new ProjectCommentsRepository(c.env.DB).listPublished(c.req.param("projectId"), viewer) });
});

projectSocialRoutes.post("/projects/:projectId/comments", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const project = await readableProject(c.env.DB, c.req.param("projectId"), userId);
  const input = await parseJson(c, commentSchema);
  const result = await new ProjectCommentsRepository(c.env.DB).create(project.id, userId, input.body, input.parentId ?? null);
  if (result.error) throw new AppError(422, "PROJECT_COMMENT_PARENT_INVALID", result.error === "nested_reply" ? "Project discussion supports one reply level." : "The parent comment does not belong to this project.");
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "project_comment.create", entityType: "project_comment", entityId: result.item!.id, requestId: c.get("requestId"), after: { projectId: project.id, parentId: result.item!.parentId } });
  return c.json({ item: result.item! }, 201);
});

projectSocialRoutes.post("/projects/:projectId/comments/:commentId/helpful", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  await readableProject(c.env.DB, c.req.param("projectId"), userId);
  const item = await new ProjectCommentsRepository(c.env.DB).markHelpful(c.req.param("projectId"), c.req.param("commentId"), userId);
  if (!item) throw new AppError(404, "PROJECT_COMMENT_NOT_FOUND", "Comment not found.");
  return c.json({ item });
});

projectSocialRoutes.post("/project-content-reports", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const input = await parseJson(c, reportSchema);
  const table = input.entityType === "review" ? "project_reviews" : "project_comments";
  const entity = await c.env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?1`).bind(input.entityId).first<{ id: string }>();
  if (!entity) throw new AppError(404, "PROJECT_CONTENT_NOT_FOUND", "The reported content was not found.");
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  try {
    await c.env.DB.prepare(`INSERT INTO project_content_reports (id, reporter_user_id, entity_type, entity_id, reason, details, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7, ?7)`).bind(id, userId, input.entityType, input.entityId, input.reason, input.details ?? null, now).run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new AppError(409, "PROJECT_CONTENT_ALREADY_REPORTED", "You already reported this content.");
    throw error;
  }
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "project_content.report", entityType: "project_content_report", entityId: id, requestId: c.get("requestId"), after: { reportedEntityType: input.entityType, reportedEntityId: input.entityId, reason: input.reason } });
  return c.json({ item: { id, status: "open" as const, createdAt: now } }, 201);
});

projectSocialRoutes.post("/projects/:projectId/experience-claims", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const project = await readableProject(c.env.DB, c.req.param("projectId"), userId);
  const input = await parseJson(c, claimSchema);
  const file = await c.env.DB.prepare("SELECT id, owner_user_id, status, visibility FROM files WHERE id = ?1 AND deleted_at IS NULL")
    .bind(input.evidenceFileId).first<{ id: string; owner_user_id: string; status: string; visibility: string }>();
  if (!file || file.owner_user_id !== userId || file.status !== "ready" || file.visibility !== "private") throw new AppError(422, "EXPERIENCE_EVIDENCE_INVALID", "Experience evidence must be a ready private file owned by the claimant.");
  const item = await new ProjectExperienceClaimsRepository(c.env.DB).submit({ projectId: project.id, userId, claimType: input.claimType, evidenceFileId: input.evidenceFileId, evidenceReference: input.evidenceReference ?? null });
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "project_experience_claim.submit", entityType: "project_experience_claim", entityId: item.id, requestId: c.get("requestId"), after: { projectId: project.id, claimType: item.claimType, status: item.status } });
  return c.json({ item }, 201);
});

projectSocialRoutes.get("/projects/:projectId/experience-badges", async (c) => {
  await requirePublicProject(c.env.DB, c.req.param("projectId"));
  return c.json({ items: await new ProjectExperienceClaimsRepository(c.env.DB).listBadges(c.req.param("projectId")) });
});

projectSocialRoutes.patch("/experience-claims/:claimId/review", loadAuthSession, requireAuth, async (c) => {
  const reviewerUserId = authenticatedUserId(c);
  await requirePlatformModerator(c.env.DB, reviewerUserId);
  const input = await parseJson(c, claimReviewSchema);
  const repository = new ProjectExperienceClaimsRepository(c.env.DB);
  const existing = await repository.findPrivate(c.req.param("claimId"));
  if (!existing) throw new AppError(404, "EXPERIENCE_CLAIM_NOT_FOUND", "Experience claim not found.");
  if (existing.user_id === reviewerUserId) throw new AppError(403, "EXPERIENCE_SELF_REVIEW_DENIED", "Moderators cannot verify their own experience claims.");
  const item = await repository.review({ id: existing.id, reviewerUserId, ...input });
  if (!item) throw new AppError(409, "EXPERIENCE_CLAIM_CONFLICT", "The claim state changed; refresh and retry.");
  await recordAuditEvent(c.env.DB, { actorUserId: reviewerUserId, action: `project_experience_claim.${input.status}`, entityType: "project_experience_claim", entityId: item.id, requestId: c.get("requestId"), before: { status: existing.status }, after: { status: item.status } });
  return c.json({ item });
});

projectSocialRoutes.patch("/project-content/:entityType/:entityId/moderation", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c); await requirePlatformModerator(c.env.DB, userId);
  const entityType = c.req.param("entityType");
  if (entityType !== "review" && entityType !== "comment") throw new AppError(404, "PROJECT_CONTENT_NOT_FOUND", "Content not found.");
  const input = await parseJson(c, moderationSchema);
  const table = entityType === "review" ? "project_reviews" : "project_comments";
  const idColumn = c.req.param("entityId"); const now = new Date().toISOString();
  const result = await c.env.DB.prepare(`UPDATE ${table} SET moderation_status = ?2, updated_at = ?3 ${entityType === "review" ? ", last_moderated_by_user_id = ?4, last_moderated_at = ?3, removed_at = CASE WHEN ?2 = 'removed' THEN ?3 ELSE NULL END" : ""} WHERE id = ?1`)
    .bind(idColumn, input.status, now, userId).run();
  if (Number(result.meta.changes) !== 1) throw new AppError(404, "PROJECT_CONTENT_NOT_FOUND", "Content not found.");
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: `project_${entityType}.moderate`, entityType: `project_${entityType}`, entityId: idColumn, requestId: c.get("requestId"), after: { status: input.status, note: input.note } });
  return c.json({ item: { id: idColumn, status: input.status, updatedAt: now } });
});

async function projectAccess(db: D1Database, id: string): Promise<ProjectAccessRow | null> { return db.prepare("SELECT id, owner_user_id, organization_id, visibility, status, is_demo FROM projects WHERE id = ?1 AND deleted_at IS NULL").bind(id).first<ProjectAccessRow>(); }
async function readableProject(db: D1Database, id: string, userId: string): Promise<ProjectAccessRow> { const project = await projectAccess(db, id); if (!project || project.is_demo === 1) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found."); await assertScopedRead(db, userId, project); return project; }
async function requirePublicProject(db: D1Database, id: string): Promise<ProjectAccessRow> { const project = await projectAccess(db, id); if (!project || project.is_demo === 1 || project.visibility !== "public" || project.status !== "published") throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found."); return project; }
async function requirePlatformModerator(db: D1Database, userId: string): Promise<void> { const role = await db.prepare("SELECT 1 AS allowed FROM platform_user_roles WHERE user_id = ?1 AND role IN ('administrator', 'moderator')").bind(userId).first<{ allowed: number }>(); if (role?.allowed !== 1) throw new AppError(403, "PLATFORM_MODERATOR_REQUIRED", "Platform moderator access is required."); }
