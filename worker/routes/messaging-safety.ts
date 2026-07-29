import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { authenticatedUserId } from "../middleware/authorization";
import { createInAppNotification } from "../services/notifications";
import { parseJson } from "../validation";

const contextSchema = z.enum(["marketplace", "project", "build", "general"]);
const createSchema = z.object({ recipientUserId: z.string().uuid(), contextType: contextSchema.default("general"), contextId: z.string().trim().max(200).optional(), message: z.string().trim().max(20_000).optional() }).strict();
const responseSchema = z.object({ accept: z.boolean() }).strict();
const messageSchema = z.object({ bodyMarkdown: z.string().trim().min(1).max(20_000), attachmentFileId: z.string().uuid().optional() }).strict();
const reportSchema = z.object({ reason: z.string().trim().min(2).max(200), details: z.string().trim().max(4_000).optional(), messageId: z.string().uuid().optional() }).strict();
const blockSchema = z.object({ blockedUserId: z.string().uuid(), reason: z.string().trim().max(1_000).optional() }).strict();

export const messagingSafetyRoutes = new Hono<AppBindings>();
messagingSafetyRoutes.use("/messages", loadAuthSession, requireAuth);
messagingSafetyRoutes.use("/messages/*", loadAuthSession, requireAuth);

messagingSafetyRoutes.get("/messages/conversations", async (c) => {
  const userId = authenticatedUserId(c);
  const rows = await c.env.DB.prepare(`SELECT dc.*, me.request_status AS my_request_status, me.last_read_at,
      other.user_id AS other_user_id, p.username AS other_username, COALESCE(p.display_name, u.name) AS other_name,
      (SELECT body_markdown FROM direct_messages dm WHERE dm.conversation_id = dc.id AND dm.status IN ('sent','edited') ORDER BY dm.created_at DESC LIMIT 1) AS last_message,
      (SELECT created_at FROM direct_messages dm WHERE dm.conversation_id = dc.id ORDER BY dm.created_at DESC LIMIT 1) AS last_message_at,
      (SELECT COUNT(*) FROM direct_messages dm WHERE dm.conversation_id = dc.id AND dm.created_at > COALESCE(me.last_read_at, '1970-01-01') AND dm.sender_user_id <> ?1 AND dm.status = 'sent') AS unread_count
    FROM direct_conversations dc JOIN direct_conversation_members me ON me.conversation_id = dc.id AND me.user_id = ?1
    JOIN direct_conversation_members other ON other.conversation_id = dc.id AND other.user_id <> ?1
    JOIN user u ON u.id = other.user_id LEFT JOIN profiles p ON p.id = u.id
    WHERE me.request_status <> 'blocked' ORDER BY COALESCE(last_message_at, dc.updated_at) DESC LIMIT 200`).bind(userId).all<Record<string, unknown>>();
  return c.json({ items: rows.results.map(jsonColumns) });
});

messagingSafetyRoutes.post("/messages/conversations", async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, createSchema);
  if (body.recipientUserId === userId) throw new AppError(422, "MESSAGE_SELF_INVALID", "You cannot message yourself.");
  const recipient = await c.env.DB.prepare(`SELECT u.id, COALESCE(p.display_name, u.name) AS name, up.messaging_policy
    FROM user u LEFT JOIN profiles p ON p.id = u.id LEFT JOIN user_preferences up ON up.user_id = u.id WHERE u.id = ?1`).bind(body.recipientUserId).first<{ id: string; name: string; messaging_policy: string | null }>();
  if (!recipient) throw new AppError(404, "MESSAGE_RECIPIENT_NOT_FOUND", "Recipient not found.");
  await assertNotBlocked(c.env.DB, userId, recipient.id);
  const policy = recipient.messaging_policy ?? "requests";
  if (policy === "nobody") throw new AppError(403, "MESSAGE_POLICY_DENIED", "This user is not accepting message requests.");
  if (policy === "project_collaborators" && !(await shareProject(c.env.DB, userId, recipient.id, body.contextType, body.contextId))) throw new AppError(403, "MESSAGE_COLLABORATOR_REQUIRED", "This user accepts messages only from project collaborators.");
  const existing = await c.env.DB.prepare(`SELECT dc.id, dc.status FROM direct_conversations dc
    JOIN direct_conversation_members a ON a.conversation_id = dc.id AND a.user_id = ?1
    JOIN direct_conversation_members b ON b.conversation_id = dc.id AND b.user_id = ?2
    WHERE COALESCE(dc.context_type, 'general') = ?3 AND COALESCE(dc.context_id, '') = COALESCE(?4, '') AND dc.status NOT IN ('closed','blocked') LIMIT 1`)
    .bind(userId, recipient.id, body.contextType, body.contextId ?? null).first<{ id: string; status: string }>();
  if (existing) return c.json({ id: existing.id, status: existing.status, duplicate: true });
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  const autoActive = policy === "everyone";
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO direct_conversations (id, context_type, context_id, status, requested_by_user_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`).bind(id, body.contextType, body.contextId ?? null, autoActive ? "active" : "requested", userId, now),
    c.env.DB.prepare(`INSERT INTO direct_conversation_members (conversation_id, user_id, role, request_status, created_at)
      VALUES (?1, ?2, 'requester', 'accepted', ?3)`).bind(id, userId, now),
    c.env.DB.prepare(`INSERT INTO direct_conversation_members (conversation_id, user_id, role, request_status, created_at)
      VALUES (?1, ?2, 'recipient', ?3, ?4)`).bind(id, recipient.id, autoActive ? "accepted" : "pending", now),
  ]);
  if (body.message) await insertMessage(c.env.DB, id, userId, body.message, undefined, autoActive ? "sent" : "quarantined");
  await createInAppNotification(c.env.DB, { userId: recipient.id, type: "message_request", title: autoActive ? "New message" : "New message request", body: body.message?.slice(0, 200) ?? `Message from a RoboPartPicker user`, internalPath: `/messages/${id}`, data: { conversationId: id, contextType: body.contextType, contextId: body.contextId } });
  return c.json({ id, status: autoActive ? "active" : "requested" }, 201);
});

messagingSafetyRoutes.get("/messages/conversations/:id", async (c) => {
  const userId = authenticatedUserId(c); const membership = await member(c.env.DB, c.req.param("id"), userId);
  const conversation = await c.env.DB.prepare("SELECT * FROM direct_conversations WHERE id = ?1").bind(c.req.param("id")).first<Record<string, unknown>>();
  const participants = await c.env.DB.prepare(`SELECT dcm.user_id, dcm.role, dcm.request_status, p.username, COALESCE(p.display_name, u.name) AS name, p.avatar_url
    FROM direct_conversation_members dcm JOIN user u ON u.id = dcm.user_id LEFT JOIN profiles p ON p.id = u.id WHERE dcm.conversation_id = ?1`).bind(c.req.param("id")).all();
  const messages = await c.env.DB.prepare(`SELECT dm.*, p.username, COALESCE(p.display_name, u.name) AS sender_name
    FROM direct_messages dm LEFT JOIN user u ON u.id = dm.sender_user_id LEFT JOIN profiles p ON p.id = dm.sender_user_id
    WHERE dm.conversation_id = ?1 AND (dm.status <> 'quarantined' OR dm.sender_user_id = ?2) ORDER BY dm.created_at LIMIT 500`).bind(c.req.param("id"), userId).all();
  await c.env.DB.prepare("UPDATE direct_conversation_members SET last_read_at = ?1 WHERE conversation_id = ?2 AND user_id = ?3").bind(new Date().toISOString(), c.req.param("id"), userId).run();
  return c.json({ item: jsonColumns(conversation!), membership, participants: participants.results, messages: messages.results.map(jsonColumns) });
});

messagingSafetyRoutes.post("/messages/conversations/:id/respond", async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, responseSchema); const membership = await member(c.env.DB, c.req.param("id"), userId);
  if (membership.role !== "recipient" || membership.request_status !== "pending") throw new AppError(409, "MESSAGE_REQUEST_NOT_PENDING", "This message request is not pending.");
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE direct_conversation_members SET request_status = ?1 WHERE conversation_id = ?2 AND user_id = ?3").bind(body.accept ? "accepted" : "declined", c.req.param("id"), userId),
    c.env.DB.prepare("UPDATE direct_conversations SET status = ?1, updated_at = ?2 WHERE id = ?3").bind(body.accept ? "active" : "declined", now, c.req.param("id")),
    ...(body.accept ? [c.env.DB.prepare("UPDATE direct_messages SET status = 'sent' WHERE conversation_id = ?1 AND status = 'quarantined'").bind(c.req.param("id"))] : []),
  ]);
  return c.json({ status: body.accept ? "active" : "declined" });
});

messagingSafetyRoutes.post("/messages/conversations/:id/messages", async (c) => {
  const userId = authenticatedUserId(c); const membership = await member(c.env.DB, c.req.param("id"), userId); const body = await parseJson(c, messageSchema);
  if (membership.request_status !== "accepted") throw new AppError(403, "MESSAGE_REQUEST_NOT_ACCEPTED", "Accept the message request before replying.");
  const conversation = await c.env.DB.prepare("SELECT status FROM direct_conversations WHERE id = ?1").bind(c.req.param("id")).first<{ status: string }>();
  if (conversation?.status !== "active") throw new AppError(409, "CONVERSATION_NOT_ACTIVE", "This conversation is not active.");
  const other = await c.env.DB.prepare("SELECT user_id FROM direct_conversation_members WHERE conversation_id = ?1 AND user_id <> ?2 LIMIT 1").bind(c.req.param("id"), userId).first<{ user_id: string }>();
  if (!other) throw new AppError(409, "CONVERSATION_RECIPIENT_MISSING", "The conversation has no recipient."); await assertNotBlocked(c.env.DB, userId, other.user_id);
  const recent = await c.env.DB.prepare("SELECT COUNT(*) AS value FROM direct_messages WHERE sender_user_id = ?1 AND created_at > ?2").bind(userId, new Date(Date.now() - 60 * 60_000).toISOString()).first<{ value: number }>();
  if (Number(recent?.value ?? 0) >= 30) throw new AppError(429, "MESSAGE_RATE_LIMITED", "Message limit reached; try again later.");
  if (body.attachmentFileId) await assertSafeAttachment(c.env.DB, body.attachmentFileId, userId);
  const score = spamScore(body.bodyMarkdown); const status = score >= 0.8 ? "quarantined" : "sent"; const id = await insertMessage(c.env.DB, c.req.param("id"), userId, body.bodyMarkdown, body.attachmentFileId, status, score);
  if (status === "sent") await createInAppNotification(c.env.DB, { userId: other.user_id, type: "message", title: "New direct message", body: body.bodyMarkdown.slice(0, 200), internalPath: `/messages/${c.req.param("id")}`, data: { conversationId: c.req.param("id"), messageId: id } });
  else await createOperationsCase(c.env.DB, "messaging_abuse", "direct_message", id, "Potential spam message quarantined", `Automated spam score: ${score}`, "high", userId);
  return c.json({ id, status, spamScore: score }, 201);
});

messagingSafetyRoutes.post("/messages/block", async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, blockSchema); if (body.blockedUserId === userId) throw new AppError(422, "BLOCK_SELF_INVALID", "You cannot block yourself."); const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO user_blocks (blocker_user_id, blocked_user_id, reason, created_at) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(blocker_user_id, blocked_user_id) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at`).bind(userId, body.blockedUserId, body.reason ?? null, now),
    c.env.DB.prepare(`UPDATE direct_conversations SET status = 'blocked', updated_at = ?1 WHERE id IN (
      SELECT a.conversation_id FROM direct_conversation_members a JOIN direct_conversation_members b ON b.conversation_id = a.conversation_id
      WHERE a.user_id = ?2 AND b.user_id = ?3)`).bind(now, userId, body.blockedUserId),
    c.env.DB.prepare(`UPDATE direct_conversation_members SET request_status = 'blocked' WHERE user_id = ?1 AND conversation_id IN (
      SELECT conversation_id FROM direct_conversation_members WHERE user_id = ?2)`).bind(body.blockedUserId, userId),
  ]);
  return c.json({ blocked: true });
});

messagingSafetyRoutes.delete("/messages/block/:userId", async (c) => { await c.env.DB.prepare("DELETE FROM user_blocks WHERE blocker_user_id = ?1 AND blocked_user_id = ?2").bind(authenticatedUserId(c), c.req.param("userId")).run(); return c.body(null, 204); });

messagingSafetyRoutes.post("/messages/conversations/:id/report", async (c) => {
  const userId = authenticatedUserId(c); await member(c.env.DB, c.req.param("id"), userId); const body = await parseJson(c, reportSchema);
  const reported = await c.env.DB.prepare("SELECT user_id FROM direct_conversation_members WHERE conversation_id = ?1 AND user_id <> ?2 LIMIT 1").bind(c.req.param("id"), userId).first<{ user_id: string }>();
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO messaging_reports
    (id, reporter_user_id, reported_user_id, conversation_id, message_id, reason, details, status, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8)`).bind(id, userId, reported?.user_id ?? null, c.req.param("id"), body.messageId ?? null, body.reason, body.details ?? null, now).run();
  await createOperationsCase(c.env.DB, "messaging_abuse", "messaging_report", id, `Messaging report: ${body.reason}`, body.details ?? null, "high", userId);
  return c.json({ id, status: "open" }, 201);
});

async function member(db: D1Database, conversationId: string, userId: string) { const row = await db.prepare("SELECT * FROM direct_conversation_members WHERE conversation_id = ?1 AND user_id = ?2").bind(conversationId, userId).first<{ role: string; request_status: string }>(); if (!row) throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found."); return row; }
async function assertNotBlocked(db: D1Database, left: string, right: string) { const row = await db.prepare("SELECT 1 AS blocked FROM user_blocks WHERE (blocker_user_id = ?1 AND blocked_user_id = ?2) OR (blocker_user_id = ?2 AND blocked_user_id = ?1) LIMIT 1").bind(left, right).first(); if (row) throw new AppError(403, "MESSAGING_BLOCKED", "Messaging is unavailable between these users."); }
async function shareProject(db: D1Database, left: string, right: string, context: z.infer<typeof contextSchema>, contextId?: string): Promise<boolean> { if (context !== "project" || !contextId) return false; const rows = await db.prepare(`SELECT COUNT(DISTINCT user_id) AS value FROM (
  SELECT user_id FROM project_collaborators WHERE project_id = ?1 AND status = 'active' AND user_id IN (?2, ?3)
  UNION SELECT user_id FROM project_maintainers WHERE project_id = ?1 AND user_id IN (?2, ?3)
  UNION SELECT owner_user_id AS user_id FROM projects WHERE id = ?1 AND owner_user_id IN (?2, ?3))`).bind(contextId, left, right).first<{ value: number }>(); return Number(rows?.value ?? 0) === 2; }
async function assertSafeAttachment(db: D1Database, id: string, userId: string) { const file = await db.prepare("SELECT owner_user_id, media_type, size_bytes, status FROM files WHERE id = ?1 AND deleted_at IS NULL").bind(id).first<{ owner_user_id: string | null; media_type: string; size_bytes: number; status: string }>(); if (!file || file.owner_user_id !== userId || file.status !== "ready") throw new AppError(422, "MESSAGE_ATTACHMENT_INVALID", "Attachment must be your ready file."); if (file.size_bytes > 10 * 1024 * 1024 || !/^(?:image\/(?:png|jpeg|webp|gif)|application\/pdf|text\/plain)$/u.test(file.media_type)) throw new AppError(422, "MESSAGE_ATTACHMENT_RESTRICTED", "Message attachments are limited to safe images, PDF, or plain text under 10 MB."); }
async function insertMessage(db: D1Database, conversationId: string, userId: string, body: string, attachment?: string, status = "sent", score = 0): Promise<string> { const id = crypto.randomUUID(); const now = new Date().toISOString(); await db.batch([db.prepare(`INSERT INTO direct_messages
  (id, conversation_id, sender_user_id, body_markdown, attachment_file_id, status, spam_score, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(id, conversationId, userId, body, attachment ?? null, status, score, now), db.prepare("UPDATE direct_conversations SET updated_at = ?1 WHERE id = ?2").bind(now, conversationId)]); return id; }
function spamScore(body: string): number { const links = (body.match(/https?:\/\//giu) ?? []).length; const mentions = (body.match(/@[\w-]+/gu) ?? []).length; const repeated = /(.{20,})\1{2,}/u.test(body); const shout = body.length > 20 && body.replace(/[^A-Z]/gu, "").length / body.length > 0.6; return Math.min(1, links * 0.18 + mentions * 0.03 + (repeated ? 0.55 : 0) + (shout ? 0.25 : 0)); }
async function createOperationsCase(db: D1Database, type: string, entityType: string, entityId: string, title: string, summary: string | null, priority: string, openedBy: string) { const now = new Date().toISOString(); await db.prepare(`INSERT INTO operations_cases
  (id, case_type, source_entity_type, source_entity_id, title, summary, priority, status, opened_by_user_id, created_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8, ?9, ?9)`).bind(crypto.randomUUID(), type, entityType, entityId, title, summary, priority, openedBy, now).run(); }
function jsonColumns(row: Record<string, unknown>) { const output = { ...row }; for (const [key, value] of Object.entries(row)) if (key.endsWith("_json") && typeof value === "string") { try { output[key.replace(/_json$/u, "")] = JSON.parse(value); } catch { output[key.replace(/_json$/u, "")] = null; } delete output[key]; } return output; }
