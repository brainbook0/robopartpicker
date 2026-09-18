import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { MarketplaceRepository } from "../db/repositories/marketplace";
import { AppError, parsePositiveInt } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertOrganizationPermission, authenticatedUserId, organizationRole, requirePlatformRole } from "../middleware/authorization";
import { parseJson } from "../validation";
import { recordAuditEvent } from "../services/audit";
import { createInAppNotification } from "../services/notifications";

const listingTypes = ["sell", "wanted", "service"] as const;
const grades = ["A", "B", "C", "untested", "for_parts", "not_applicable"] as const;
const visibilities = ["private", "organization", "unlisted", "public"] as const;
const listingSorts = ["newest", "price_asc", "price_desc", "parts_cost_asc"] as const;
const optionalUrl = z.string().datetime().nullable().optional();
const listingObject = z.object({
  listingType: z.enum(listingTypes), title: z.string().trim().min(4).max(160), description: z.string().trim().min(10).max(20_000),
  category: z.string().trim().min(2).max(80), conditionGrade: z.enum(grades).nullable().optional(), currency: z.string().length(3).regex(/^[A-Z]{3}$/u).nullable().optional(),
  price: z.number().nonnegative().max(100_000_000).nullable().optional(), quantity: z.number().positive().max(1_000_000), region: z.string().trim().max(40).nullable().optional(),
  visibility: z.enum(visibilities).default("public"), organizationId: z.string().uuid().nullable().optional(), sourceBuildId: z.string().uuid().nullable().optional(),
  sourceComponentId: z.string().max(100).nullable().optional(), expiresAt: optionalUrl, runtimeHours: z.number().int().nonnegative().nullable().optional(),
  provenanceText: z.string().trim().max(5_000).nullable().optional(), sellerDeclaresTestReport: z.boolean().optional(), sellerDeclaresVideo: z.boolean().optional(),
  sellerAcceptsReturns: z.boolean().optional(), serialAvailable: z.boolean().optional(),
}).strict();
const listingSchema = listingObject.refine((value) => value.visibility !== "organization" || Boolean(value.organizationId), { path: ["organizationId"], message: "Organization visibility requires an organization." });
const updateSchema = listingObject.partial().extend({ version: z.number().int().positive() }).strict();
const statusSchema = z.object({ status: z.enum(["published", "reserved", "sold", "fulfilled", "expired", "withdrawn"]) }).strict();
const inquirySchema = z.object({ subject: z.string().trim().max(160).nullable().optional(), message: z.string().trim().min(5).max(10_000) }).strict();
const messageSchema = z.object({ body: z.string().trim().min(1).max(10_000), attachmentFileId: z.string().uuid().nullable().optional() }).strict();
const offerSchema = z.object({ currency: z.string().length(3).regex(/^[A-Z]{3}$/u), amount: z.number().nonnegative().max(100_000_000), quantity: z.number().positive().max(1_000_000), message: z.string().trim().max(5_000).nullable().optional(), expiresAt: optionalUrl, submit: z.boolean().default(false) }).strict();
const offerStatusSchema = z.object({ status: z.enum(["submitted", "accepted", "declined", "withdrawn"]) }).strict();
const reportSchema = z.object({ listingId: z.string().min(1).max(200).optional(), inquiryId: z.string().uuid().optional(), reason: z.string().trim().min(3).max(100), details: z.string().trim().max(4_000).optional() }).strict()
  .refine((value) => Boolean(value.listingId) || Boolean(value.inquiryId), { message: "A report target is required." });

export const marketplaceRoutes = new Hono<AppBindings>();

marketplaceRoutes.get("/marketplace", loadAuthSession, async (c) => {
  const userId = c.get("authSession")?.user?.id ?? null;
  const type = c.req.query("type");
  if (type && !listingTypes.includes(type as typeof listingTypes[number])) throw new AppError(400, "VALIDATION_ERROR", "Unknown listing type.");
  const condition = c.req.query("condition");
  if (condition && !grades.includes(condition as typeof grades[number])) throw new AppError(400, "VALIDATION_ERROR", "Unknown condition grade.");
  const sort = c.req.query("sort") || "newest";
  if (!listingSorts.includes(sort as typeof listingSorts[number])) throw new AppError(400, "VALIDATION_ERROR", "Unknown Marketplace sort order.");
  const minPrice = optionalNumber(c.req.query("minPrice"), "minPrice");
  const maxPrice = optionalNumber(c.req.query("maxPrice"), "maxPrice");
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) throw new AppError(400, "VALIDATION_ERROR", "minPrice cannot exceed maxPrice.");
  const limit = parsePositiveInt(c.req.query("limit"), 50, 100);
  const page = parsePositiveInt(c.req.query("page"), 1, 10_000);
  const result = await new MarketplaceRepository(c.env.DB).list(userId, {
    type, q: c.req.query("q")?.trim().slice(0, 100) || undefined, category: c.req.query("category"), region: c.req.query("region"), condition,
    sort: sort as typeof listingSorts[number],
    status: c.req.query("status"), mine: c.req.query("mine") === "true", minPrice, maxPrice, limit, offset: (page - 1) * limit,
  });
  // Public marketplace listings are hot and near-static. Cache anonymous,
  // non-user-scoped list responses at the edge for 5 minutes.
  if (!userId && c.req.query("mine") !== "true") {
    c.header("cache-control", "public, max-age=300, stale-while-revalidate=3600");
    c.header("CDN-Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  }
  return c.json({ ...result, page, limit, pages: Math.max(1, Math.ceil(result.total / limit)), dataMode: result.items.some((item) => item.isDemo) ? "demo" : "live" });
});

marketplaceRoutes.get("/marketplace/inquiries", loadAuthSession, requireAuth, async (c) => {
  return c.json({ items: await new MarketplaceRepository(c.env.DB).listInquiries(authenticatedUserId(c)) });
});

marketplaceRoutes.get("/marketplace/inquiries/:id", loadAuthSession, requireAuth, async (c) => {
  return c.json(await new MarketplaceRepository(c.env.DB).inquiry(c.req.param("id"), authenticatedUserId(c)));
});

marketplaceRoutes.get("/marketplace/:id", loadAuthSession, async (c) => {
  const userId = c.get("authSession")?.user?.id ?? null;
  const result = await new MarketplaceRepository(c.env.DB).find(c.req.param("id"), userId);
  if (!result) throw new AppError(404, "LISTING_NOT_FOUND", "Listing not found.");
  const publicReadable = ["published", "reserved"].includes(result.row.status) && ["public", "unlisted"].includes(result.row.visibility);
  let authorized = publicReadable || (userId !== null && result.row.seller_user_id === userId);
  if (!authorized && userId && result.row.organization_id) authorized = Boolean(await organizationRole(c.env.DB, userId, result.row.organization_id));
  if (!authorized) throw new AppError(userId ? 403 : 401, userId ? "LISTING_ACCESS_DENIED" : "AUTHENTICATION_REQUIRED", "This listing is private.");
  return c.json({ item: result.item, dataMode: result.item.isDemo ? "demo" : "live" });
});

marketplaceRoutes.post("/marketplace", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, listingSchema);
  if (body.organizationId) await assertOrganizationPermission(c.env.DB, userId, body.organizationId, "procure");
  const item = await new MarketplaceRepository(c.env.DB).create(userId, body);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: body.organizationId, action: "marketplace.listing.create", entityType: "marketplace_listing", entityId: item.id, requestId: c.get("requestId"), after: item });
  return c.json({ item }, 201);
});

marketplaceRoutes.patch("/marketplace/:id", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, updateSchema);
  const repository = new MarketplaceRepository(c.env.DB);
  const before = await repository.find(c.req.param("id"), userId);
  const item = await repository.update(c.req.param("id"), userId, body.version, body);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: item.organizationId, action: "marketplace.listing.update", entityType: "marketplace_listing", entityId: item.id, requestId: c.get("requestId"), before: before?.item, after: item });
  return c.json({ item });
});

marketplaceRoutes.put("/marketplace/:id/status", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, statusSchema);
  const item = await new MarketplaceRepository(c.env.DB).setStatus(c.req.param("id"), userId, body.status);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: item.organizationId, action: `marketplace.listing.${body.status}`, entityType: "marketplace_listing", entityId: item.id, requestId: c.get("requestId") });
  return c.json({ item, commercialStateOnly: true, paymentProcessed: false });
});

marketplaceRoutes.delete("/marketplace/:id/images/:fileId", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  await new MarketplaceRepository(c.env.DB).removeImage(c.req.param("id"), userId, c.req.param("fileId"));
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "marketplace.listing_image.remove", entityType: "marketplace_listing", entityId: c.req.param("id"), requestId: c.get("requestId"), before: { fileId: c.req.param("fileId") } });
  return c.body(null, 204);
});

marketplaceRoutes.put("/marketplace/:id/save", loadAuthSession, requireAuth, async (c) => {
  await c.env.DB.prepare(`INSERT INTO marketplace_saves (user_id, listing_id, created_at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING`)
    .bind(authenticatedUserId(c), c.req.param("id"), new Date().toISOString()).run();
  return c.json({ saved: true });
});

marketplaceRoutes.delete("/marketplace/:id/save", loadAuthSession, requireAuth, async (c) => {
  await c.env.DB.prepare("DELETE FROM marketplace_saves WHERE user_id = ?1 AND listing_id = ?2").bind(authenticatedUserId(c), c.req.param("id")).run();
  return c.body(null, 204);
});

marketplaceRoutes.post("/marketplace/:id/inquiries", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, inquirySchema);
  const inquiry = await new MarketplaceRepository(c.env.DB).createInquiry(userId, c.req.param("id"), body.subject ?? null, body.message);
  await createInAppNotification(c.env.DB, { userId: inquiry.sellerUserId, type: "marketplace_inquiry", title: "New Marketplace inquiry", body: body.subject ?? inquiry.listingTitle, internalPath: `/marketplace/${encodeURIComponent(c.req.param("id"))}`, data: { inquiryId: inquiry.id } });
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "marketplace.inquiry.create", entityType: "marketplace_inquiry", entityId: inquiry.id, requestId: c.get("requestId") });
  return c.json({ item: inquiry, sent: true, deliveryScope: "RoboPartPicker internal messaging only", paymentProcessed: false }, 201);
});

marketplaceRoutes.post("/marketplace/inquiries/:id/messages", loadAuthSession, requireAuth, async (c) => {
  const body = await parseJson(c, messageSchema);
  const item = await new MarketplaceRepository(c.env.DB).addMessage(c.req.param("id"), authenticatedUserId(c), body.body, body.attachmentFileId);
  return c.json({ item }, 201);
});

marketplaceRoutes.post("/marketplace/inquiries/:id/offers", loadAuthSession, requireAuth, async (c) => {
  const body = await parseJson(c, offerSchema);
  const item = await new MarketplaceRepository(c.env.DB).createOffer(c.req.param("id"), authenticatedUserId(c), body);
  return c.json({ item, paymentProcessed: false, legallyBinding: false }, 201);
});

marketplaceRoutes.put("/marketplace/offers/:id/status", loadAuthSession, requireAuth, async (c) => {
  const body = await parseJson(c, offerStatusSchema);
  await new MarketplaceRepository(c.env.DB).updateOfferStatus(c.req.param("id"), authenticatedUserId(c), body.status);
  return c.json({ status: body.status, paymentProcessed: false });
});

marketplaceRoutes.post("/marketplace/reports", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, reportSchema);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO marketplace_reports
    (id, listing_id, inquiry_id, reporter_user_id, reason, details, status, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7)`)
    .bind(id, body.listingId ?? null, body.inquiryId ?? null, userId, body.reason, body.details ?? null, new Date().toISOString()).run();
  return c.json({ id, status: "open" }, 201);
});

marketplaceRoutes.get("/admin/marketplace/reports", loadAuthSession, requireAuth, requirePlatformRole("moderator", "administrator"), async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM marketplace_reports WHERE status IN ('open', 'reviewing') ORDER BY created_at`).all();
  return c.json({ items: rows.results });
});

function optionalNumber(value: string | undefined, field: string): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new AppError(400, "VALIDATION_ERROR", `${field} must be a non-negative number.`);
  return parsed;
}
