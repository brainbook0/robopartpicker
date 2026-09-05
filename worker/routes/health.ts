import { Hono } from "hono";
import type { AppBindings } from "../env";
import { isEmailDeliveryConfigured } from "../services/email";
import packageJson from "../../package.json";
import { googleAuthenticationConfigured } from "../auth-providers";

export const healthRoutes = new Hono<AppBindings>();

healthRoutes.get("/health", async (c) => {
  const result = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return c.json({
    status: result?.ok === 1 ? "ok" : "degraded",
    service: "robopartpicker-api",
    version: packageJson.version,
    environment: c.env.APP_ENV,
    database: "d1",
    files: "r2",
    capabilities: {
      emailDelivery: isEmailDeliveryConfigured(c.env),
      ai: Boolean(c.env.AI_PROVIDER_URL && c.env.AI_PROVIDER_KEY && c.env.AI_MODEL),
      googleAuthentication: googleAuthenticationConfigured(c.env),
      mcp: { publicReadOnly: true, privateOAuth: true },
      repositoryImport: { publicGitHub: true, authenticatedGitHub: Boolean(c.env.GITHUB_TOKEN), directFiles: true, storedFileSets: true, privateArchives: true },
    },
    requestId: c.get("requestId"),
  });
});
