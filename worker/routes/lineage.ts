import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { ProjectsRepository } from "../db/repositories/projects";
import { ProjectGraphRepository } from "../db/repositories/project-graph";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { assertScopedRead, authenticatedUserId } from "../middleware/authorization";
import { parseJson } from "../validation";
import { recordAuditEvent } from "../services/audit";

const cloneSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  visibility: z.enum(["private", "organization", "unlisted", "public"]).default("private"),
  changeSummary: z.string().trim().max(2_000).optional(),
}).strict();

export const lineageRoutes = new Hono<AppBindings>();

lineageRoutes.post("/projects/:id/clone", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const source = await new ProjectsRepository(c.env.DB).find(c.req.param("id"));
  if (!source) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  await assertScopedRead(c.env.DB, userId, source.row);
  const body = await parseJson(c, cloneSchema);
  const derivative = await new ProjectGraphRepository(c.env.DB).clone(userId, {
    sourceProjectId: source.row.id,
    name: body.name,
    visibility: body.visibility,
    changeSummary: body.changeSummary,
  });
  await recordAuditEvent(c.env.DB, {
    actorUserId: userId,
    action: "project.clone",
    entityType: "project",
    entityId: derivative.id,
    requestId: c.get("requestId"),
    after: { upstreamProjectId: source.row.id, upstreamRevision: source.item.version },
  });
  return c.json({ item: derivative, upstreamProjectId: source.row.id }, 201);
});

lineageRoutes.get("/projects/:id/forks", loadAuthSession, async (c) => {
  const direction = c.req.query("direction") === "upstream" ? "upstream" : "downstream";
  const repository = new ProjectsRepository(c.env.DB);
  const project = await repository.find(c.req.param("id"));
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const userId = c.get("authSession")?.user?.id ?? null;
  await assertScopedRead(c.env.DB, userId, project.row);
  const items = await new ProjectGraphRepository(c.env.DB).listForks(project.row.id, direction);
  return c.json({ items, total: items.length, direction });
});

lineageRoutes.get("/projects/:id/compare/:otherId", loadAuthSession, async (c) => {
  const repository = new ProjectsRepository(c.env.DB);
  const userId = c.get("authSession")?.user?.id ?? null;
  const base = await repository.find(c.req.param("id"));
  const other = await repository.find(c.req.param("otherId"));
  if (!base || !other) throw new AppError(404, "PROJECT_NOT_FOUND", "One or both projects were not found.");
  await assertScopedRead(c.env.DB, userId, base.row);
  await assertScopedRead(c.env.DB, userId, other.row);
  const result = await new ProjectGraphRepository(c.env.DB).compare(base.row.id, other.row.id);
  return c.json(result);
});
