import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { AppError, parsePositiveInt } from "../http";
import { parseJson } from "../validation";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { authenticatedUserId, requirePlatformRole } from "../middleware/authorization";
import {
  listSupplierPartnerInterests,
  triageSupplierPartnerInterest,
  type PartnerInterestStatus,
} from "../db/repositories/partner-interest";
import { recordAuditEvent } from "../services/audit";
import { supplierRelationshipPipeline, supplierRelationshipPublicSummary } from "../services/supplier-relationships";

export const supplierRelationshipRoutes = new Hono<AppBindings>();

const statuses = new Set<PartnerInterestStatus>(["received", "reviewing", "qualified", "closed", "spam"]);
const triageSchema = z.object({
  status: z.enum(["reviewing", "qualified", "closed", "spam"]),
  adminNotes: z.string().trim().max(2_000).nullable().optional(),
}).strict();

supplierRelationshipRoutes.get("/supplier-relationships/policy", (c) => {
  return c.json({ item: supplierRelationshipPublicSummary() });
});

supplierRelationshipRoutes.use(
  "/admin/supplier-relationships/*",
  loadAuthSession,
  requireAuth,
  requirePlatformRole("moderator", "administrator"),
);

supplierRelationshipRoutes.get("/admin/supplier-relationships", async (c) => {
  const rawStatus = c.req.query("status");
  if (rawStatus && !statuses.has(rawStatus as PartnerInterestStatus)) {
    throw new AppError(422, "VALIDATION_ERROR", "status must be received, reviewing, qualified, closed, or spam.");
  }
  const inbound = await listSupplierPartnerInterests(c.env.DB, {
    status: rawStatus as PartnerInterestStatus | undefined,
    limit: parsePositiveInt(c.req.query("limit"), 100, 500),
  });
  const research = supplierRelationshipPipeline();
  return c.json({
    research,
    inbound,
    safeguards: {
      outboundMessagesSent: false,
      outboundMutationAvailable: false,
      explicitApprovalRequired: true,
      contactDetailsScope: "platform-moderators-only",
    },
  });
});

supplierRelationshipRoutes.patch("/admin/supplier-relationships/submissions/:id", async (c) => {
  const input = await parseJson(c, triageSchema);
  const actorUserId = authenticatedUserId(c);
  const result = await triageSupplierPartnerInterest(c.env.DB, c.req.param("id"), {
    status: input.status,
    adminNotes: input.adminNotes?.trim() || null,
  });
  if (!result) throw new AppError(404, "NOT_FOUND", "Supplier or partner interest submission not found or changed during review.");

  await recordAuditEvent(c.env.DB, {
    actorUserId,
    action: "supplier_relationship.triage",
    entityType: "partner_interest_submission",
    entityId: result.after.id,
    requestId: c.get("requestId"),
    before: { status: result.before.status, adminNotes: result.before.adminNotes },
    after: { status: result.after.status, adminNotes: result.after.adminNotes },
  });

  return c.json({
    item: result.after,
    safeguards: { outboundMessagesSent: false, approvalGranted: false },
    message: "Internal triage updated. No external message was sent and no supplier approval was granted.",
  });
});
