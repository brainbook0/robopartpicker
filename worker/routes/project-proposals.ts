import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { ProjectProposalsRepository } from "../db/repositories/project-proposals";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertScopedRead, authenticatedUserId } from "../middleware/authorization";
import { recordAuditEvent } from "../services/audit";
import { parseJson } from "../validation";

const proposalType = z.enum(["assembly_step", "assembly_video", "integration", "source", "identity_correction", "bom_correction", "issue_report"]);
const createSchema = z.object({
  proposalType,
  title: z.string().trim().min(5).max(200),
  details: z.string().trim().min(20).max(4_000),
  sourceUrls: z.array(z.string().trim().url().max(2_048)).min(1).max(5),
}).strict();
const reviewSchema = z.object({
  action: z.enum(["approve", "reject", "withdraw"]),
  reviewNote: z.string().trim().min(10).max(4_000).optional(),
  resultingProjectVersionId: z.string().trim().min(1).max(200).optional(),
}).strict().superRefine((value, context) => {
  if (value.action !== "withdraw" && !value.reviewNote) context.addIssue({ code: "custom", message: "A review note is required." });
});

type ProjectAccessRow = {
  id: string; owner_user_id: string | null; organization_id: string | null;
  visibility: "private" | "organization" | "unlisted" | "public";
  status: string; is_demo: number;
};

export const projectProposalRoutes = new Hono<AppBindings>();

projectProposalRoutes.get("/projects/:projectId/proposals", async (c) => {
  const project = await projectAccess(c.env.DB, c.req.param("projectId"));
  if (!project || project.is_demo === 1 || project.visibility !== "public" || project.status !== "published") throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const items = await new ProjectProposalsRepository(c.env.DB).listApproved(project.id);
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return c.json({ items });
});

projectProposalRoutes.get("/projects/:projectId/proposals/review", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const project = await projectAccess(c.env.DB, c.req.param("projectId"));
  if (!project || project.is_demo === 1) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (!await canReviewProject(c.env.DB, userId, project)) throw new AppError(403, "PROJECT_PROPOSAL_REVIEW_DENIED", "Only the project owner, organization administrators, or platform moderators can review proposals.");
  c.header("Cache-Control", "no-store");
  return c.json({ items: await new ProjectProposalsRepository(c.env.DB).listPending(project.id) });
});

projectProposalRoutes.post("/projects/:projectId/proposals", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const project = await projectAccess(c.env.DB, c.req.param("projectId"));
  if (!project || project.is_demo === 1) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  await assertScopedRead(c.env.DB, userId, project);
  const input = await parseJson(c, createSchema);
  const item = await new ProjectProposalsRepository(c.env.DB).create({ projectId: project.id, authorUserId: userId, ...input });
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "project_proposal.create", entityType: "project_change_proposal", entityId: item.id, requestId: c.get("requestId"), after: { projectId: project.id, proposalType: item.proposalType, sourceCount: item.sourceUrls.length, status: item.status } });
  return c.json({ item }, 201);
});

projectProposalRoutes.patch("/projects/:projectId/proposals/:proposalId", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const project = await projectAccess(c.env.DB, c.req.param("projectId"));
  if (!project || project.is_demo === 1) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const input = await parseJson(c, reviewSchema);
  const repository = new ProjectProposalsRepository(c.env.DB);
  const existing = await repository.find(c.req.param("proposalId"), project.id);
  if (!existing) throw new AppError(404, "PROJECT_PROPOSAL_NOT_FOUND", "Proposal not found.");

  if (input.action === "withdraw") {
    const item = await repository.withdraw(existing.id, project.id, userId);
    if (!item) throw new AppError(409, "PROJECT_PROPOSAL_CONFLICT", "Only the author can withdraw a pending proposal.");
    await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "project_proposal.withdraw", entityType: "project_change_proposal", entityId: item.id, requestId: c.get("requestId"), before: { status: existing.status }, after: { status: item.status } });
    return c.json({ item });
  }

  if (!await canReviewProject(c.env.DB, userId, project)) throw new AppError(403, "PROJECT_PROPOSAL_REVIEW_DENIED", "Only the project owner, organization administrators, or platform moderators can review proposals.");
  if (input.resultingProjectVersionId) {
    const version = await c.env.DB.prepare("SELECT id FROM project_versions WHERE id = ?1 AND project_id = ?2").bind(input.resultingProjectVersionId, project.id).first<{ id: string }>();
    if (!version) throw new AppError(422, "PROJECT_VERSION_INVALID", "The resulting project version does not belong to this project.");
  }
  const status = input.action === "approve" ? "approved" : "rejected";
  const item = await repository.review({ id: existing.id, projectId: project.id, reviewerUserId: userId, status, reviewNote: input.reviewNote!, resultingProjectVersionId: input.resultingProjectVersionId ?? null });
  if (!item) throw new AppError(409, "PROJECT_PROPOSAL_CONFLICT", "The proposal has already been reviewed or withdrawn.");
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: `project_proposal.${status}`, entityType: "project_change_proposal", entityId: item.id, requestId: c.get("requestId"), before: { status: existing.status }, after: { status: item.status, resultingProjectVersionId: item.resultingProjectVersionId } });
  return c.json({ item });
});

async function projectAccess(db: D1Database, id: string): Promise<ProjectAccessRow | null> {
  return db.prepare("SELECT id, owner_user_id, organization_id, visibility, status, is_demo FROM projects WHERE id = ?1 AND deleted_at IS NULL").bind(id).first<ProjectAccessRow>();
}

async function canReviewProject(db: D1Database, userId: string, project: ProjectAccessRow): Promise<boolean> {
  if (project.owner_user_id === userId) return true;
  const permission = await db.prepare(`SELECT 1 AS allowed WHERE EXISTS (
      SELECT 1 FROM platform_user_roles WHERE user_id = ?1 AND role IN ('administrator', 'moderator')
    ) OR EXISTS (
      SELECT 1 FROM organization_members WHERE organization_id = ?2 AND user_id = ?1 AND status = 'active' AND role IN ('owner', 'admin')
    )`).bind(userId, project.organization_id).first<{ allowed: number }>();
  return permission?.allowed === 1;
}
