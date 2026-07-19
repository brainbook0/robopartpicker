import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../env";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export const requestId = createMiddleware<AppBindings>(async (c, next) => {
  const incoming = c.req.header("X-Request-Id");
  const id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
  c.set("requestId", id);
  await next();
  c.header("X-Request-Id", id);
});
