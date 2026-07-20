import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { CommunityRepository } from "../db/repositories/community";
import { AppError, parsePositiveInt } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { authenticatedUserId, hasPlatformRole } from "../middleware/authorization";
import { parseJson } from "../validation";
import { recordAuditEvent } from "../services/audit";
import { createInAppNotification } from "../services/notifications";

const threadTypes = ["question", "discussion", "build_log", "integration_report", "substitution_report", "bom_correction", "supplier_report", "teardown", "project_update", "measured_test"] as const;
const relatedTypes = ["project", "component", "marketplace_listing", "build", "supplier"] as const;
const statuses = ["open", "solved", "closed"] as const;
const safePath = z.string().max(301).regex(/^\/(?!\/)[A-Za-z0-9/_%?=&.#-]{0,300}$/u);
const createThreadSchema = z.object({
  categoryId: z.string().min(1).max(100), title: z.string().trim().min(8).max(140), slug: z.string().trim().min(3).max(100).regex(/^[a-z0-9-]+$/u),
  body: z.string().trim().min(20).max(50_000), tags: z.array(z.string().trim().min(1).max(24)).max(6), threadType: z.enum(threadTypes),
  relatedEntityType: z.enum(relatedTypes).nullable().optional(), relatedEntityId: z.string().max(200).nullable().optional(),
  linkedEntityLabel: z.string().trim().max(200).nullable().optional(), linkedEntityPath: safePath.nullable().optional(),
  structuredData: z.record(z.string(), z.unknown()).refine((value) => JSON.stringify(value).length <= 20_000, "Structured data is too large."),
}).strict().refine((value) => Boolean(value.relatedEntityType) === Boolean(value.relatedEntityId), { message: "Related entity type and id must be provided together.", path: ["relatedEntityId"] });
const createPostSchema = z.object({ body: z.string().trim().min(2).max(30_000), parentId: z.string().uuid().nullable().optional() }).strict();
const statusSchema = z.object({ status: z.enum(statuses) }).strict();
const acceptedSchema = z.object({ postId: z.string().uuid().nullable() }).strict();
const reactionSchema = z.object({ emoji: z.enum(["👍", "❤️", "🚀", "🧠", "👀", "🔥"]), threadId: z.string().uuid().optional(), postId: z.string().uuid().optional() }).strict()
  .refine((value) => Boolean(value.threadId) !== Boolean(value.postId), { message: "Exactly one reaction target is required." });
const statsSchema = z.object({ userIds: z.array(z.string().min(1).max(100)).max(100) }).strict();
const reportSchema = z.object({ threadId: z.string().uuid().optional(), postId: z.string().uuid().optional(), reason: z.string().trim().min(3).max(100), details: z.string().trim().max(4_000).optional(), structuredData: z.record(z.string(), z.unknown()).optional() }).strict()
  .refine((value) => Boolean(value.threadId) || Boolean(value.postId), { message: "A report target is required." });

export const communityRoutes = new Hono<AppBindings>();

communityRoutes.get("/community/categories", async (c) => c.json({ items: await new CommunityRepository(c.env.DB).categories() }));

communityRoutes.get("/community/threads", async (c) => {
  const limit = parsePositiveInt(c.req.query("limit"), 50, 100);
  const page = parsePositiveInt(c.req.query("page"), 1, 10_000);
  const threadType = c.req.query("threadType");
  const status = c.req.query("status");
  const relatedType = c.req.query("relatedType");
  if (threadType && !threadTypes.includes(threadType as typeof threadTypes[number])) throw new AppError(400, "VALIDATION_ERROR", "Unknown thread type.");
  if (status && !statuses.includes(status as typeof statuses[number])) throw new AppError(400, "VALIDATION_ERROR", "Unknown thread status.");
  if (relatedType && !relatedTypes.includes(relatedType as typeof relatedTypes[number])) throw new AppError(400, "VALIDATION_ERROR", "Unknown related entity type.");
  const result = await new CommunityRepository(c.env.DB).listThreads({
    categoryId: c.req.query("categoryId"), search: c.req.query("search")?.trim().slice(0, 100) || undefined,
    threadType: threadType as typeof threadTypes[number] | undefined, status: status as typeof statuses[number] | undefined,
    tag: c.req.query("tag")?.trim().slice(0, 24) || undefined, relatedType: relatedType as typeof relatedTypes[number] | undefined,
    relatedId: c.req.query("relatedId")?.trim().slice(0, 200) || undefined, sort: c.req.query("sort"), limit, offset: (page - 1) * limit,
  });
  return c.json({ ...result, page, limit, pages: Math.max(1, Math.ceil(result.total / limit)) });
});

communityRoutes.get("/community/threads/:id", loadAuthSession, async (c) => {
  const repository = new CommunityRepository(c.env.DB);
  const thread = await repository.findThread(c.req.param("id"));
  if (!thread) throw new AppError(404, "THREAD_NOT_FOUND", "Thread not found.");
  await c.env.DB.prepare("UPDATE forum_threads SET view_count = view_count + 1 WHERE id = ?1").bind(thread.id).run();
  const [posts, reactions] = await Promise.all([
    repository.posts(thread.id),
    repository.reactions(thread.id, c.get("authSession")?.user?.id ?? null),
  ]);
  return c.json({ item: { ...thread, view_count: thread.view_count + 1 }, posts, reactions });
});

communityRoutes.post("/community/threads", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, createThreadSchema);
  if (body.relatedEntityType && body.relatedEntityId) await assertRelatedExists(c.env.DB, body.relatedEntityType, body.relatedEntityId);
  const item = await new CommunityRepository(c.env.DB).createThread(userId, {
    categoryId: body.categoryId, title: body.title, slug: body.slug, body: body.body, tags: [...new Set(body.tags.map((tag) => tag.toLowerCase()))],
    threadType: body.threadType, relatedEntityType: body.relatedEntityType, relatedEntityId: body.relatedEntityId,
    linkedEntityLabel: body.linkedEntityLabel, linkedEntityPath: body.linkedEntityPath, structuredData: body.structuredData,
  });
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "community.thread.create", entityType: "forum_thread", entityId: item.id, requestId: c.get("requestId"), after: { title: item.title, threadType: item.thread_type } });
  return c.json({ item }, 201);
});

communityRoutes.post("/community/threads/:id/posts", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, createPostSchema);
  const threadId = c.req.param("id");
  const item = await new CommunityRepository(c.env.DB).createPost(userId, threadId, body.body, body.parentId);
  const thread = await c.env.DB.prepare("SELECT user_id AS userId, title FROM forum_threads WHERE id = ?1").bind(threadId).first<{ userId: string | null; title: string }>();
  if (thread?.userId && thread.userId !== userId) {
    await createInAppNotification(c.env.DB, { userId: thread.userId, type: "community_reply", title: "New reply to your thread", body: thread.title, internalPath: `/community/t/${encodeURIComponent(threadId)}`, data: { threadId, postId: item.id } });
  }
  return c.json({ item }, 201);
});

communityRoutes.delete("/community/posts/:id", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const moderator = await hasPlatformRole(c.env.DB, userId, ["moderator", "administrator"]);
  await new CommunityRepository(c.env.DB).deletePost(userId, c.req.param("id"), moderator);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "community.post.delete", entityType: "forum_post", entityId: c.req.param("id"), requestId: c.get("requestId") });
  return c.body(null, 204);
});

communityRoutes.patch("/community/threads/:id/status", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, statusSchema);
  const moderator = await hasPlatformRole(c.env.DB, userId, ["moderator", "administrator"]);
  await new CommunityRepository(c.env.DB).updateStatus(userId, c.req.param("id"), body.status, moderator);
  return c.json({ status: body.status });
});

communityRoutes.put("/community/threads/:id/accepted-answer", loadAuthSession, requireAuth, async (c) => {
  const body = await parseJson(c, acceptedSchema);
  await new CommunityRepository(c.env.DB).setAcceptedAnswer(authenticatedUserId(c), c.req.param("id"), body.postId);
  return c.json({ acceptedPostId: body.postId, status: body.postId ? "solved" : "open" });
});

communityRoutes.post("/community/reactions/toggle", loadAuthSession, requireAuth, async (c) => {
  const body = await parseJson(c, reactionSchema);
  const active = await new CommunityRepository(c.env.DB).toggleReaction(authenticatedUserId(c), body, body.emoji);
  return c.json({ active });
});

communityRoutes.post("/community/contributor-stats", async (c) => {
  const body = await parseJson(c, statsSchema);
  return c.json({ stats: await new CommunityRepository(c.env.DB).contributorStats(body.userIds) });
});

communityRoutes.put("/community/bookmarks/:threadId", loadAuthSession, requireAuth, async (c) => {
  await c.env.DB.prepare(`INSERT INTO forum_bookmarks (user_id, thread_id, created_at) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING`)
    .bind(authenticatedUserId(c), c.req.param("threadId"), new Date().toISOString()).run();
  return c.json({ bookmarked: true });
});

communityRoutes.delete("/community/bookmarks/:threadId", loadAuthSession, requireAuth, async (c) => {
  await c.env.DB.prepare("DELETE FROM forum_bookmarks WHERE user_id = ?1 AND thread_id = ?2")
    .bind(authenticatedUserId(c), c.req.param("threadId")).run();
  return c.body(null, 204);
});

communityRoutes.get("/community/bookmarks", loadAuthSession, requireAuth, async (c) => {
  const rows = await c.env.DB.prepare("SELECT thread_id AS threadId FROM forum_bookmarks WHERE user_id = ?1 ORDER BY created_at DESC")
    .bind(authenticatedUserId(c)).all<{ threadId: string }>();
  return c.json({ threadIds: rows.results.map((row) => row.threadId) });
});

communityRoutes.post("/community/reports", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, reportSchema);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO forum_reports
    (id, reporter_user_id, thread_id, post_id, reason, details, structured_data_json, status, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8)`)
    .bind(id, userId, body.threadId ?? null, body.postId ?? null, body.reason, body.details ?? null, JSON.stringify(body.structuredData ?? {}), new Date().toISOString()).run();
  return c.json({ id, status: "open" }, 201);
});

communityRoutes.get("/community/related/:type/:id", loadAuthSession, async (c) => {
  const type = c.req.param("type");
  if (!relatedTypes.includes(type as typeof relatedTypes[number])) throw new AppError(400, "VALIDATION_ERROR", "Unknown related entity type.");
  return c.json({ item: await resolveRelated(c.env.DB, type as typeof relatedTypes[number], c.req.param("id"), c.get("authSession")?.user?.id ?? null) });
});

async function assertRelatedExists(db: D1Database, type: typeof relatedTypes[number], id: string): Promise<void> {
  const table: Record<typeof relatedTypes[number], string> = { project: "projects", component: "components", marketplace_listing: "marketplace_listings", build: "builds", supplier: "suppliers" };
  const row = await db.prepare(`SELECT id FROM ${table[type]} WHERE id = ?1`).bind(id).first();
  if (!row) throw new AppError(422, "RELATED_ENTITY_NOT_FOUND", "The related object does not exist.");
}

async function resolveRelated(db: D1Database, type: typeof relatedTypes[number], id: string, userId: string | null) {
  if (type === "component") {
    const row = await db.prepare("SELECT id, slug, name, category FROM components WHERE id = ?1 AND deleted_at IS NULL").bind(id).first<{ id: string; slug: string; name: string; category: string }>();
    return row ? { kind: type, ok: true, label: row.name, sub: row.category, href: `/parts/${row.category}/${row.slug}` } : { kind: type, ok: false, label: "Component unavailable", href: null };
  }
  if (type === "supplier") {
    const row = await db.prepare("SELECT id, slug, name FROM suppliers WHERE id = ?1").bind(id).first<{ id: string; slug: string; name: string }>();
    return row ? { kind: type, ok: true, label: row.name, href: `/suppliers/${row.slug}` } : { kind: type, ok: false, label: "Supplier unavailable", href: null };
  }
  if (type === "project") {
    const row = await db.prepare(`SELECT id, slug, name, visibility, status, owner_user_id FROM projects WHERE id = ?1 AND deleted_at IS NULL`).bind(id).first<{ id: string; slug: string; name: string; visibility: string; status: string; owner_user_id: string | null }>();
    const visible = row && ((row.visibility === "public" && row.status === "published") || row.visibility === "unlisted" || row.owner_user_id === userId);
    return visible ? { kind: type, ok: true, label: row.name, href: `/projects/${row.slug}` } : { kind: type, ok: false, label: "Project unavailable", href: null };
  }
  if (type === "marketplace_listing") {
    const row = await db.prepare(`SELECT id, slug, title FROM marketplace_listings WHERE id = ?1 AND status = 'published' AND visibility = 'public' AND deleted_at IS NULL`).bind(id).first<{ id: string; slug: string; title: string }>();
    return row ? { kind: type, ok: true, label: row.title, href: `/marketplace/${row.slug}` } : { kind: type, ok: false, label: "Listing unavailable", href: null };
  }
  const row = await db.prepare(`SELECT id, slug, name, visibility, owner_user_id FROM builds WHERE id = ?1 AND deleted_at IS NULL`).bind(id).first<{ id: string; slug: string; name: string; visibility: string; owner_user_id: string | null }>();
  const visible = row && (["public", "unlisted"].includes(row.visibility) || row.owner_user_id === userId);
  return visible ? { kind: type, ok: true, label: row.name, href: `/builder?build=${encodeURIComponent(row.slug)}` } : { kind: type, ok: false, label: "Build unavailable", href: null };
}
