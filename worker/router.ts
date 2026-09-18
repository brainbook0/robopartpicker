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
import { completedQuoteRoutes } from "./routes/completed-quotes";
import { customerQuoteRoutes } from "./routes/customer-quotes";
import { projectProposalRoutes } from "./routes/project-proposals";
import { projectSocialRoutes } from "./routes/project-social";
import { projectClaimRoutes } from "./routes/project-claims";
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
import { supplierRelationshipRoutes } from "./routes/supplier-relationships";
import { adminRoutes } from "./routes/admin";
import { analyticsRoutes } from "./routes/analytics";
import { apiRateLimit } from "./middleware/rate-limit";
import { handleMcpRequest } from "./mcp";
import { handlePrivateMcpRequest, privateMcpResourceMetadata } from "./mcp-private";
import { serveLlmsText, serveProjectBadge, serveProjectFeed, serveQueryIndex, serveQueryPage, serveRobots, serveSeoAsset, serveSitemap, serveGlossaryIndex, serveComparisonIndex, serveComparisonPage, servePriceIndex } from "./services/seo";
import { canonicalRedirectUrl, DEFAULT_PRODUCTION_BASE_URL } from "../src/lib/public-seo";

export const app = new Hono<AppBindings>();

app.use("*", async (c, next) => {
  const redirect = canonicalRedirectUrl(c.req.url, c.env.PUBLIC_BASE_URL ?? DEFAULT_PRODUCTION_BASE_URL);
  if (redirect) return c.redirect(redirect, 308);
  await next();
});

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
    description: "Public read-only robotics project and technical component data.",
    transport: "streamable-http",
    endpoint: `${origin}/mcp`,
    documentation: `${origin}/developers`,
    authentication: { public: "none", privateEndpoint: `${origin}/mcp/private`, private: "oauth2" },
    capabilities: ["search_projects", "get_project", "search_components", "compare_components", "validate_rpps"],
  };
  return new Response(c.req.method === "HEAD" ? null : JSON.stringify(metadata), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300, stale-while-revalidate=300" },
  });
});

app.on(["GET", "HEAD"], "/.well-known/mcp/server-card.json", (c) => {
  const origin = new URL(c.req.url).origin;
  const card = {
    $schema: "https://smithery.ai/schemas/server-card.json",
    name: "robopartpicker",
    displayName: "RoboPartPicker",
    description: "Public read-only robotics project, component and bill-of-materials data for AI agents. Search 2,445 source-linked robotics projects, inspect BOMs, compare components, and validate RPPS documents.",
    version: "1.0.0",
    homepage: `${origin}`,
    documentation: `${origin}/developers`,
    repository: `${origin}/developers`,
    transport: { type: "streamable-http", url: `${origin}/mcp` },
    endpoint: `${origin}/mcp`,
    authentication: { type: "none", required: false },
    capabilities: {
      tools: [
        { name: "search_projects", description: "Search open robotics projects by keyword, category or kind." },
        { name: "get_project", description: "Fetch a robotics project with source, license, files and BOM summary." },
        { name: "search_components", description: "Search the technical component catalog by name, category or maker." },
        { name: "compare_components", description: "Compare two to four components; same category never implies verified drop-in compatibility." },
        { name: "validate_rpps", description: "Validate a Robotics Project Package Specification (RPPS) document." },
      ],
    },
    categories: ["robotics", "engineering", "hardware", "data", "developer-tools"],
    license: "Public read-only data; project sources retain their own licenses.",
    contact: "support@robopartpicker.com",
  };
  return new Response(c.req.method === "HEAD" ? null : JSON.stringify(card, null, 2), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300, stale-while-revalidate=300" },
  });
});

app.on(["GET", "HEAD"], [".well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp/private"], (c) => {
  const body = c.req.method === "HEAD" ? null : JSON.stringify(privateMcpResourceMetadata(c.env));
  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=300",
    },
  });
});
app.on(["GET", "HEAD"], "/.well-known/oauth-authorization-server/api/auth", (c) => createAuth(c.env).handler(c.req.raw));
app.on(["GET", "HEAD"], "/robots.txt", serveRobots);
app.on(["GET", "HEAD"], "/sitemap.xml", serveSitemap);
app.on(["GET", "HEAD"], "/feed.xml", serveProjectFeed);
app.on(["GET", "HEAD"], "/llms.txt", serveLlmsText);
app.on(["GET", "HEAD"], ["/openapi.json", "/.well-known/api-catalog"], (c) => {
  const origin = new URL(c.req.url).origin;
  const isCatalog = c.req.path.endsWith("api-catalog");
  const body = isCatalog
    ? {
        linkset: [
          {
            anchor: `${origin}/api/v1`,
            "service-desc": [{ href: `${origin}/openapi.json`, type: "application/vnd.oai.openapi+json" }],
            "service-doc": [{ href: `${origin}/developers`, type: "text/html" }],
            "service-meta": [{ href: `${origin}/.well-known/mcp.json`, type: "application/json" }],
            status: [{ href: `${origin}/api/health`, type: "application/json" }],
          },
        ],
      }
    : {
        openapi: "3.1.0",
        info: {
          title: "RoboPartPicker public API",
          version: "1.0.0",
          description: "Public read-only robotics project, component and bill-of-materials data. Observed prices are catalog estimates, not binding quotes.",
          contact: { name: "RoboPartPicker", email: "support@robopartpicker.com" },
          license: { name: "Public read-only data; upstream projects retain their own licenses." },
        },
        servers: [{ url: `${origin}/api` }],
        paths: {
          "/health": { get: { operationId: "health", summary: "Service health and enabled capabilities.", responses: { "200": { description: "Service status" } } } },
          "/v1/projects": { get: { operationId: "listProjects", summary: "List or search robotics projects.", parameters: [
            { name: "q", in: "query", schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", maximum: 100 } },
            { name: "page", in: "query", schema: { type: "integer" } }, { name: "kind", in: "query", schema: { type: "string", enum: ["physical_design", "commercial_showcase", "robotics_software"] } },
            { name: "category", in: "query", schema: { type: "string" } }, { name: "sort", in: "query", schema: { type: "string" } } ],
            responses: { "200": { description: "Project list with total and catalog stats" } } } },
          "/v1/components": { get: { operationId: "listComponents", summary: "List or search technical components.", parameters: [
            { name: "q", in: "query", schema: { type: "string" } }, { name: "category", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", maximum: 100 } }, { name: "page", in: "query", schema: { type: "integer" } } ],
            responses: { "200": { description: "Component list with total" } } } },
          "/v1/boms": { get: { operationId: "listBoms", summary: "List public bills of materials.", responses: { "200": { description: "BOM list with line counts" } } } },
          "/v1/marketplace": { get: { operationId: "listMarketplace", summary: "List public marketplace listings.", responses: { "200": { description: "Listing list" } } } },
        },
        "x-mcp": { endpoint: `${origin}/mcp`, discovery: `${origin}/.well-known/mcp.json`, serverCard: `${origin}/.well-known/mcp/server-card.json` },
      };
  return new Response(c.req.method === "HEAD" ? null : JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": isCatalog ? "application/linkset+json" : "application/json",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
});

app.on(["GET", "HEAD"], "/badges/project/:slug", serveProjectBadge);
app.on(["GET", "HEAD"], "/queries", serveQueryIndex);
app.on(["GET", "HEAD"], "/queries/:slug", serveQueryPage);
app.on(["GET", "HEAD"], "/glossary", serveGlossaryIndex);
app.on(["GET", "HEAD"], "/compared-to", serveComparisonIndex);
app.on(["GET", "HEAD"], "/compared-to/:slug", serveComparisonPage);
app.on(["GET", "HEAD"], "/price-index", servePriceIndex);

app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));
app.route("/api", healthRoutes);
app.route("/api/v1", userRoutes);
app.route("/api/v1", organizationRoutes);
app.route("/api/v1", projectRoutes);
app.route("/api/v1", lineageRoutes);
app.route("/api/v1", sourcingRoutes);
app.route("/api/v1", rfqRoutes);
app.route("/api/v1", completedQuoteRoutes);
app.route("/api/v1", customerQuoteRoutes);
app.route("/api/v1", projectProposalRoutes);
app.route("/api/v1", projectSocialRoutes);
app.route("/api/v1", projectClaimRoutes);
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
app.route("/api/v1", supplierRelationshipRoutes);
app.route("/api/v1", adminRoutes);
app.route("/api/v1", analyticsRoutes);
app.route("/api/v1", catalogRoutes);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return jsonError(c, new AppError(404, "NOT_FOUND", "The requested API resource does not exist."));
  }
  return serveSeoAsset(c);
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
