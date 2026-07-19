import { Hono } from "hono";
import type { AppBindings } from "../env";
import { parsePositiveInt } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { requirePlatformRole } from "../middleware/authorization";

export const adminRoutes = new Hono<AppBindings>();
adminRoutes.use("/admin/*", loadAuthSession, requireAuth, requirePlatformRole("moderator", "administrator"));

adminRoutes.get("/admin/overview", async (c) => {
  const [users, projects, components, pendingImports, openReports] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS value FROM user"), c.env.DB.prepare("SELECT COUNT(*) AS value FROM projects WHERE deleted_at IS NULL"),
    c.env.DB.prepare("SELECT COUNT(*) AS value FROM components WHERE deleted_at IS NULL"), c.env.DB.prepare("SELECT COUNT(*) AS value FROM import_records WHERE status IN ('staged','review')"),
    c.env.DB.prepare(`SELECT (SELECT COUNT(*) FROM forum_reports WHERE status IN ('open','reviewing')) +
      (SELECT COUNT(*) FROM marketplace_reports WHERE status IN ('open','reviewing')) AS value`),
  ]);
  const value = (result: D1Result<unknown>) => Number((result.results[0] as { value?: number } | undefined)?.value ?? 0);
  return c.json({ users: value(users), projects: value(projects), components: value(components), pendingImports: value(pendingImports), openReports: value(openReports) });
});
adminRoutes.get("/admin/audit-events", async (c) => { const limit = parsePositiveInt(c.req.query("limit"), 100, 500); const rows = await c.env.DB.prepare(`SELECT id, actor_user_id AS actorUserId, actor_service_id AS actorServiceId,
  organization_id AS organizationId, action, entity_type AS entityType, entity_id AS entityId, request_id AS requestId,
  before_json AS beforeJson, after_json AS afterJson, created_at AS createdAt FROM audit_events ORDER BY created_at DESC LIMIT ?1`).bind(limit).all(); return c.json({ items: rows.results }); });
