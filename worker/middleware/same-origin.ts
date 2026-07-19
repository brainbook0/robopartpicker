import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../env";
import { AppError } from "../http";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const requireSameOriginMutation = createMiddleware<AppBindings>(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method) || c.req.path === "/api/v1/imports/batches") {
    await next();
    return;
  }

  const origin = c.req.header("origin");
  const requestOrigin = new URL(c.req.url).origin;
  const configuredOrigin = new URL(c.env.BETTER_AUTH_URL).origin;
  if (!origin || (origin !== requestOrigin && origin !== configuredOrigin)) {
    throw new AppError(403, "ORIGIN_NOT_ALLOWED", "Mutation requests must come from the application origin.");
  }

  await next();
});
