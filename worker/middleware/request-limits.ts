import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../env";
import { AppError } from "../http";

export const apiRequestSizeLimit = createMiddleware<AppBindings>(async (c, next) => {
  const isFileBody = c.req.method === "PUT" && /^\/api\/v1\/files\/uploads\/[^/]+$/u.test(c.req.path);
  if (["POST", "PUT", "PATCH"].includes(c.req.method) && !c.req.path.endsWith("/content") && !isFileBody) {
    const length = Number(c.req.header("content-length") ?? 0);
    if (Number.isFinite(length) && length > 1_048_576) {
      const isImportBatch = c.req.path === "/api/v1/imports/batches";
      throw new AppError(
        413,
        isImportBatch ? "PAYLOAD_TOO_LARGE" : "REQUEST_TOO_LARGE",
        isImportBatch ? "Import batches are limited to 1 MiB." : "API request bodies are limited to 1 MiB.",
      );
    }
  }
  await next();
});
