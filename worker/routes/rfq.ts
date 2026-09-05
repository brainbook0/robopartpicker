import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { RfqRepository } from "../db/repositories/rfq";
import { SourcingOptimizerService } from "../services/sourcing-optimizer";
import { isRfqAction, type RfqAction } from "../../src/shared/rfq";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertScopedRead, authenticatedUserId, organizationRole } from "../middleware/authorization";
import { parseJson } from "../validation";
import { BomsRepository } from "../db/repositories/boms";
import { ProjectsRepository } from "../db/repositories/projects";

const createSchema = z.object({
  projectId: z.string().min(1).max(200).optional(),
  bomId: z.string().min(1).max(200).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
}).strict().refine((value) => Boolean(value.projectId) !== Boolean(value.bomId), { message: "Exactly one of projectId or bomId is required." });

const transitionSchema = z.object({ action: z.string().trim().min(1).max(40) }).strict();

const responseItemSchema = z.object({
  lineKey: z.string().trim().min(1).max(200),
  quoteUnitPriceMinor: z.number().int().nonnegative().nullable().optional(),
  quoteCurrency: z.string().regex(/^[A-Z]{3}$/u).nullable().optional(),
  supplierId: z.string().max(200).nullable().optional(),
  supplierSku: z.string().max(200).nullable().optional(),
  leadTimeDays: z.number().int().nonnegative().nullable().optional(),
  isSubstitute: z.boolean().optional(),
});
const responsesSchema = z.object({ items: z.array(responseItemSchema).min(1).max(500) }).strict();

export const rfqRoutes = new Hono<AppBindings>();

rfqRoutes.post("/rfq", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, createSchema);
  let bomId: string | null = null;
  let projectId: string | null = null;
  let allowUnpublished = false;
  if (body.bomId) {
    const bom = await new BomsRepository(c.env.DB).find(body.bomId);
    if (!bom) throw new AppError(404, "BOM_NOT_FOUND", "BOM not found.");
    await assertScopedRead(c.env.DB, userId, bom);
    bomId = bom.id;
    allowUnpublished = bom.owner_user_id === userId || Boolean(bom.organization_id && await organizationRole(c.env.DB, userId, bom.organization_id));
  } else {
    const project = await new ProjectsRepository(c.env.DB).find(body.projectId!);
    if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
    await assertScopedRead(c.env.DB, userId, project.row);
    projectId = project.row.id;
    allowUnpublished = project.row.owner_user_id === userId || Boolean(project.row.organization_id && await organizationRole(c.env.DB, userId, project.row.organization_id));
  }
  const service = new SourcingOptimizerService(c.env.DB);
  const estimate = bomId
    ? await service.estimateForBom(bomId, {}, allowUnpublished)
    : await service.estimateForProject(projectId!, {}, allowUnpublished);
  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString()
    : null;
  const request = await new RfqRepository(c.env.DB).create(userId, {
    projectId,
    bomId,
    estimate,
    expiresAt,
  });
  return c.json({ item: request }, 201);
});

rfqRoutes.get("/rfq/:id", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const repository = new RfqRepository(c.env.DB);
  const request = await repository.get(c.req.param("id"));
  if (!request) throw new AppError(404, "RFQ_NOT_FOUND", "Quote request not found.");
  if (request.createdByUserId !== userId) throw new AppError(403, "RFQ_ACCESS_DENIED", "You cannot view this quote request.");
  return c.json({ item: request, lines: await repository.listLineItems(request.id) });
});

rfqRoutes.post("/rfq/:id/transition", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, transitionSchema);
  if (!isRfqAction(body.action)) throw new AppError(400, "VALIDATION_ERROR", "Unknown transition action.");
  const repository = new RfqRepository(c.env.DB);
  const request = await repository.get(c.req.param("id"));
  if (!request) throw new AppError(404, "RFQ_NOT_FOUND", "Quote request not found.");
  if (request.createdByUserId !== userId) throw new AppError(403, "RFQ_ACCESS_DENIED", "You cannot modify this quote request.");
  const status = await repository.transition(request.id, body.action as RfqAction);
  return c.json({ item: { ...request, status } });
});

rfqRoutes.post("/rfq/:id/responses", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const repository = new RfqRepository(c.env.DB);
  const request = await repository.get(c.req.param("id"));
  if (!request) throw new AppError(404, "RFQ_NOT_FOUND", "Quote request not found.");
  if (request.createdByUserId !== userId) throw new AppError(403, "RFQ_ACCESS_DENIED", "You cannot modify this quote request.");
  const body = await parseJson(c, responsesSchema);
  await repository.recordResponse(request.id, body.items);
  return c.json({ item: await repository.get(request.id) });
});

rfqRoutes.post("/rfq/:id/reconcile", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const repository = new RfqRepository(c.env.DB);
  const request = await repository.get(c.req.param("id"));
  if (!request) throw new AppError(404, "RFQ_NOT_FOUND", "Quote request not found.");
  if (request.createdByUserId !== userId) throw new AppError(403, "RFQ_ACCESS_DENIED", "You cannot modify this quote request.");
  await repository.reconcile(request.id);
  return c.json({ item: await repository.get(request.id) });
});

rfqRoutes.post("/rfq/:id/approve", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const repository = new RfqRepository(c.env.DB);
  const request = await repository.get(c.req.param("id"));
  if (!request) throw new AppError(404, "RFQ_NOT_FOUND", "Quote request not found.");
  if (request.createdByUserId !== userId) throw new AppError(403, "RFQ_ACCESS_DENIED", "You cannot approve this quote request.");
  await repository.approve(request.id);
  return c.json({ item: await repository.get(request.id) });
});

rfqRoutes.post("/rfq/:id/cancel", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const repository = new RfqRepository(c.env.DB);
  const request = await repository.get(c.req.param("id"));
  if (!request) throw new AppError(404, "RFQ_NOT_FOUND", "Quote request not found.");
  if (request.createdByUserId !== userId) throw new AppError(403, "RFQ_ACCESS_DENIED", "You cannot cancel this quote request.");
  await repository.cancel(request.id);
  return c.json({ item: await repository.get(request.id) });
});
