#!/usr/bin/env tsx
/*
 * Non-destructive production smoke checks for a deployed RoboPartPicker origin.
 * Usage: tsx scripts/production-smoke.ts --base-url https://example.com
 */

type JsonObject = Record<string, unknown>;

type CheckResult = { name: string; detail?: string };

const mutableMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const jsonHeaders = { accept: "application/json", "content-type": "application/json" };
const mcpHeaders = { accept: "application/json, text/event-stream", "content-type": "application/json" };

const portableRppsManifest = `rpps: "0.1"
project:
  id: project:production-smoke
  name: Smoke Test Manifest
  slug: production-smoke
release:
  id: release:production-smoke:0.0.1
  version: 0.0.1
authors:
  - id: author:production-smoke
    name: Production Smoke
licenses:
  hardware: CERN-OHL-S-2.0
  software: Apache-2.0
  documentation: CC-BY-4.0
artifacts:
  - id: artifact:readme
    path: README.md
    kind: documentation
    sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
components:
  - id: component:motor
    name: Smoke motor
    quantity: 1
    manufacturer: Example Robotics
    mpn: SMOKE-MOTOR-1
extensions:
  org.robopartpicker.production-smoke: true
`;

function baseUrlFromArgs(argv: string[]): string {
  const argIndex = argv.findIndex((arg) => arg === "--base-url" || arg === "--url");
  const value = argIndex >= 0 ? argv[argIndex + 1] : process.env.RPP_BASE_URL ?? process.env.BASE_URL;
  if (!value) throw new Error("Missing deployed base URL. Pass --base-url https://... or set RPP_BASE_URL.");
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Base URL must be http(s).");
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function endpoint(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl}/`).toString();
}

async function request(baseUrl: string, path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  if (mutableMethods.has(method) && init.headers && !("origin" in lowerCaseHeaderKeys(init.headers))) {
    init = { ...init, headers: { ...Object.fromEntries(Array.from(new Headers(init.headers).entries())), origin: baseUrl } };
  }
  return fetch(endpoint(baseUrl, path), { redirect: "manual", ...init });
}

function lowerCaseHeaderKeys(headers: HeadersInit): Record<string, true> {
  return Object.fromEntries(Array.from(new Headers(headers).keys()).map((key) => [key.toLowerCase(), true]));
}

async function expectJson(response: Response): Promise<JsonObject> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error(`Expected JSON content-type, got ${contentType || "none"}`);
  return await response.json() as JsonObject;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertStatus(response: Response, allowed: number[], context: string): void {
  assert(allowed.includes(response.status), `${context}: expected ${allowed.join("/")}, got ${response.status}`);
}

function assertRequestAndSecurityHeaders(response: Response): void {
  assert(response.headers.get("x-request-id"), "Missing x-request-id header");
  assert(response.headers.get("x-content-type-options") === "nosniff", "Missing x-content-type-options: nosniff");
  assert(response.headers.get("referrer-policy"), "Missing referrer-policy header");
  assert(response.headers.get("permissions-policy"), "Missing permissions-policy header");
}

async function checkSpaRoutes(baseUrl: string): Promise<CheckResult> {
  const routes = ["/", "/projects", "/marketplace", "/developers"];
  for (const route of routes) {
    const response = await request(baseUrl, route, { headers: { accept: "text/html" } });
    assertStatus(response, [200], `SPA route ${route}`);
    const contentType = response.headers.get("content-type") ?? "";
    assert(contentType.includes("text/html"), `SPA route ${route} did not return HTML: ${contentType}`);
    const body = await response.text();
    assert(body.includes("<html") || body.includes("<!doctype html"), `SPA route ${route} body does not look like HTML`);
  }
  return { name: "spa-routes", detail: `${routes.length} routes returned HTML` };
}

async function checkHealth(baseUrl: string): Promise<CheckResult> {
  const response = await request(baseUrl, "/api/health", { headers: { accept: "application/json" } });
  assertStatus(response, [200], "/api/health");
  assertRequestAndSecurityHeaders(response);
  const body = await expectJson(response);
  assert(body.status === "healthy" || body.database === "d1", "/api/health did not report healthy runtime state");
  return { name: "health", detail: `status=${String(body.status ?? "ok")}` };
}

async function checkPhysicalDesignProjects(baseUrl: string): Promise<CheckResult> {
  const response = await request(baseUrl, "/api/v1/projects?kind=physical_design&limit=10", { headers: { accept: "application/json" } });
  assertStatus(response, [200], "physical_design project filter");
  const body = await expectJson(response);
  const items = Array.isArray(body.items) ? body.items as JsonObject[] : [];
  assert(items.length > 0, "physical_design project filter returned no projects");
  assert(items.some((item) => item.project_kind === "physical_design" || item.projectKind === "physical_design" || item.kind === "physical_design"), "No returned project is classified as physical_design");
  return { name: "physical-design-projects", detail: `${items.length} items` };
}

async function checkMarketplaceListing(baseUrl: string): Promise<CheckResult> {
  const response = await request(baseUrl, "/api/v1/marketplace?limit=5", { headers: { accept: "application/json" } });
  assertStatus(response, [200], "marketplace listing endpoint");
  const body = await expectJson(response);
  assert(Array.isArray(body.items), "Marketplace response missing items array");
  return { name: "marketplace-list", detail: `${(body.items as unknown[]).length} items` };
}

async function checkAnonymousWritesRejected(baseUrl: string): Promise<CheckResult> {
  const checks: Array<[string, string, JsonObject]> = [
    ["project create", "/api/v1/projects", { visibility: "public", rpps: {} }],
    ["rfq create", "/api/v1/rfq", { projectId: "smoke-test-nonexistent-project" }],
    ["marketplace create", "/api/v1/marketplace", { listingType: "sell", title: "Smoke test rejected listing", description: "This anonymous smoke request must be rejected before mutation.", category: "test", quantity: 1, visibility: "public" }],
  ];
  for (const [name, path, body] of checks) {
    const response = await request(baseUrl, path, { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) });
    assertStatus(response, [401, 403], `anonymous ${name}`);
  }
  return { name: "anonymous-writes", detail: `${checks.length} write paths rejected` };
}

async function mcpCall(baseUrl: string, id: number, method: string, params: JsonObject): Promise<JsonObject> {
  const response = await request(baseUrl, "/mcp", { method: "POST", headers: mcpHeaders, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  assertStatus(response, [200], `MCP ${method}`);
  const body = await expectJson(response);
  assert(!body.error, `MCP ${method} returned error: ${JSON.stringify(body.error)}`);
  return body;
}

async function checkMcp(baseUrl: string): Promise<CheckResult> {
  await mcpCall(baseUrl, 1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "production-smoke", version: "1.0.0" } });
  const listed = await mcpCall(baseUrl, 2, "tools/list", {});
  const tools = (((listed.result as JsonObject).tools as JsonObject[]) ?? []).map((tool) => tool.name);
  assert(tools.includes("search_projects") && tools.includes("validate_rpps"), "MCP tools/list missing required tools");
  const searched = await mcpCall(baseUrl, 3, "tools/call", { name: "search_projects", arguments: { query: "", limit: 5 } });
  const searchItems = (((searched.result as JsonObject).structuredContent as JsonObject).items as unknown[]) ?? [];
  assert(Array.isArray(searchItems), "search_projects did not return an items array");
  const validated = await mcpCall(baseUrl, 4, "tools/call", { name: "validate_rpps", arguments: { manifest: portableRppsManifest } });
  const validation = ((validated.result as JsonObject).structuredContent as JsonObject);
  assert(validation.valid === true, "validate_rpps did not accept the smoke manifest");
  return { name: "mcp", detail: `${tools.length} tools listed, search_projects and validate_rpps executed` };
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("Usage: tsx scripts/production-smoke.ts --base-url https://deployed-origin.example");
    return;
  }
  const baseUrl = baseUrlFromArgs(process.argv.slice(2));
  const checks = [checkSpaRoutes, checkHealth, checkPhysicalDesignProjects, checkMarketplaceListing, checkAnonymousWritesRejected, checkMcp];
  const results: CheckResult[] = [];
  for (const check of checks) {
    const result = await check(baseUrl);
    results.push(result);
    console.log(`✓ ${result.name}${result.detail ? ` (${result.detail})` : ""}`);
  }
  console.log(JSON.stringify({ ok: true, baseUrl, checks: results }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
