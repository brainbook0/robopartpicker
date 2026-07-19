import { Hono } from "hono";
import type { AppBindings } from "../env";
import { isEmailDeliveryConfigured } from "../services/email";

export const healthRoutes = new Hono<AppBindings>();

healthRoutes.get("/health", async (c) => {
  const result = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return c.json({
    status: result?.ok === 1 ? "ok" : "degraded",
    service: "robopartpicker-api",
    version: "0.2.0",
    environment: c.env.APP_ENV,
    database: "d1",
    files: "r2",
    capabilities: {
      emailDelivery: isEmailDeliveryConfigured(c.env),
      ai: Boolean(c.env.AI_PROVIDER_URL && c.env.AI_PROVIDER_KEY && c.env.AI_MODEL),
      repositoryImport: Boolean(c.env.GITHUB_TOKEN),
    },
    requestId: c.get("requestId"),
  });
});
