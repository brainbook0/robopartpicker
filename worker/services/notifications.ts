export type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  internalPath?: string | null;
  data?: Record<string, unknown>;
};

export async function createInAppNotification(db: D1Database, input: NotificationInput): Promise<boolean> {
  const preference = await db.prepare(`SELECT in_app_enabled AS enabled FROM notification_preferences
    WHERE user_id = ?1 AND notification_type = ?2`).bind(input.userId, input.type).first<{ enabled: number }>();
  if (preference?.enabled === 0) return false;
  await db.prepare(`INSERT INTO notifications
    (id, user_id, notification_type, title, body, internal_path, data_json, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
    .bind(crypto.randomUUID(), input.userId, input.type, input.title, input.body ?? null, input.internalPath ?? null,
      JSON.stringify(input.data ?? {}), new Date().toISOString()).run();
  return true;
}
