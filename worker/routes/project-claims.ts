import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { ProjectClaimsRepository } from "../db/repositories/project-claims";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { authenticatedUserId, requirePlatformRole } from "../middleware/authorization";
import { recordAuditEvent } from "../services/audit";
import { parseJson } from "../validation";

const submitSchema = z.object({
  evidenceFileId: z.string().trim().min(1).max(200),
  evidenceReference: z.string().trim().max(2_000).optional(),
}).strict();
const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  privateModeratorNotes: z.string().trim().min(10).max(4_000),
}).strict();

export const projectClaimRoutes = new Hono<AppBindings>();

projectClaimRoutes.get("/projects/:projectId/claim-eligibility", async (c) => {
  const result = await new ProjectClaimsRepository(c.env.DB).eligibility(c.req.param("projectId"));
  if (!result) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  c.header("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  return c.json({ item: result.item });
});

projectClaimRoutes.post("/projects/:projectId/claims", loadAuthSession, requireAuth, async (c) => {
  const claimantUserId = authenticatedUserId(c);
  const input = await parseJson(c, submitSchema);
  const repository = new ProjectClaimsRepository(c.env.DB);
  const project = await repository.eligibility(c.req.param("projectId"));
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (!project.item.claimable) throw new AppError(409, "PROJECT_NOT_CLAIMABLE", `This project cannot be claimed: ${project.item.reason}.`);
  const evidence = await c.env.DB.prepare(`SELECT id, owner_user_id, visibility, status
    FROM files WHERE id = ?1 AND deleted_at IS NULL`).bind(input.evidenceFileId).first<{
      id: string; owner_user_id: string | null; visibility: string; status: string;
    }>();
  if (!evidence || evidence.owner_user_id !== claimantUserId || evidence.visibility !== "private" || evidence.status !== "ready") {
    throw new AppError(422, "PROJECT_CLAIM_EVIDENCE_INVALID", "Claim evidence must be a ready private file owned by the claimant.");
  }
  const item = await repository.submit({
    project: project.row,
    claimantUserId,
    evidenceFileId: evidence.id,
    evidenceReference: input.evidenceReference?.trim() || null,
  });
  await recordAuditEvent(c.env.DB, {
    actorUserId: claimantUserId,
    action: "project_claim.submit",
    entityType: "project_claim_request",
    entityId: item.id,
    requestId: c.get("requestId"),
    after: { projectId: item.projectId, status: item.status },
  });
  return c.json({ item }, 201);
});

projectClaimRoutes.get("/project-claims/mine", loadAuthSession, requireAuth, async (c) => {
  const claimantUserId = authenticatedUserId(c);
  const projectId = c.req.query("projectId")?.trim();
  if (projectId && projectId.length > 200) throw new AppError(422, "VALIDATION_ERROR", "projectId is too long.");
  return c.json({ items: await new ProjectClaimsRepository(c.env.DB).listMine(claimantUserId, projectId || undefined) });
});

projectClaimRoutes.post("/project-claims/:claimId/withdraw", loadAuthSession, requireAuth, async (c) => {
  const claimantUserId = authenticatedUserId(c);
  const repository = new ProjectClaimsRepository(c.env.DB);
  const existing = await repository.findPrivate(c.req.param("claimId"));
  if (!existing) throw new AppError(404, "PROJECT_CLAIM_NOT_FOUND", "Project claim not found.");
  if (existing.claimant_user_id !== claimantUserId) {
    throw new AppError(403, "PROJECT_CLAIM_ACCESS_DENIED", "Only the claimant can withdraw this claim.");
  }
  const item = await repository.withdraw(existing.id, claimantUserId);
  if (!item) throw new AppError(409, "PROJECT_CLAIM_CONFLICT", "The claim state changed; refresh and retry.");
  await recordAuditEvent(c.env.DB, {
    actorUserId: claimantUserId,
    action: "project_claim.withdraw",
    entityType: "project_claim_request",
    entityId: item.id,
    requestId: c.get("requestId"),
    before: { status: existing.status },
    after: { projectId: item.projectId, status: item.status },
  });
  return c.json({ item });
});

projectClaimRoutes.get(
  "/admin/project-claims",
  loadAuthSession,
  requireAuth,
  requirePlatformRole("moderator", "administrator"),
  async (c) => {
    const status = c.req.query("status")?.trim() || "pending";
    if (!new Set(["pending", "approved", "rejected", "withdrawn"]).has(status)) {
      throw new AppError(422, "VALIDATION_ERROR", "status must be pending, approved, rejected, or withdrawn.");
    }
    return c.json({ items: await new ProjectClaimsRepository(c.env.DB).listForReview(status as "pending" | "approved" | "rejected" | "withdrawn") });
  },
);

projectClaimRoutes.get(
  "/admin/project-claims/:claimId/evidence",
  loadAuthSession,
  requireAuth,
  requirePlatformRole("moderator", "administrator"),
  async (c) => {
    const reviewerUserId = authenticatedUserId(c);
    const row = await c.env.DB.prepare(`SELECT claim.claimant_user_id, file.object_key, file.original_name,
        file.media_type, file.size_bytes
      FROM project_claim_requests claim JOIN files file ON file.id = claim.evidence_file_id
      WHERE claim.id = ?1 AND file.deleted_at IS NULL AND file.status = 'ready' AND file.visibility = 'private'`)
      .bind(c.req.param("claimId")).first<{ claimant_user_id: string; object_key: string; original_name: string; media_type: string; size_bytes: number }>();
    if (!row) throw new AppError(404, "PROJECT_CLAIM_EVIDENCE_NOT_FOUND", "Project claim evidence not found.");
    if (row.claimant_user_id === reviewerUserId) {
      throw new AppError(403, "PROJECT_CLAIM_SELF_REVIEW_DENIED", "Moderators cannot inspect evidence for their own project claims.");
    }
    const object = await c.env.FILES.get(row.object_key);
    if (!object) throw new AppError(404, "PROJECT_CLAIM_EVIDENCE_NOT_FOUND", "Project claim evidence not found.");
    c.header("Cache-Control", "private, no-store");
    c.header("Content-Type", row.media_type || "application/octet-stream");
    c.header("Content-Length", String(row.size_bytes));
    c.header("Content-Disposition", `inline; filename="${row.original_name.replace(/["\\\r\n]/gu, "_")}"`);
    return c.body(object.body);
  },
);

projectClaimRoutes.patch(
  "/admin/project-claims/:claimId",
  loadAuthSession,
  requireAuth,
  requirePlatformRole("moderator", "administrator"),
  async (c) => {
    const reviewerUserId = authenticatedUserId(c);
    const input = await parseJson(c, reviewSchema);
    const repository = new ProjectClaimsRepository(c.env.DB);
    const existing = await repository.findPrivate(c.req.param("claimId"));
    if (!existing) throw new AppError(404, "PROJECT_CLAIM_NOT_FOUND", "Project claim not found.");
    if (existing.claimant_user_id === reviewerUserId) {
      throw new AppError(403, "PROJECT_CLAIM_SELF_REVIEW_DENIED", "Moderators cannot review their own project claims.");
    }
    let item;
    try {
      item = await repository.review({ id: existing.id, reviewerUserId, ...input });
    } catch (error) {
      if (String(error).includes("PROJECT_CLAIM_STALE")) {
        throw new AppError(409, "PROJECT_CLAIM_STALE", "The project changed after this claim was submitted; refresh before reviewing it.");
      }
      throw error;
    }
    if (!item) throw new AppError(409, "PROJECT_CLAIM_CONFLICT", "The claim state changed; refresh and retry.");
    await recordAuditEvent(c.env.DB, {
      actorUserId: reviewerUserId,
      action: `project_claim.${input.action}`,
      entityType: "project_claim_request",
      entityId: item.id,
      requestId: c.get("requestId"),
      before: { status: existing.status },
      after: { projectId: item.projectId, status: item.status },
    });
    return c.json({ item });
  },
);
