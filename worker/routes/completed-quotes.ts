import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { BomsRepository } from "../db/repositories/boms";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertScopedRead, authenticatedUserId } from "../middleware/authorization";
import { CompletedQuotesService } from "../services/completed-quotes";
import { parseJson } from "../validation";
import { recordAuditEvent } from "../services/audit";

const emailSchema = z.string().trim().email().max(254);
const createSchema = z.object({
  bomId: z.string().trim().min(1).max(200),
  recipients: z.array(emailSchema).min(1).max(20),
  introduction: z.string().trim().max(4_000).default("Please find the completed itemized quote below."),
}).strict();
const sendSchema = z.object({ expectedDraftVersion: z.number().int().positive(), confirm: z.literal(true) }).strict();

export const completedQuoteRoutes = new Hono<AppBindings>();

completedQuoteRoutes.get("/boms/:id/quote-eligibility", loadAuthSession, async (c) => {
  const bom = await new BomsRepository(c.env.DB).detail(c.req.param("id"));
  if (!bom || bom.is_demo === 1) throw new AppError(404, "BOM_NOT_FOUND", "BOM not found.");
  await assertScopedRead(c.env.DB, c.get("authSession")?.user?.id ?? null, bom);
  return c.json({ item: await new CompletedQuotesService(c.env).eligibility(bom.id) });
});

completedQuoteRoutes.post("/completed-quotes", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, createSchema);
  const bom = await new BomsRepository(c.env.DB).detail(body.bomId);
  if (!bom || bom.is_demo === 1) throw new AppError(404, "BOM_NOT_FOUND", "BOM not found.");
  await assertScopedRead(c.env.DB, userId, bom);
  const item = await new CompletedQuotesService(c.env).createDraft(userId, body);
  await recordAuditEvent(c.env.DB, {
    actorUserId: userId, action: "completed_quote.draft.create", entityType: "completed_quote", entityId: item.id,
    requestId: c.get("requestId"), after: { bomId: item.bomId, bomVersionId: item.bomVersionId, recipientCount: item.recipients.length, subtotalMinor: item.subtotalMinor },
  });
  return c.json({ item }, 201);
});

completedQuoteRoutes.get("/completed-quotes/:id", loadAuthSession, requireAuth, async (c) => {
  const item = await new CompletedQuotesService(c.env).get(c.req.param("id"), authenticatedUserId(c));
  if (!item) throw new AppError(404, "QUOTE_DRAFT_NOT_FOUND", "Completed quote draft not found.");
  return c.json({ item });
});

completedQuoteRoutes.post("/completed-quotes/:id/send", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, sendSchema);
  const email = c.get("authSession")?.user?.email;
  if (!email) throw new AppError(409, "REPLY_TO_UNAVAILABLE", "Your account has no reply-to email address.");
  const item = await new CompletedQuotesService(c.env).send(c.req.param("id"), userId, email, body.expectedDraftVersion);
  await recordAuditEvent(c.env.DB, {
    actorUserId: userId, action: "completed_quote.send", entityType: "completed_quote", entityId: item.id,
    requestId: c.get("requestId"), after: { status: item.status, sent: item.deliveries.filter((delivery) => delivery.status === "sent").length, total: item.deliveries.length },
  });
  return c.json({ item });
});
