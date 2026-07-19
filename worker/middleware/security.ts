import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../env";

export const apiSecurityHeaders = createMiddleware<AppBindings>(async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
});
