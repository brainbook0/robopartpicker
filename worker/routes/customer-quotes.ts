import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { BomsRepository, type BomDetail } from "../db/repositories/boms";
import { CustomerQuoteRequestsRepository, type CustomerQuoteContact } from "../db/repositories/customer-quote-requests";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertScopedRead, authenticatedUserId } from "../middleware/authorization";
import { estimatePreliminaryShipping } from "../services/shipping-estimate";
import { parseJson } from "../validation";
import { recordAuditEvent } from "../services/audit";
import { completedQuoteAllowed } from "../../src/shared/bomPublication";

const nullableText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const createSchema = z.object({
  projectId: z.string().trim().min(1).max(200).optional(),
  bomId: z.string().trim().min(1).max(200).optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  phone: nullableText(40),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: nullableText(200),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(32),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  deliveryNotes: nullableText(2_000),
  consent: z.literal(true),
}).strict().refine((value) => Boolean(value.projectId || value.bomId), { message: "A project or BOM target is required." });

export const customerQuoteRoutes = new Hono<AppBindings>();

customerQuoteRoutes.post("/customer-quote-requests", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const input = await parseJson(c, createSchema);
  const target = await resolveTarget(c.env.DB, userId, { projectId: input.projectId, bomId: input.bomId });
  const shipping = estimatePreliminaryShipping({
    countryCode: input.countryCode,
    region: input.region,
    shipmentCount: target.shipmentCount,
    items: target.shippingItems,
  });
  const consentAt = new Date().toISOString();
  const retentionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1_000).toISOString();
  const contact: CustomerQuoteContact = {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email.toLowerCase(),
    phone: input.phone || null,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2 || null,
    city: input.city,
    region: input.region,
    postalCode: input.postalCode,
    countryCode: input.countryCode,
    deliveryNotes: input.deliveryNotes || null,
  };
  const item = await new CustomerQuoteRequestsRepository(c.env.DB).create({
    requesterUserId: userId,
    projectId: target.projectId,
    bomId: target.bomId,
    bomVersionId: target.bomVersionId,
    contact,
    materialsEstimateMinor: target.materialsEstimateMinor,
    shippingEstimateMinor: shipping.amountMinor,
    shippingMethodVersion: shipping.methodVersion,
    shippingConfidence: shipping.confidence,
    estimateSnapshot: {
      schemaVersion: "customer-quote-estimate/1",
      target: { projectId: target.projectId, bomId: target.bomId, bomVersionId: target.bomVersionId, name: target.name },
      materials: { amountMinor: target.materialsEstimateMinor, currency: "USD", method: target.materialsMethod, lineCount: target.lineCount },
      shipping,
      generatedAt: consentAt,
      humanReviewRequired: true,
    },
    consentAt,
    retentionExpiresAt,
  });
  await recordAuditEvent(c.env.DB, {
    actorUserId: userId,
    action: "customer_quote_request.create",
    entityType: "customer_quote_request",
    entityId: item.id,
    requestId: c.get("requestId"),
    after: { projectId: target.projectId, bomId: target.bomId, materialsEstimateMinor: item.materialsEstimateMinor, shippingEstimateMinor: item.shippingEstimateMinor, status: item.status },
  });
  return c.json({ item }, 201);
});

customerQuoteRoutes.get("/customer-quote-requests/:id", loadAuthSession, requireAuth, async (c) => {
  const item = await new CustomerQuoteRequestsRepository(c.env.DB).getForUser(c.req.param("id"), authenticatedUserId(c));
  if (!item) throw new AppError(404, "CUSTOMER_QUOTE_REQUEST_NOT_FOUND", "Quote request not found.");
  return c.json({ item });
});

type ResolvedTarget = {
  projectId: string | null;
  bomId: string | null;
  bomVersionId: string | null;
  name: string;
  materialsEstimateMinor: number;
  materialsMethod: string;
  lineCount: number;
  shipmentCount: number;
  shippingItems: Array<{ quantity: number; weightGrams: number | null; category: string }>;
};

async function resolveTarget(db: D1Database, userId: string, input: { projectId?: string; bomId?: string }): Promise<ResolvedTarget> {
  if (input.bomId) {
    const bom = await new BomsRepository(db).detail(input.bomId);
    if (!bom || bom.is_demo === 1) throw new AppError(404, "BOM_NOT_FOUND", "BOM not found.");
    await assertScopedRead(db, userId, bom);
    if (input.projectId && bom.project_id && input.projectId !== bom.project_id) throw new AppError(422, "QUOTE_TARGET_MISMATCH", "The project and BOM do not belong together.");
    return resolveBomTarget(bom, input.projectId ?? bom.project_id ?? null);
  }

  const project = await db.prepare(`SELECT id, name, owner_user_id, organization_id, visibility, estimated_cost_minor, robot_category, bom_id, current_version_id
    FROM projects WHERE id = ?1 AND deleted_at IS NULL AND is_demo = 0`).bind(input.projectId!).first<Record<string, unknown>>();
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  await assertScopedRead(db, userId, {
    owner_user_id: textOrNull(project.owner_user_id),
    organization_id: textOrNull(project.organization_id),
    visibility: project.visibility as "private" | "organization" | "unlisted" | "public",
  });
  const linkedBomId = textOrNull(project.bom_id);
  if (linkedBomId) {
    const bom = await new BomsRepository(db).detail(linkedBomId);
    if (bom && bom.is_demo !== 1) return resolveBomTarget(bom, String(project.id));
  }
  throw new AppError(409, "PROJECT_BOM_NOT_QUOTE_READY", "This project has no source-validated BOM ready for a quote request.");
}

function resolveBomTarget(bom: BomDetail, projectId: string | null): ResolvedTarget {
  if (projectId && (!bom.version || !completedQuoteAllowed(bom.version.publicationState, bom.version.quoteReady === 1))) {
    throw new AppError(409, "PROJECT_BOM_NOT_QUOTE_READY", "This project's current BOM is not ready for a quote request.");
  }
  let materialsEstimateMinor = 0;
  const shippingItems: ResolvedTarget["shippingItems"] = [];
  for (const item of bom.items) {
    const classification = typeof item.lineClassification === "string" ? item.lineClassification : "unresolved";
    if (Number(item.included ?? 1) !== 1 || classification === "non-procurement") continue;
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const category = textOrNull(item.componentCategory) ?? classification;
    const unitMinor = positiveInteger(item.targetUnitPriceMinor) ?? positiveInteger(item.selectedUnitPriceMinor) ?? positiveInteger(item.lowestUnitPriceMinor) ?? fallbackUnitCost(category);
    materialsEstimateMinor += Math.round(unitMinor * quantity);
    shippingItems.push({ quantity, weightGrams: null, category });
  }
  const lineCount = shippingItems.length;
  return {
    projectId,
    bomId: bom.id,
    bomVersionId: bom.version?.id ?? null,
    name: bom.name,
    materialsEstimateMinor: Math.max(materialsEstimateMinor, 100),
    materialsMethod: bom.totals.unpricedLines > 0 ? "Known BOM prices plus conservative category estimates for unpriced lines." : "Current BOM line prices.",
    lineCount,
    shipmentCount: Math.max(1, Math.min(4, Math.ceil(Math.max(1, lineCount) / 8))),
    shippingItems: shippingItems.length ? shippingItems : [{ quantity: 1, weightGrams: null, category: "other" }],
  };
}

function fallbackUnitCost(category: string): number {
  const values: Record<string, number> = { actuator: 45_000, hand: 25_000, sensor: 12_000, compute: 18_000, driver: 9_000, reducer: 30_000, fabricated: 5_000, optional: 5_000, unresolved: 7_500, other: 7_500 };
  return values[category.toLowerCase()] ?? values.other;
}
function positiveInteger(value: unknown): number | null { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
function textOrNull(value: unknown): string | null { return typeof value === "string" ? value : null; }
