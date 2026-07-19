import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../env";
import { AppError } from "../http";

export const apiRequestSizeLimit = createMiddleware<AppBindings>(async (c, next) => {
  const isFileBody = c.req.method === "PUT" && /^\/api\/v1\/files\/uploads\/[^/]+$/u.test(c.req.path);
  if (["POST", "PUT", "PATCH"].includes(c.req.method) && !c.req.path.endsWith("/content") && !isFileBody) {
    const length = Number(c.req.header("content-length") ?? 0);
    if (Number.isFinite(length) && length > 1_048_576) {
      throw new AppError(413, "REQUEST_TOO_LARGE", "API request bodies are limited to 1 MiB.");
    }
  }
  await next();
});
