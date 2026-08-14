import { Hono } from "hono";
import { createAuth } from "./auth";
import type { AppBindings } from "./env";
import { AppError, jsonError } from "./http";
import { requestId } from "./middleware/request-id";
import { apiSecurityHeaders } from "./middleware/security";
import { apiRequestSizeLimit } from "./middleware/request-limits";
import { requireSameOriginMutation } from "./middleware/same-origin";
import { healthRoutes } from "./routes/health";
import { catalogRoutes } from "./routes/catalog";
import { userRoutes } from "./routes/users";
import { organizationRoutes } from "./routes/organizations";
import { projectRoutes } from "./routes/projects";
import { lineageRoutes } from "./routes/lineage";
import { sourcingRoutes } from "./routes/sourcing";
import { rfqRoutes } from "./routes/rfq";
import { communityRoutes } from "./routes/community";
import { marketplaceRoutes } from "./routes/marketplace";
import { buildRoutes } from "./routes/builds";
import { bomRoutes } from "./routes/boms";
import { fileRoutes } from "./routes/files";
import { importRoutes } from "./routes/imports";
import { searchRoutes } from "./routes/search";
import { aiRoutes } from "./routes/ai";
import { discoveryRoutes } from "./routes/discovery";
import { rppsRoutes } from "./routes/rpps";
import { notificationRoutes } from "./routes/notifications";
import { partnerInterestRoutes } from "./routes/partner-interest";
import { adminRoutes } from "./routes/admin";
import { apiRateLimit } from "./middleware/rate-limit";
import { handleMcpRequest } from "./mcp";
import { handlePrivateMcpRequest, privateMcpResourceMetadata } from "./mcp-private";

export const app = new Hono<AppBindings>();

app.use("/api/*", requestId);
app.use("/api/*", apiSecurityHeaders);
app.use("/api/v1/*", apiRequestSizeLimit);
app.use("/api/v1/*", apiRateLimit);
app.use("/api/v1/*", requireSameOriginMutation);
app.use("/mcp", requestId);
app.use("/mcp", apiSecurityHeaders);
app.use("/mcp", apiRateLimit);
app.use("/mcp/*", requestId);
app.use("/mcp/*", apiSecurityHeaders);
app.use("/mcp/*", apiRateLimit);
app.use("/.well-known/*", requestId);
app.use("/.well-known/*", apiSecurityHeaders);

app.all("/mcp/private", (c) => handlePrivateMcpRequest(c.req.raw, c.env));
app.all("/mcp", (c) => handleMcpRequest(c.req.raw, c.env));

app.on(["GET", "HEAD"], "/.well-known/mcp.json", (c) => {
  const origin = new URL(c.req.url).origin;
  const metadata = {
    name: "RoboPartPicker",
    description: "Public read-only robotics project, component, and supplier data.",
    transport: "streamable-http",
    endpoint: `${origin}/mcp`,
    documentation: `${origin}/developers`,
    authentication: { public: "none", privateEndpoint: `${origin}/mcp/private`, private: "oauth2" },
    capabilities: ["search_projects", "get_project", "search_components", "compare_components", "search_suppliers"],
  };
  return new Response(c.req.method === "HEAD" ? null : JSON.stringify(metadata), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300, stale-while-revalidate=300" },
  });
});

app.on(["GET", "HEAD"], ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp/private"], (c) => {
  const body = c.req.method === "HEAD" ? null : JSON.stringify(privateMcpResourceMetadata(c.env));
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=300",
    },
  });
});
app.on(["GET", "HEAD"], "/.well-known/oauth-authorization-server/api/auth", (c) => createAuth(c.env).handler(c.req.raw));

app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));
app.route("/api", healthRoutes);
app.route("/api/v1", userRoutes);
app.route("/api/v1", organizationRoutes);
app.route("/api/v1", projectRoutes);
app.route("/api/v1", lineageRoutes);
app.route("/api/v1", sourcingRoutes);
app.route("/api/v1", rfqRoutes);
app.route("/api/v1", communityRoutes);
app.route("/api/v1", marketplaceRoutes);
app.route("/api/v1", buildRoutes);
app.route("/api/v1", bomRoutes);
app.route("/api/v1", fileRoutes);
app.route("/api/v1", importRoutes);
app.route("/api/v1", searchRoutes);
app.route("/api/v1", aiRoutes);
app.route("/api/v1", discoveryRoutes);
app.route("/api/v1", rppsRoutes);
app.route("/api/v1", notificationRoutes);
app.route("/api/v1", partnerInterestRoutes);
app.route("/api/v1", adminRoutes);
app.route("/api/v1", catalogRoutes);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return jsonError(c, new AppError(404, "NOT_FOUND", "The requested API resource does not exist."));
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((error, c) => {
  if (error instanceof AppError) return jsonError(c, error);

  console.error(
    JSON.stringify({
      level: "error",
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      error: error.name,
      message: error.message,
    }),
  );

  return jsonError(c, new AppError(500, "INTERNAL_ERROR", "The request could not be completed."));
});
