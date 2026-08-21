import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { BomsRepository, type BomRow } from "../db/repositories/boms";
import { BuildsRepository } from "../db/repositories/builds";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertOrganizationPermission, assertScopedRead, assertScopedWrite, authenticatedUserId } from "../middleware/authorization";
import { parseJson } from "../validation";
import { recordAuditEvent } from "../services/audit";

const visibilitySchema = z.enum(["private", "organization", "unlisted", "public"]);
const bomItemSchema = z.object({
  componentId: z.string().max(100).nullable().optional(), slotKey: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500), quantity: z.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(30).optional(), selectedSupplierOfferId: z.string().max(200).nullable().optional(),
  targetUnitPriceMinor: z.number().int().nonnegative().nullable().optional(), notes: z.string().trim().max(4_000).nullable().optional(),
  extractionMethod: z.string().trim().min(1).max(60).optional(), completeness: z.string().trim().min(1).max(60).optional(),
  evidenceLocator: z.string().trim().max(1_024).nullable().optional(), confidence: z.number().min(0).max(1).nullable().optional(),
}).strict();
const createSchema = z.object({
  name: z.string().trim().min(2).max(120), projectId: z.string().uuid().nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(), visibility: visibilitySchema.default("private"),
  notes: z.string().trim().max(10_000).nullable().optional(), currency: z.string().regex(/^[A-Z]{3}$/u).default("USD"),
  items: z.array(bomItemSchema).max(500).default([]),
}).strict();
const versionSchema = z.object({
  expectedVersionId: z.string().min(1).max(200), notes: z.string().trim().max(10_000).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/u).default("USD"), items: z.array(bomItemSchema).max(500),
}).strict();
const forkSchema = z.object({ name: z.string().trim().min(2).max(120).optional(), visibility: visibilitySchema.default("private") }).strict();

export const bomRoutes = new Hono<AppBindings>();

bomRoutes.get("/boms", loadAuthSession, async (c) => {
  const userId = c.get("authSession")?.user?.id ?? null;
  const items = (await new BomsRepository(c.env.DB).list(userId)).filter((item) => item.is_demo !== 1);
  return c.json({ items, total: items.length, dataMode: "live" });
});

bomRoutes.get("/boms/:id/export", loadAuthSession, async (c) => {
  const { detail } = await readableBom(c, c.req.param("id"));
  if (c.req.query("format") === "csv") {
    const lines = ["slot,description,component_id,quantity,unit,target_unit_price_minor,selected_supplier_offer_id"];
    detail.items.forEach((item) => lines.push([item.slotKey, item.description, item.componentId, item.quantity, item.unit, item.targetUnitPriceMinor, item.selectedSupplierOfferId].map(csv).join(",")));
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${detail.slug ?? detail.id}-bom.csv"`);
    return c.body(lines.join("\n"));
  }
  c.header("Content-Disposition", `attachment; filename="${detail.slug ?? detail.id}-rpps-bom.json"`);
  return c.json({ schemaVersion: "rpps-bom/1", exportedAt: new Date().toISOString(), bom: detail });
});

bomRoutes.get("/boms/:id", loadAuthSession, async (c) => c.json({ item: (await readableBom(c, c.req.param("id"))).detail }));

bomRoutes.post("/boms", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, createSchema);
  if (body.organizationId) await assertOrganizationPermission(c.env.DB, userId, body.organizationId, "engineer");
  if (body.visibility === "organization" && !body.organizationId) throw new AppError(422, "ORGANIZATION_REQUIRED", "Organization visibility requires an organization.");
  const item = await new BomsRepository(c.env.DB).create(userId, body);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: body.organizationId, action: "bom.create", entityType: "bom", entityId: item.id, requestId: c.get("requestId"), after: { name: item.name } });
  return c.json({ item }, 201);
});

bomRoutes.post("/boms/:id/versions", loadAuthSession, requireAuth, async (c) => {
  const { bom, userId } = await writableBom(c, c.req.param("id"));
  const body = await parseJson(c, versionSchema);
  const item = await new BomsRepository(c.env.DB).createVersion(bom.id, userId, body);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: bom.organization_id, action: "bom.version.create", entityType: "bom", entityId: bom.id, requestId: c.get("requestId"), after: { versionId: item.current_version_id } });
  return c.json({ item }, 201);
});

bomRoutes.post("/boms/:id/builds", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const { detail } = await readableBom(c, c.req.param("id"));
  const body = await parseJson(c, forkSchema);
  const build = await new BuildsRepository(c.env.DB).create(userId, { name: body.name ?? `${detail.name} build`, visibility: body.visibility });
  const repository = new BuildsRepository(c.env.DB);
  for (const row of detail.items) {
    await repository.addItem(build.id, userId, {
      componentId: typeof row.componentId === "string" ? row.componentId : null,
      description: String(row.description), quantity: Number(row.quantity), unit: String(row.unit ?? "each"),
      selectedSupplierOfferId: typeof row.selectedSupplierOfferId === "string" ? row.selectedSupplierOfferId : null,
      unitCostMinor: typeof row.targetUnitPriceMinor === "number" ? row.targetUnitPriceMinor : null,
      notes: typeof row.notes === "string" ? row.notes : null,
    });
  }
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "bom.fork_to_build", entityType: "build", entityId: build.id, requestId: c.get("requestId"), after: { sourceBomId: detail.id } });
  return c.json({ item: await repository.detail(build.id) }, 201);
});

async function readableBom(c: Context<AppBindings>, id: string) {
  const detail = await new BomsRepository(c.env.DB).detail(id);
  if (!detail || detail.is_demo === 1) throw new AppError(404, "BOM_NOT_FOUND", "BOM not found.");
  const userId = c.get("authSession")?.user?.id ?? null;
  await assertScopedRead(c.env.DB, userId, detail);
  return { detail, userId };
}

async function writableBom(c: Context<AppBindings>, id: string) {
  const userId = authenticatedUserId(c);
  const bom = await new BomsRepository(c.env.DB).find(id);
  if (!bom) throw new AppError(404, "BOM_NOT_FOUND", "BOM not found.");
  await assertScopedWrite(c.env.DB, userId, bom, "engineer");
  return { bom, userId };
}

function csv(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}
