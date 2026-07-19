export type AuditInput = {
  actorUserId?: string | null;
  actorServiceId?: string | null;
  organizationId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  requestId?: string | null;
  before?: unknown;
  after?: unknown;
};

export async function recordAuditEvent(db: D1Database, input: AuditInput): Promise<void> {
  await db.prepare(`INSERT INTO audit_events
    (id, actor_user_id, actor_service_id, organization_id, action, entity_type, entity_id, request_id, before_json, after_json, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
    .bind(
      crypto.randomUUID(),
      input.actorUserId ?? null,
      input.actorServiceId ?? null,
      input.organizationId ?? null,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.requestId ?? null,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      new Date().toISOString(),
    ).run();
}
