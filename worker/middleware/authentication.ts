import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";
import type { AppBindings } from "../env";
import { AppError } from "../http";

export const loadAuthSession = createMiddleware<AppBindings>(async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("authSession", session);
  await next();
});

export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const session = c.get("authSession");
  if (!session?.user) {
    throw new AppError(401, "AUTHENTICATION_REQUIRED", "Sign in to continue.");
  }
  await next();
});
