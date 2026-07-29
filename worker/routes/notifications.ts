import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { authenticatedUserId } from "../middleware/authorization";
import { parseJson } from "../validation";

const preferencesSchema = z.object({ notificationType: z.string().trim().min(1).max(100), inAppEnabled: z.boolean(), emailEnabled: z.boolean(), pushEnabled: z.boolean().default(false), deliverySchedule: z.enum(["individual", "batched", "daily_digest", "weekly_digest", "off"]).default("individual") }).strict();
export const notificationRoutes = new Hono<AppBindings>();
notificationRoutes.use("/notifications", loadAuthSession, requireAuth);
notificationRoutes.use("/notifications/*", loadAuthSession, requireAuth);

notificationRoutes.get("/notifications", async (c) => {
  const userId = authenticatedUserId(c); const unreadOnly = c.req.query("unread") === "true";
  const result = await c.env.DB.prepare(`SELECT id, notification_type AS notificationType, title, body,
    internal_path AS internalPath, data_json AS dataJson, read_at AS readAt, created_at AS createdAt
    FROM notifications WHERE user_id = ?1 AND (?2 = 0 OR read_at IS NULL) ORDER BY created_at DESC LIMIT 100`)
    .bind(userId, unreadOnly ? 1 : 0).all<Record<string, unknown>>();
  const unread = await c.env.DB.prepare("SELECT COUNT(*) AS value FROM notifications WHERE user_id = ?1 AND read_at IS NULL").bind(userId).first<{ value: number }>();
  return c.json({ items: result.results.map((row) => ({ ...row, data: JSON.parse(String(row.dataJson)), dataJson: undefined })), unreadCount: Number(unread?.value ?? 0) });
});
notificationRoutes.patch("/notifications/:id/read", async (c) => { const result = await c.env.DB.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?1) WHERE id = ?2 AND user_id = ?3").bind(new Date().toISOString(), c.req.param("id"), authenticatedUserId(c)).run(); return c.json({ updated: result.meta.changes === 1 }); });
notificationRoutes.post("/notifications/read-all", async (c) => { const result = await c.env.DB.prepare("UPDATE notifications SET read_at = ?1 WHERE user_id = ?2 AND read_at IS NULL").bind(new Date().toISOString(), authenticatedUserId(c)).run(); return c.json({ updated: result.meta.changes }); });
notificationRoutes.get("/notifications/preferences", async (c) => { const rows = await c.env.DB.prepare(`SELECT notification_type AS notificationType, in_app_enabled AS inAppEnabled,
  email_enabled AS emailEnabled, push_enabled AS pushEnabled, delivery_schedule AS deliverySchedule, updated_at AS updatedAt FROM notification_preferences WHERE user_id = ?1 ORDER BY notification_type`).bind(authenticatedUserId(c)).all(); return c.json({ items: rows.results }); });
notificationRoutes.put("/notifications/preferences", async (c) => { const userId = authenticatedUserId(c); const body = await parseJson(c, preferencesSchema); await c.env.DB.prepare(`INSERT INTO notification_preferences
  (user_id, notification_type, in_app_enabled, email_enabled, push_enabled, delivery_schedule, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
  ON CONFLICT(user_id, notification_type) DO UPDATE SET in_app_enabled = excluded.in_app_enabled, email_enabled = excluded.email_enabled,
    push_enabled = excluded.push_enabled, delivery_schedule = excluded.delivery_schedule, updated_at = excluded.updated_at`)
  .bind(userId, body.notificationType, body.inAppEnabled ? 1 : 0, body.emailEnabled ? 1 : 0, body.pushEnabled ? 1 : 0, body.deliverySchedule, new Date().toISOString()).run(); return c.json({ updated: true }); });
