import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../env";
import { AppError } from "../http";

export const apiRateLimit = createMiddleware<AppBindings>(async (c, next) => {
  const windowSeconds = 60;
  const max = c.req.method === "GET" || c.req.method === "HEAD" ? 300 : c.req.path === "/api/v1/imports/batches" ? 30 : 90;
  const address = c.req.header("cf-connecting-ip") ?? (c.env.APP_ENV === "production" ? "missing" : "local-development");
  const keyHash = await keyedHash(c.env.BETTER_AUTH_SECRET, address);
  const cutoff = new Date(Date.now() - windowSeconds * 1_000).toISOString();
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS value FROM rate_limit_events WHERE key_hash = ?1 AND route = ?2 AND created_at >= ?3")
    .bind(keyHash, routeScope(c.req.path), cutoff).first<{ value: number }>();
  const allowed = Number(count?.value ?? 0) < max;
  await c.env.DB.prepare(`INSERT INTO rate_limit_events
    (id, scope, key_hash, route, allowed, retry_after_seconds, request_id, created_at)
    VALUES (?1, 'ip', ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(crypto.randomUUID(), keyHash, routeScope(c.req.path), allowed ? 1 : 0, allowed ? null : windowSeconds, c.get("requestId"), new Date().toISOString()).run();
  if (!allowed) { c.header("Retry-After", String(windowSeconds)); throw new AppError(429, "RATE_LIMITED", "Too many requests; retry shortly."); }
  if (c.get("requestId").endsWith("0")) c.executionCtx.waitUntil(c.env.DB.prepare("DELETE FROM rate_limit_events WHERE created_at < ?1").bind(new Date(Date.now() - 2 * 86_400_000).toISOString()).run().then(() => undefined));
  await next();
});

function routeScope(path: string): string { return path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/giu, ":id").replace(/\/[^/]{40,}/gu, "/:id").slice(0, 200); }
async function keyedHash(secret: string, value: string): Promise<string> { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
