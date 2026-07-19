import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { BuildsRepository, type BuildRow } from "../db/repositories/builds";
import { ProjectsRepository } from "../db/repositories/projects";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertOrganizationPermission, assertScopedRead, assertScopedWrite, authenticatedUserId } from "../middleware/authorization";
import { parseJson } from "../validation";
import { recordAuditEvent } from "../services/audit";

const visibilities = ["private", "organization", "unlisted", "public"] as const;
const buildStatuses = ["planning", "sourcing", "building", "testing", "complete", "paused", "archived"] as const;
const itemStatuses = ["needed", "selected", "ordered", "purchased", "fabricated", "installed", "replaced", "skipped"] as const;
const stepStatuses = ["pending", "blocked", "in_progress", "complete", "skipped"] as const;
const createSchema = z.object({ name: z.string().trim().min(2).max(120), organizationId: z.string().uuid().nullable().optional(), sourceProjectId: z.string().uuid().nullable().optional(), visibility: z.enum(visibilities).default("private") }).strict();
const updateSchema = z.object({ version: z.number().int().positive(), name: z.string().trim().min(2).max(120).optional(), organizationId: z.string().uuid().nullable().optional(), visibility: z.enum(visibilities).optional(), status: z.enum(buildStatuses).optional(), progressPercent: z.number().int().min(0).max(100).optional() }).strict();
const itemSchema = z.object({ componentId: z.string().max(100).nullable().optional(), description: z.string().trim().min(1).max(500), quantity: z.number().positive().max(1_000_000), unit: z.string().trim().min(1).max(30).optional(), selectedSupplierOfferId: z.string().max(200).nullable().optional(), unitCostMinor: z.number().int().nonnegative().nullable().optional(), notes: z.string().trim().max(4_000).nullable().optional(), substitutedForItemId: z.string().uuid().nullable().optional() }).strict();
const itemUpdateSchema = z.object({ quantity: z.number().positive().max(1_000_000).optional(), selectedSupplierOfferId: z.string().max(200).nullable().optional(), unitCostMinor: z.number().int().nonnegative().nullable().optional(), status: z.enum(itemStatuses).optional(), notes: z.string().trim().max(4_000).nullable().optional() }).strict();
const stepSchema = z.object({ title: z.string().trim().min(1).max(300), body: z.string().trim().max(20_000).nullable().optional(), dependsOn: z.array(z.string().uuid()).max(50).optional() }).strict();
const stepUpdateSchema = z.object({ title: z.string().trim().min(1).max(300).optional(), body: z.string().trim().max(20_000).nullable().optional(), status: z.enum(stepStatuses).optional() }).strict();
const snapshotSchema = z.object({ summary: z.string().trim().min(2).max(500) }).strict();
const problemSchema = z.object({ title: z.string().trim().min(2).max(300), description: z.string().trim().min(2).max(20_000), severity: z.enum(["low", "medium", "high", "critical"]) }).strict();
const resolutionSchema = z.object({ summary: z.string().trim().min(2).max(5_000), rootCause: z.string().trim().max(10_000).nullable().optional(), evidenceId: z.string().uuid().nullable().optional() }).strict();
const decisionSchema = z.object({ title: z.string().trim().min(2).max(300), context: z.string().trim().max(10_000).nullable().optional(), decision: z.string().trim().min(2).max(10_000), consequences: z.string().trim().max(10_000).nullable().optional() }).strict();
const httpUrl = z.string().url().max(2_048).refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Only HTTP(S) URLs are allowed.");
const configurationSchema = z.object({
  name: z.string().trim().min(1).max(200), format: z.string().trim().min(1).max(50),
  contentText: z.string().max(200_000).nullable().optional(), fileId: z.string().uuid().nullable().optional(),
}).strict().refine((value) => Boolean(value.contentText?.trim() || value.fileId), { message: "Configuration content or an attached file is required." });
const firmwareSchema = z.object({
  name: z.string().trim().min(1).max(200), repositoryUrl: httpUrl.nullable().optional(), revision: z.string().trim().max(200).nullable().optional(),
  fileId: z.string().uuid().nullable().optional(), licenseSpdx: z.string().trim().max(100).nullable().optional(), notes: z.string().trim().max(10_000).nullable().optional(),
}).strict().refine((value) => Boolean(value.repositoryUrl || value.fileId), { message: "A firmware repository or attached file is required." });
const calibrationSchema = z.object({
  name: z.string().trim().min(1).max(200), procedureText: z.string().trim().max(20_000).nullable().optional(),
  resultData: z.record(z.string(), z.unknown()).default({}), status: z.enum(["pending", "passed", "failed", "superseded"]).default("pending"),
}).strict().refine((value) => JSON.stringify(value.resultData).length <= 100_000, { message: "Calibration result data is too large." });
const testSchema = z.object({
  name: z.string().trim().min(1).max(200), methodText: z.string().trim().min(1).max(20_000), expectedText: z.string().trim().max(20_000).nullable().optional(),
  observedText: z.string().trim().max(20_000).nullable().optional(), result: z.enum(["pending", "passed", "failed", "inconclusive"]).default("pending"),
  evidenceFileId: z.string().uuid().nullable().optional(),
}).strict();

export const buildRoutes = new Hono<AppBindings>();

buildRoutes.get("/builds", loadAuthSession, async (c) => {
  const userId = c.get("authSession")?.user?.id ?? null;
  return c.json({ items: await new BuildsRepository(c.env.DB).list(userId, c.req.query("mine") === "true") });
});

buildRoutes.post("/builds", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, createSchema);
  if (body.organizationId) await assertOrganizationPermission(c.env.DB, userId, body.organizationId, "build");
  if (body.visibility === "organization" && !body.organizationId) throw new AppError(422, "ORGANIZATION_REQUIRED", "Organization visibility requires an organization.");
  if (body.sourceProjectId) {
    const project = await new ProjectsRepository(c.env.DB).find(body.sourceProjectId);
    if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Source project not found.");
    await assertScopedRead(c.env.DB, userId, project.row);
  }
  const item = await new BuildsRepository(c.env.DB).create(userId, body);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: body.organizationId, action: "build.create", entityType: "build", entityId: item.id, requestId: c.get("requestId"), after: { name: item.name, sourceProjectId: item.source_project_id } });
  return c.json({ item }, 201);
});

buildRoutes.get("/builds/:id/export", loadAuthSession, async (c) => {
  const { detail } = await readableBuild(c, c.req.param("id"));
  const format = c.req.query("format") === "csv" ? "csv" : "json";
  if (format === "csv") {
    const lines = ["description,component_id,quantity,unit,status,unit_cost_minor,supplier_offer_id"];
    for (const item of detail.items) lines.push([item.description, item.componentId, item.quantity, item.unit, item.status, item.unitCostMinor, item.selectedSupplierOfferId].map(csv).join(","));
    c.header("Content-Type", "text/csv; charset=utf-8"); c.header("Content-Disposition", `attachment; filename="${detail.slug}-bom.csv"`);
    return c.body(lines.join("\n"));
  }
  c.header("Content-Disposition", `attachment; filename="${detail.slug}-build.json"`);
  return c.json({ schemaVersion: "robopartpicker-build/1", exportedAt: new Date().toISOString(), build: detail });
});

buildRoutes.get("/builds/:id", loadAuthSession, async (c) => {
  const { detail } = await readableBuild(c, c.req.param("id"));
  return c.json({ item: detail });
});

buildRoutes.patch("/builds/:id", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  const { version, ...changes } = await parseJson(c, updateSchema);
  const organizationId = changes.organizationId === undefined ? build.organization_id : changes.organizationId;
  const visibility = changes.visibility ?? build.visibility;
  const scopeChanged = organizationId !== build.organization_id || visibility !== build.visibility;
  if (scopeChanged && build.organization_id) {
    await assertOrganizationPermission(c.env.DB, userId, build.organization_id, "admin");
  }
  if (organizationId && organizationId !== build.organization_id) {
    await assertOrganizationPermission(c.env.DB, userId, organizationId, "admin");
  }
  if (visibility === "organization" && !organizationId) {
    throw new AppError(422, "ORGANIZATION_REQUIRED", "Organization visibility requires an organization.");
  }
  const item = await new BuildsRepository(c.env.DB).updateBuild(build.id, version, { ...changes, organizationId, visibility });
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: build.organization_id, action: "build.update", entityType: "build", entityId: build.id, requestId: c.get("requestId"), after: changes });
  return c.json({ item });
});

buildRoutes.post("/builds/:id/items", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  const body = await parseJson(c, itemSchema);
  const item = await new BuildsRepository(c.env.DB).addItem(build.id, userId, body);
  return c.json({ item }, 201);
});

buildRoutes.patch("/builds/:id/items/:itemId", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  const body = await parseJson(c, itemUpdateSchema);
  if (body.selectedSupplierOfferId) {
    const valid = await c.env.DB.prepare(`SELECT 1 FROM supplier_offers so JOIN build_items bi ON bi.component_id = so.component_id
      WHERE so.id = ?1 AND bi.id = ?2 AND bi.build_id = ?3`).bind(body.selectedSupplierOfferId, c.req.param("itemId"), build.id).first();
    if (!valid) throw new AppError(422, "OFFER_COMPONENT_MISMATCH", "The supplier offer is not for this component.");
  }
  const item = await new BuildsRepository(c.env.DB).updateItem(build.id, c.req.param("itemId"), userId, body);
  return c.json({ item });
});

buildRoutes.delete("/builds/:id/items/:itemId", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM build_items WHERE id = ?1 AND build_id = ?2").bind(c.req.param("itemId"), build.id),
    c.env.DB.prepare(`INSERT INTO build_activity (id, build_id, actor_user_id, event_type, entity_type, entity_id, summary, created_at)
      VALUES (?1, ?2, ?3, 'build.item.deleted', 'build_item', ?4, 'Deleted build item', ?5)`)
      .bind(crypto.randomUUID(), build.id, userId, c.req.param("itemId"), new Date().toISOString()),
  ]);
  return c.body(null, 204);
});

buildRoutes.post("/builds/:id/steps", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  return c.json({ item: await new BuildsRepository(c.env.DB).addStep(build.id, userId, await parseJson(c, stepSchema)) }, 201);
});

buildRoutes.patch("/builds/:id/steps/:stepId", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  return c.json({ item: await new BuildsRepository(c.env.DB).updateStep(build.id, c.req.param("stepId"), userId, await parseJson(c, stepUpdateSchema)) });
});

buildRoutes.post("/builds/:id/configurations", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  const body = await parseJson(c, configurationSchema);
  const item = await new BuildsRepository(c.env.DB).addConfiguration(build.id, userId, body);
  await auditTechnicalMutation(c, userId, build, "build.configuration.create", String(item.id), { name: body.name, format: body.format, fileId: body.fileId ?? null });
  return c.json({ item }, 201);
});

buildRoutes.delete("/builds/:id/configurations/:recordId", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  await new BuildsRepository(c.env.DB).deleteTechnicalRecord(build.id, userId, "configuration", c.req.param("recordId"));
  await auditTechnicalMutation(c, userId, build, "build.configuration.delete", c.req.param("recordId"));
  return c.body(null, 204);
});

buildRoutes.post("/builds/:id/firmware", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  const body = await parseJson(c, firmwareSchema);
  const item = await new BuildsRepository(c.env.DB).addFirmware(build.id, userId, body);
  await auditTechnicalMutation(c, userId, build, "build.firmware.create", String(item.id), { name: body.name, revision: body.revision ?? null, fileId: body.fileId ?? null });
  return c.json({ item }, 201);
});

buildRoutes.delete("/builds/:id/firmware/:recordId", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  await new BuildsRepository(c.env.DB).deleteTechnicalRecord(build.id, userId, "firmware", c.req.param("recordId"));
  await auditTechnicalMutation(c, userId, build, "build.firmware.delete", c.req.param("recordId"));
  return c.body(null, 204);
});

buildRoutes.post("/builds/:id/calibrations", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  const body = await parseJson(c, calibrationSchema);
  const item = await new BuildsRepository(c.env.DB).addCalibration(build.id, userId, body);
  await auditTechnicalMutation(c, userId, build, "build.calibration.create", String(item.id), { name: body.name, status: body.status });
  return c.json({ item }, 201);
});

buildRoutes.delete("/builds/:id/calibrations/:recordId", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  await new BuildsRepository(c.env.DB).deleteTechnicalRecord(build.id, userId, "calibration", c.req.param("recordId"));
  await auditTechnicalMutation(c, userId, build, "build.calibration.delete", c.req.param("recordId"));
  return c.body(null, 204);
});

buildRoutes.post("/builds/:id/tests", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  const body = await parseJson(c, testSchema);
  const item = await new BuildsRepository(c.env.DB).addTest(build.id, userId, body);
  await auditTechnicalMutation(c, userId, build, "build.test.create", String(item.id), { name: body.name, result: body.result, evidenceFileId: body.evidenceFileId ?? null });
  return c.json({ item }, 201);
});

buildRoutes.delete("/builds/:id/tests/:recordId", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  await new BuildsRepository(c.env.DB).deleteTechnicalRecord(build.id, userId, "test", c.req.param("recordId"));
  await auditTechnicalMutation(c, userId, build, "build.test.delete", c.req.param("recordId"));
  return c.body(null, 204);
});

buildRoutes.post("/builds/:id/versions", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  const body = await parseJson(c, snapshotSchema);
  await new BuildsRepository(c.env.DB).createSnapshot(build.id, userId, body.summary);
  return c.json({ created: true }, 201);
});

buildRoutes.post("/builds/:id/problems", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  const body = await parseJson(c, problemSchema); const id = crypto.randomUUID(); const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO build_problems (id, build_id, title, description, severity, status, reported_by_user_id, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, 'open', ?6, ?7, ?7)`).bind(id, build.id, body.title, body.description, body.severity, userId, now).run();
  return c.json({ id }, 201);
});

buildRoutes.post("/builds/:id/problems/:problemId/resolutions", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  const body = await parseJson(c, resolutionSchema); const id = crypto.randomUUID(); const now = new Date().toISOString();
  const problem = await c.env.DB.prepare("SELECT id FROM build_problems WHERE id = ?1 AND build_id = ?2").bind(c.req.param("problemId"), build.id).first();
  if (!problem) throw new AppError(404, "BUILD_PROBLEM_NOT_FOUND", "Build problem not found.");
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO build_resolutions (id, build_problem_id, summary, root_cause, evidence_id, resolved_by_user_id, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(id, c.req.param("problemId"), body.summary, body.rootCause ?? null, body.evidenceId ?? null, userId, now),
    c.env.DB.prepare("UPDATE build_problems SET status = 'resolved', updated_at = ?1 WHERE id = ?2").bind(now, c.req.param("problemId")),
  ]);
  return c.json({ id }, 201);
});

buildRoutes.post("/builds/:id/decisions", loadAuthSession, requireAuth, async (c) => {
  const { userId, build } = await writableBuild(c, c.req.param("id"));
  const body = await parseJson(c, decisionSchema); const id = crypto.randomUUID(); const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO build_decisions (id, build_id, title, context, decision, consequences, decided_by_user_id, decided_at, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`).bind(id, build.id, body.title, body.context ?? null, body.decision, body.consequences ?? null, userId, now).run();
  return c.json({ id }, 201);
});

async function readableBuild(c: Context<AppBindings>, id: string) {
  const repository = new BuildsRepository(c.env.DB);
  const detail = await repository.detail(id);
  if (!detail) throw new AppError(404, "BUILD_NOT_FOUND", "Build not found.");
  const userId = c.get("authSession")?.user?.id ?? null;
  await assertScopedRead(c.env.DB, userId, detail);
  return { detail, userId };
}

async function writableBuild(c: Context<AppBindings>, id: string) {
  const userId = authenticatedUserId(c);
  const repository = new BuildsRepository(c.env.DB);
  const build = await repository.find(id);
  if (!build) throw new AppError(404, "BUILD_NOT_FOUND", "Build not found.");
  await assertScopedWrite(c.env.DB, userId, build, "build");
  return { build, userId };
}

async function auditTechnicalMutation(c: Context<AppBindings>, userId: string, build: BuildRow, action: string, entityId: string, after?: unknown) {
  await recordAuditEvent(c.env.DB, { actorUserId: userId, organizationId: build.organization_id, action, entityType: "build", entityId, requestId: c.get("requestId"), after });
}

function csv(value: unknown): string { const text = value == null ? "" : String(value); return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text; }
