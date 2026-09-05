import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { emptyRpps } from "../../src/lib/rpps/schema";
import { artifactKind, classifyGithubProviderError, parseCsvObjects, selectGithubFetchCandidates } from "../../worker/services/project-import";
import { staticSeo } from "../../worker/services/seo";
import packageJson from "../../package.json";

const origin = "https://example.com";
const ingestionSecret = "test-only-ingestion-secret-32-characters-minimum";
let ownerCookie = "";
let otherCookie = "";
let ownerId = "";
let otherId = "";
let buildId = "";
let partnerInterestId = "";
const portableRpps = `
rpps: "0.1"
project:
  id: project:portable-test
  name: Portable Test Robot
  slug: portable-test-robot
release:
  id: release:portable-test:0.1.0
  version: 0.1.0
authors:
  - id: author:owner
    name: Owner User
licenses:
  hardware: CERN-OHL-S-2.0
  software: Apache-2.0
  documentation: CC-BY-4.0
artifacts:
  - id: artifact:readme
    path: README.md
    kind: documentation
    sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    source:
      url: https://github.com/example/portable-test
      revision: abc123
components:
  - id: component:motor
    name: TM-42 Motor
    quantity: 2
    manufacturer: Test Motors
    mpn: TM-42
interfaces:
  - id: interface:motor-mount
    name: Motor mount
    kind: mechanical
    specifications:
      boltPatternMm: 42
assemblies:
  - id: assembly:drive
    name: Drive assembly
    componentRefs: [component:motor]
    artifactRefs: [artifact:readme]
    interfaceRefs: [interface:motor-mount]
extensions:
  org.example.test:
    preserved: true
`;

describe("GitHub reference import policy", () => {
  it("prioritizes portable manifests, BOMs, robot models, and dependencies", () => {
    const selected = selectGithubFetchCandidates([
      { path: "config/controllers.yaml", size: 20 },
      { path: "docs/maintenance.md", size: 20 },
      { path: "package.json", size: 20 },
      { path: "robot/description.urdf", size: 20 },
      { path: "README.md", size: 20 },
      { path: "bom/parts.csv", size: 20 },
      { path: "rpps.yaml", size: 20 },
    ]);

    expect(selected.map((entry) => entry.path)).toEqual([
      "rpps.yaml",
      "bom/parts.csv",
      "robot/description.urdf",
      "package.json",
      "README.md",
      "docs/maintenance.md",
      "config/controllers.yaml",
    ]);
  });

  it("fetches bounded CAD artifacts so BOM candidates can be derived from assemblies", () => {
    const selected = selectGithubFetchCandidates([
      { path: "cad/chassis.step", size: 2_000 },
      { path: "meshes/chassis.stl", size: 2_000 },
      { path: "bom.csv", size: 200 },
    ]);

    expect(selected.map((entry) => entry.path)).toEqual(["bom.csv", "cad/chassis.step", "meshes/chassis.stl"]);
  });

  it("does not treat partition tables as BOM candidates or artifacts", () => {
    const selected = selectGithubFetchCandidates([
      { path: "firmware/partitions.csv", size: 120 },
      { path: "firmware/partitions.json", size: 120 },
      { path: "firmware/partitions.yaml", size: 120 },
      { path: "docs/usage.md", size: 500 },
      { path: "robot.urdf", size: 1_000 },
    ]);

    expect(selected.map((entry) => entry.path)).toEqual([
      "robot.urdf",
      "docs/usage.md",
      "firmware/partitions.csv",
      "firmware/partitions.json",
      "firmware/partitions.yaml",
    ]);
    expect(artifactKind("firmware/partitions.csv")).toBe("firmware");
    expect(artifactKind("firmware/partitions.json")).toBe("firmware");
    expect(artifactKind("firmware/partitions.yaml")).toBe("firmware");
  });

  it("recognizes only explicit BOM filename variants", () => {
    expect(artifactKind("bom.csv")).toBe("bom");
    expect(artifactKind("hardware/parts.csv")).toBe("bom");
    expect(artifactKind("hardware/parts-list.csv")).toBe("bom");
    expect(artifactKind("hardware/bill-of-materials.xlsx")).toBe("bom");
    expect(artifactKind("hardware/partition-table.csv")).not.toBe("bom");
  });

  it("requires credible BOM headers before emitting CSV part rows", () => {
    expect(parseCsvObjects("Name,Type,SubType,Offset,Size,Flags\nnvs,data,nvs,0x9000,0x5000,\n")).toEqual([]);
    expect(parseCsvObjects("Name,Manufacturer,MPN,Quantity\nDrive motor,Test Motors,TM-42,2\n")).toEqual([
      { name: "Drive motor", manufacturer: "Test Motors", mpn: "TM-42", quantity: "2" },
    ]);
  });

  it("maps GitHub rate-limit denials to actionable retry errors", () => {
    const error = classifyGithubProviderError(403, new Headers({ "x-ratelimit-remaining": "0" }), JSON.stringify({ message: "API rate limit exceeded for anonymous access." }));

    expect(error.status).toBe(429);
    expect(error.code).toBe("REPOSITORY_RATE_LIMITED");
    expect(error.message).toContain("rate-limited");
    expect(error.details?.[0].message).toContain("API rate limit exceeded");
  });

  it("keeps non-rate-limit GitHub 403s distinct from generic provider failures", () => {
    const error = classifyGithubProviderError(403, new Headers(), JSON.stringify({ message: "Repository access blocked by organization policy." }));

    expect(error.status).toBe(502);
    expect(error.code).toBe("REPOSITORY_PROVIDER_DENIED");
    expect(error.message).toContain("denied");
    expect(error.details?.[0].message).toContain("organization policy");
  });
});

async function call(path: string, init: RequestInit = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method)) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  return exports.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
}
function jsonBody(value: unknown): string { return JSON.stringify(value); }
async function body<T>(response: Response): Promise<T> { return response.json() as Promise<T>; }
function cookies(response: Response): string {
  const values = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
  return values.filter(Boolean).map((value) => value.split(";", 1)[0]).join("; ");
}
async function uploadTestFile(name: string, content: string, cookie: string, kind = "document") {
  const bytes = new TextEncoder().encode(content);
  const initialized = await call("/api/v1/files/uploads", { method: "POST", body: jsonBody({ originalName: name, mediaType: "text/plain", sizeBytes: bytes.byteLength, kind, visibility: "private" }) }, cookie);
  expect(initialized.status).toBe(201);
  const upload = await body<{ file: { id: string }; upload: { url: string; token: string } }>(initialized);
  const stored = await call(upload.upload.url, { method: "PUT", headers: { "content-type": "text/plain", "content-length": String(bytes.byteLength), "x-upload-token": upload.upload.token }, body: bytes }, cookie);
  expect(stored.status).toBe(201);
  return upload.file.id;
}

async function seedClaimableProject(name: string) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}-${id.slice(0, 8)}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('robotics-catalog-import', 'Robotics catalog importer', 'catalog-importer@robopartpicker.invalid', 1, ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO projects
      (id, slug, name, owner_user_id, visibility, status, current_version_id, license_spdx, repository_url,
       is_demo, version, project_kind, publishability, created_at, updated_at)
      VALUES (?1, ?2, ?3, 'robotics-catalog-import', 'public', 'published', ?4, 'Apache-2.0', ?5,
        0, 1, 'physical_design', 'ready', ?6, ?6)`)
      .bind(id, slug, name, versionId, `https://github.com/example/${slug}`, now),
    env.DB.prepare(`INSERT INTO project_versions
      (id, project_id, version_label, rpps_schema_version, rpps_json, status, created_at, published_at)
      VALUES (?1, ?2, '1.0.0', '1.0.0', ?3, 'published', ?4, ?4)`)
      .bind(versionId, id, JSON.stringify(emptyRpps({ name, slug, version: "1.0.0" })), now),
    env.DB.prepare("INSERT INTO project_maintainers (project_id, user_id, role, created_at) VALUES (?1, 'robotics-catalog-import', 'owner', ?2)")
      .bind(id, now),
  ]);
  return { id, slug };
}

async function issuePrivateMcpToken(cookie: string, scope = "openid profile rpp:read rpp:write") {
  const redirectUri = `http://127.0.0.1:7777/oauth/callback/${crypto.randomUUID()}`;
  const registered = await call("/api/auth/oauth2/register", {
    method: "POST",
    body: jsonBody({
      client_name: "RoboPartPicker Worker Test",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope,
      type: "native",
    }),
  });
  const registrationText = await registered.text();
  expect(registered.status, registrationText).toBe(200);
  const registration = JSON.parse(registrationText) as { client_id: string };
  const verifier = `worker-test-pkce-verifier-${crypto.randomUUID()}-abcdefghijklmnopqrstuvwxyz0123456789`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
  const authorize = new URLSearchParams({
    response_type: "code",
    client_id: registration.client_id,
    redirect_uri: redirectUri,
    scope,
    state: "worker-test-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const authorization = await call(`/api/auth/oauth2/authorize?${authorize}`, { redirect: "manual" }, cookie);
  const authorizationText = await authorization.clone().text();
  expect(authorization.status, authorizationText).toBe(302);
  const oauthQuery = new URL(authorization.headers.get("location")!, origin).search.slice(1);
  const consent = await call("/api/auth/oauth2/consent", {
    method: "POST",
    headers: { accept: "application/json" },
    body: jsonBody({ accept: true, oauth_query: oauthQuery }),
  }, cookie);
  expect(consent.status).toBe(200);
  const callback = new URL((await body<{ url: string }>(consent)).url);
  const tokenForm = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: registration.client_id,
    redirect_uri: redirectUri,
    code: callback.searchParams.get("code")!,
    code_verifier: verifier,
    resource: `${origin}/mcp/private`,
  });
  const token = await call("/api/auth/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: tokenForm.toString(),
  });
  const tokenText = await token.text();
  expect(token.status, tokenText).toBe(200);
  return (JSON.parse(tokenText) as { access_token: string }).access_token;
}

function privateMcpHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  };
}

beforeAll(async () => {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO forum_categories (id, slug, name, description, sort_order, created_at)
      VALUES ('cat-general', 'general', 'General engineering', 'Structured technical questions', 1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO manufacturers (id, slug, name, status, is_demo, created_at, updated_at)
      VALUES ('m-test', 'test-motors', 'Test Motors', 'active', 0, ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO components
      (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
       source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
      VALUES ('c-test', 'tm-42-motor', 'm-test', 'TM-42', 'TM-42 Motor', 'actuator', 'A test actuator',
       'active', 'https://manufacturer.example/TM-42', 'worker integration test', ?1, 0, 1, ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO suppliers (id, slug, name, status, is_demo, created_at, updated_at)
      VALUES ('s-private-test', 'private-test-supplier', 'Private Test Supplier', 'active', 0, ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO supplier_offers (id, supplier_id, component_id, supplier_sku, product_url, currency,
      unit_price_minor, minimum_quantity, availability, observed_at, is_demo, created_at, updated_at)
      VALUES ('o-private-test', 's-private-test', 'c-test', 'SECRET-SKU', 'https://supplier.example/secret', 'USD',
        4200, 1, 'in_stock', ?1, 0, ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO component_revisions (id, component_id, revision_label, status, effective_at, created_at)
      VALUES ('cr-test', 'c-test', 'source-current', 'published', ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO component_specs (id, component_revision_id, spec_key, label, value_number, unit, sort_order, created_at)
      VALUES ('cs-test-voltage', 'cr-test', 'voltage_v', 'Rated voltage', 24, 'V', 10, ?1)`).bind(now),
  ]);
  const owner = await call("/api/auth/sign-up/email", { method: "POST", body: jsonBody({ name: "Owner User", email: "owner@example.com", password: "correct-horse-battery" }) });
  expect(owner.status).toBe(200); ownerCookie = cookies(owner); const ownerData = await body<{ user: { id: string } }>(owner); ownerId = ownerData.user.id;
  const other = await call("/api/auth/sign-up/email", { method: "POST", body: jsonBody({ name: "Other User", email: "other@example.com", password: "correct-horse-battery" }) });
  expect(other.status).toBe(200); otherCookie = cookies(other); const otherData = await body<{ user: { id: string } }>(other); otherId = otherData.user.id;
  await env.DB.prepare(`INSERT INTO platform_user_roles (user_id, role, granted_by_user_id, granted_at)
    VALUES (?1, 'administrator', ?1, ?2)`).bind(ownerId, now).run();
});

describe("Worker, D1, R2, authentication, and domain invariants", () => {
  it("serves the authentication route with noindex metadata instead of a not-found title", async () => {
    const document = staticSeo("/auth", origin, `${origin}/robopartpicker-social.png`);
    expect(document).toMatchObject({
      title: "Sign in or create an account | RoboPartPicker",
      canonicalUrl: `${origin}/auth`,
      robots: "noindex,follow",
    });
    expect(document?.title).not.toBe("Page not found | RoboPartPicker");

    for (const [path, title] of [
      ["/assistant", "AI Build Assistant Beta | RoboPartPicker"],
      ["/builder", "Build and reproduction workspace Beta | RoboPartPicker"],
      ["/projects/new", "Import a robotics project Beta | RoboPartPicker"],
      ["/marketplace/new", "Publish a marketplace listing Beta | RoboPartPicker"],
    ] as const) {
      expect(staticSeo(path, origin, `${origin}/robopartpicker-social.png`)).toMatchObject({ title, robots: "noindex,follow" });
    }

    expect(staticSeo("/suppliers", origin, `${origin}/robopartpicker-social.png`)).toMatchObject({
      title: "Completed quote method Beta | RoboPartPicker",
      robots: expect.stringContaining("index,follow"),
    });
  });

  it("publishes indexable metadata and sitemap entries for every legal and contact route", async () => {
    const legalPages = [
      ["/legal", "Legal center | RoboPartPicker"],
      ["/privacy", "Privacy Policy | RoboPartPicker"],
      ["/terms", "Terms of Service | RoboPartPicker"],
      ["/cookies", "Cookies and Storage Policy | RoboPartPicker"],
      ["/acceptable-use", "Acceptable Use Policy | RoboPartPicker"],
      ["/marketplace-terms", "Marketplace Terms | RoboPartPicker"],
      ["/ai-notice", "AI Transparency and Safety Notice | RoboPartPicker"],
      ["/intellectual-property", "Intellectual Property and Takedown Policy | RoboPartPicker"],
      ["/accessibility", "Accessibility Statement | RoboPartPicker"],
      ["/contact", "Contact RoboPartPicker | RoboPartPicker"],
    ] as const;
    for (const [path, title] of legalPages) {
      expect(staticSeo(path, origin, `${origin}/robopartpicker-social.png`)).toMatchObject({
        title,
        canonicalUrl: `${origin}${path}`,
        robots: expect.stringMatching(/^index,follow/u),
      });
    }
    const sitemap = await call("/sitemap.xml");
    expect(sitemap.status).toBe(200);
    const xml = await sitemap.text();
    for (const [path] of legalPages) expect(xml).toContain(`<loc>${origin}${path}</loc>`);
  });

  it("applies the complete schema and searches the D1 FTS index", async () => {
    const migrations = await env.DB.prepare("SELECT COUNT(*) AS value FROM d1_migrations").first<{ value: number }>();
    expect(Number(migrations?.value)).toBe(33);

    // Verify the new normalized project profile/price/trend tables exist
    const { results: projectSpecsCols } = await env.DB.prepare("PRAGMA table_info('project_specs')").all<{ name: string }>();
    expect(projectSpecsCols.length).toBeGreaterThanOrEqual(14);
    expect(projectSpecsCols.some((c) => c.name === "id")).toBe(true);
    expect(projectSpecsCols.some((c) => c.name === "project_id")).toBe(true);
    expect(projectSpecsCols.some((c) => c.name === "value_text")).toBe(true);
    expect(projectSpecsCols.some((c) => c.name === "value_number")).toBe(true);
    expect(projectSpecsCols.some((c) => c.name === "confidence")).toBe(true);
    expect(projectSpecsCols.some((c) => c.name === "evidence_id")).toBe(true);
    expect(projectSpecsCols.some((c) => c.name === "is_current")).toBe(true);
    expect(projectSpecsCols.some((c) => c.name === "observed_at")).toBe(true);

    const { results: priceEstCols } = await env.DB.prepare("PRAGMA table_info('project_price_estimates')").all<{ name: string }>();
    expect(priceEstCols.length).toBeGreaterThanOrEqual(15);
    expect(priceEstCols.some((c) => c.name === "estimate_type")).toBe(true);
    expect(priceEstCols.some((c) => c.name === "currency")).toBe(true);
    expect(priceEstCols.some((c) => c.name === "min_minor")).toBe(true);
    expect(priceEstCols.some((c) => c.name === "max_minor")).toBe(true);
    expect(priceEstCols.some((c) => c.name === "confidence")).toBe(true);
    expect(priceEstCols.some((c) => c.name === "method_version")).toBe(true);
    expect(priceEstCols.some((c) => c.name === "status")).toBe(true);

    const { results: trendCols } = await env.DB.prepare("PRAGMA table_info('project_trend_snapshots')").all<{ name: string }>();
    expect(trendCols.length).toBeGreaterThanOrEqual(16);
    expect(trendCols.some((c) => c.name === "methodology_version")).toBe(true);
    expect(trendCols.some((c) => c.name === "window_start")).toBe(true);
    expect(trendCols.some((c) => c.name === "window_end")).toBe(true);
    expect(trendCols.some((c) => c.name === "search_score")).toBe(true);
    expect(trendCols.some((c) => c.name === "composite_score")).toBe(true);
    expect(trendCols.some((c) => c.name === "rank")).toBe(true);
    expect(trendCols.some((c) => c.name === "active")).toBe(true);

    // Verify key indexes exist
    const { results: indexes } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('project_specs','project_price_estimates','project_trend_snapshots') AND name LIKE 'idx_%' ORDER BY name").all<{ name: string }>();
    const indexNames = indexes.map((r) => r.name);
    expect(indexNames.some((n) => n.includes("project_specs") && n.includes("project"))).toBe(true);
    expect(indexNames.some((n) => n.includes("project_price_estimates") && n.includes("project"))).toBe(true);
    expect(indexNames.some((n) => n.includes("project_trend_snapshots") && n.includes("project"))).toBe(true);

    const health = await call("/api/health");
    expect(health.status).toBe(200);
    const healthBody = await body<{ database: string; version: string; capabilities: { googleAuthentication: boolean } }>(health);
    expect(healthBody).toMatchObject({ database: "d1", version: packageJson.version, capabilities: { googleAuthentication: false } });
    expect(JSON.stringify(healthBody)).not.toContain("GOOGLE_CLIENT");
    const search = await call("/api/v1/search?q=motor"); expect(search.status).toBe(200);
    expect((await body<{ items: Array<{ id: string }> }>(search)).items.some((item) => item.id === "c-test")).toBe(true);
    const manufacturers = await call("/api/v1/manufacturers"); expect(manufacturers.status).toBe(200);
    const integrations = await call("/api/v1/integrations"); expect(integrations.status).toBe(200);
  });

  it("aggregates allowlisted public events and protects every admin analytics report", async () => {
    const payload = { event: "project_preview_click", path: "/projects", targetType: "project", targetId: "test-project", dimensionKey: "action", dimensionValue: "open" };
    expect((await call("/api/v1/analytics/event", { method: "POST", body: jsonBody(payload) })).status).toBe(202);
    expect((await call("/api/v1/analytics/event", { method: "POST", body: jsonBody(payload) })).status).toBe(202);
    const aggregate = await env.DB.prepare("SELECT events FROM analytics_daily_events WHERE event_name='project_preview_click' AND target_id='test-project'").first<{ events: number }>();
    expect(Number(aggregate?.events)).toBe(2);
    expect((await call("/api/v1/analytics/event", { method: "POST", body: jsonBody({ ...payload, dimensionValue: "contains?invalid" }) })).status).toBe(422);
    expect((await call("/api/v1/admin/analytics/summary?days=30")).status).toBe(401);
    expect((await call("/api/v1/admin/analytics/summary?days=30", {}, otherCookie)).status).toBe(403);
    expect((await call("/api/v1/admin/analytics/summary?days=30", {}, ownerCookie)).status).toBe(200);
    expect((await call("/api/v1/admin/analytics/catalog-health", {}, ownerCookie)).status).toBe(200);
    const csv = await call("/api/v1/admin/analytics/export.csv?days=30", {}, ownerCookie);
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
  });

  it("publishes extensive part sources without exposing supplier identities or commercial offers", async () => {
    const component = await call("/api/v1/components/c-test");
    expect(component.status).toBe(200);
    const item = (await body<{ item: { sourceUrl?: string; lifecycleStatus?: string; offers: unknown[]; priceHistory: unknown[]; technicalSpecifications?: unknown[]; profile?: { identity: string; technicalSpecCount: number; missing: string[] } } }>(component)).item;
    expect(item).toMatchObject({
      sourceUrl: "https://manufacturer.example/TM-42",
      lifecycleStatus: "active",
      offers: [],
      priceHistory: [],
      technicalSpecifications: [{ key: "voltage_v", label: "Rated voltage", value: 24, unit: "V" }],
      profile: { identity: "exact", technicalSpecCount: 1 },
    });
    expect(item.profile?.missing).not.toContain("technical specifications");
    expect(JSON.stringify(item)).not.toContain("Private Test Supplier");
    expect(JSON.stringify(item)).not.toContain("SECRET-SKU");
    expect(JSON.stringify(item)).not.toContain("supplier.example");

    expect((await call("/api/v1/suppliers")).status).toBe(401);
    expect((await call("/api/v1/offers?componentId=c-test")).status).toBe(401);
    expect((await call("/api/v1/suppliers", {}, ownerCookie)).status).toBe(200);
    const search = await call("/api/v1/search?q=Private%20Test%20Supplier");
    const searchItems = (await body<{ items: Array<{ category: string }> }>(search)).items;
    expect(searchItems.some((result) => result.category === "supplier" || result.category === "offer")).toBe(false);
    const baselineCatalog = await body<{ total: number }>(await call("/api/v1/components?limit=5"));
    const commerciallyFilteredCatalog = await body<{ total: number }>(await call("/api/v1/components?limit=5&minPrice=999999&inStock=true&supplierRegion=TEST"));
    expect(commerciallyFilteredCatalog.total).toBe(baselineCatalog.total);
  });

  it("hides non-published BOM lines from public reads and exports while preserving owner review", async () => {
    const now = new Date().toISOString();
    const projectId = crypto.randomUUID();
    const projectVersionId = crypto.randomUUID();
    const bomId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects
        (id, slug, name, owner_user_id, visibility, status, current_version_id, is_demo, version, project_kind, publishability, created_at, updated_at)
        VALUES (?1, ?2, 'Publication Boundary Robot', ?3, 'public', 'published', ?4, 0, 1, 'physical_design', 'ready', ?5, ?5)`)
        .bind(projectId, `publication-boundary-${projectId.slice(0, 8)}`, ownerId, projectVersionId, now),
      env.DB.prepare(`INSERT INTO project_versions
        (id, project_id, version_label, rpps_schema_version, rpps_json, status, created_at, published_at)
        VALUES (?1, ?2, '1.0.0', '1.0.0', ?3, 'published', ?4, ?4)`)
        .bind(projectVersionId, projectId, JSON.stringify(emptyRpps({ name: "Publication Boundary Robot", slug: `publication-boundary-${projectId.slice(0, 8)}`, version: "1.0.0" })), now),
      env.DB.prepare(`INSERT INTO boms
        (id, project_id, owner_user_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, 'Publication Boundary BOM', ?5, 'public', 0, ?6, ?6)`)
        .bind(bomId, projectId, ownerId, `publication-boundary-${bomId.slice(0, 8)}`, versionId, now),
      env.DB.prepare(`INSERT INTO bom_versions
        (id, bom_id, version_label, currency, created_by_user_id, source_fingerprint,
         validation_report_json, quote_ready, publication_state, coverage_note,
         omission_report_json, compiler_version, policy_version, created_at)
        VALUES (?1, ?2, '1', 'USD', ?3, ?4, '{}', 0, 'draft', 'Reviewing source rows.',
          '[]', 'bom-compiler/1', 'bom-publication/1', ?5)`)
        .bind(versionId, bomId, ownerId, "b".repeat(64), now),
      env.DB.prepare(`INSERT INTO bom_items
        (id, bom_version_id, component_id, slot_key, description, quantity, unit,
         extraction_method, completeness, evidence_locator, confidence, line_classification,
         included, optional, raw_fields_json, aggregated_locators_json, sort_order)
        VALUES (?1, ?2, 'c-test', 'motor', 'TM-42 Motor', 2, 'each', 'explicit-bom',
          'verified', 'bom.csv#row2', 0.95, 'purchased', 1, 0, '{}', '["bom.csv#row2"]', 0)`)
        .bind(crypto.randomUUID(), versionId),
    ]);

    const publicDraft = await call(`/api/v1/boms/${bomId}`);
    expect(publicDraft.status).toBe(200);
    expect(await body<{ item: { version: { publicationState: string }; items: unknown[]; totals: { lines: number } } }>(publicDraft))
      .toMatchObject({ item: { version: { publicationState: "draft" }, items: [], totals: { lines: 0 } } });
    const publicExport = await call(`/api/v1/boms/${bomId}/export?format=csv`);
    expect((await publicExport.text()).trim().split("\n")).toHaveLength(1);

    const bomList = await call("/api/v1/boms");
    const listedDraft = (await body<{ items: Array<{ id: string; line_count: number }> }>(bomList)).items.find((item) => item.id === bomId);
    expect(listedDraft?.line_count).toBe(0);

    const part = await call("/api/v1/components/c-test");
    const usage = (await body<{ item: { projectUsage: Array<{ bomId: string }> } }>(part)).item.projectUsage;
    expect(usage.some((item) => item.bomId === bomId)).toBe(false);

    const estimate = await call("/api/v1/sourcing/estimate", { method: "POST", body: jsonBody({ projectId }) });
    expect(estimate.status).toBe(409);

    const quote = await call("/api/v1/customer-quote-requests", { method: "POST", body: jsonBody({
      projectId, bomId, firstName: "Test", lastName: "Builder", email: "test@example.com",
      addressLine1: "1 Test Way", city: "Toronto", region: "ON", postalCode: "M5V 2T6",
      countryCode: "CA", consent: true,
    }) }, ownerCookie);
    expect(quote.status).toBe(409);

    const forkedBuild = await call("/api/v1/builds", { method: "POST", body: jsonBody({
      name: "Draft BOM isolation build", sourceProjectId: projectId, visibility: "private",
    }) }, ownerCookie);
    expect(forkedBuild.status).toBe(201);
    expect((await body<{ item: { items: unknown[] } }>(forkedBuild)).item.items).toHaveLength(0);

    const ownerDraft = await call(`/api/v1/boms/${bomId}`, {}, ownerCookie);
    expect((await body<{ item: { items: unknown[] } }>(ownerDraft)).item.items).toHaveLength(1);

    await env.DB.prepare("UPDATE bom_versions SET publication_state = 'verified', coverage_note = 'Every explicit source row was accounted for.' WHERE id = ?1").bind(versionId).run();
    const publicVerified = await call(`/api/v1/boms/${bomId}`);
    expect((await body<{ item: { items: unknown[]; totals: { lines: number } } }>(publicVerified)).item)
      .toMatchObject({ items: [expect.objectContaining({ evidenceLocator: "bom.csv#row2" })], totals: { lines: 1 } });
  });

  it("recommends deterministic same-category alternatives without commercial data", async () => {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO components
        (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
         source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
        VALUES ('c-alt-match', 'tm-43-motor', 'm-test', 'TM-43', 'TM-43 Motor', 'actuator', 'Matched alternative actuator',
         'active', 'https://manufacturer.example/TM-43', 'worker integration test', ?1, 0, 1, ?1, ?1)`).bind(now),
      env.DB.prepare(`INSERT INTO components
        (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
         source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
        VALUES ('c-alt-low', 'tm-99-motor', 'm-test', 'TM-99', 'TM-99 Motor', 'actuator', 'Lower confidence alternative actuator',
         'obsolete', 'https://manufacturer.example/TM-99', 'worker integration test', ?1, 0, 1, ?1, ?1)`).bind(now),
      env.DB.prepare(`INSERT INTO components
        (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
         source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
        VALUES ('c-alt-wrong', 'tm-compute', 'm-test', 'TM-C', 'TM Compute', 'compute', 'Wrong category candidate',
         'active', 'https://manufacturer.example/TM-C', 'worker integration test', ?1, 0, 1, ?1, ?1)`).bind(now),
      env.DB.prepare(`INSERT INTO component_revisions (id, component_id, revision_label, status, effective_at, created_at)
        VALUES ('cr-alt-match', 'c-alt-match', 'source-current', 'published', ?1, ?1)`).bind(now),
      env.DB.prepare(`INSERT INTO component_specs (id, component_revision_id, spec_key, label, value_number, unit, sort_order, created_at)
        VALUES ('cs-alt-match-voltage', 'cr-alt-match', 'voltage_v', 'Rated voltage', 24, 'V', 10, ?1)`).bind(now),
      env.DB.prepare("INSERT INTO component_compatibility_tags (component_id, tag) VALUES ('c-test', '24v')"),
      env.DB.prepare("INSERT INTO component_compatibility_tags (component_id, tag) VALUES ('c-alt-match', '24v')"),
    ]);

    const response = await call("/api/v1/components/c-test/alternatives?limit=2");
    expect(response.status).toBe(200);
    const result = await body<{ items: Array<{ item: { id: string; category: string; offers: unknown[]; priceHistory: unknown[] }; score: number; reasons: string[]; compatibilityStatus: string }> }>(response);
    expect(result.items.map((entry) => entry.item.id)).toEqual(["c-alt-match", "c-alt-low"]);
    expect(result.items.every((entry) => entry.item.category === "actuator" && entry.compatibilityStatus === "unverified")).toBe(true);
    expect(result.items[0].reasons).toEqual(expect.arrayContaining(["1 shared compatibility tag", "1 matching technical specification"]));
    expect(result.items.every((entry) => entry.item.offers.length === 0 && entry.item.priceHistory.length === 0)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("Private Test Supplier");
    expect(JSON.stringify(result)).not.toContain("SECRET-SKU");
    expect((await call("/api/v1/components/not-a-component/alternatives")).status).toBe(404);
  });

  it("accepts private evidence for an importer-owned open-source project claim without leaking it", async () => {
    const now = new Date().toISOString();
    const projectId = crypto.randomUUID();
    const projectVersionId = crypto.randomUUID();
    const projectSlug = `claimable-open-robot-${projectId.slice(0, 8)}`;
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
        VALUES ('robotics-catalog-import', 'Robotics catalog importer', 'catalog-importer@robopartpicker.invalid', 1, ?1, ?1)`).bind(now),
      env.DB.prepare(`INSERT INTO projects
        (id, slug, name, owner_user_id, visibility, status, current_version_id, license_spdx, repository_url,
         is_demo, version, project_kind, publishability, created_at, updated_at)
        VALUES (?1, ?2, 'Claimable Open Robot', 'robotics-catalog-import', 'public', 'published', ?3,
          'Apache-2.0', 'https://github.com/example/claimable-open-robot', 0, 1, 'physical_design', 'ready', ?4, ?4)`)
        .bind(projectId, projectSlug, projectVersionId, now),
      env.DB.prepare(`INSERT INTO project_versions
        (id, project_id, version_label, rpps_schema_version, rpps_json, status, created_at, published_at)
        VALUES (?1, ?2, '1.0.0', '1.0.0', ?3, 'published', ?4, ?4)`)
        .bind(projectVersionId, projectId, JSON.stringify(emptyRpps({ name: "Claimable Open Robot", slug: projectSlug, version: "1.0.0" })), now),
      env.DB.prepare("INSERT INTO project_maintainers (project_id, user_id, role, created_at) VALUES (?1, 'robotics-catalog-import', 'owner', ?2)")
        .bind(projectId, now),
    ]);
    const ownerEvidence = await uploadTestFile("owner-proof.txt", "private owner evidence", ownerCookie);
    const claimantEvidence = await uploadTestFile("maintainer-proof.txt", "private claimant evidence", otherCookie);

    const eligibility = await call(`/api/v1/projects/${projectId}/claim-eligibility`);
    expect(eligibility.status).toBe(200);
    expect(await body<{ item: { claimable: boolean; reason: string | null } }>(eligibility)).toMatchObject({ item: { claimable: true, reason: null } });

    const anonymous = await call(`/api/v1/projects/${projectId}/claims`, { method: "POST", body: jsonBody({ evidenceFileId: claimantEvidence }) });
    expect(anonymous.status).toBe(401);
    const foreignEvidence = await call(`/api/v1/projects/${projectId}/claims`, { method: "POST", body: jsonBody({ evidenceFileId: ownerEvidence }) }, otherCookie);
    expect(foreignEvidence.status).toBe(422);

    const submitted = await call(`/api/v1/projects/${projectId}/claims`, {
      method: "POST",
      body: jsonBody({ evidenceFileId: claimantEvidence, evidenceReference: "Repository maintainer profile and signed release history." }),
    }, otherCookie);
    expect(submitted.status).toBe(201);
    const receipt = (await body<{ item: { id: string; projectId: string; status: string; createdAt: string; updatedAt: string } }>(submitted)).item;
    expect(receipt).toMatchObject({ projectId, status: "pending" });
    expect(JSON.stringify(receipt)).not.toContain(claimantEvidence);
    expect(JSON.stringify(receipt)).not.toContain("signed release history");

    const mine = await call(`/api/v1/project-claims/mine?projectId=${projectId}`, {}, otherCookie);
    expect(mine.status).toBe(200);
    const mineBody = await body<{ items: Array<{ id: string; status: string }> }>(mine);
    expect(mineBody.items).toEqual([expect.objectContaining({ id: receipt.id, status: "pending" })]);
    expect(JSON.stringify(mineBody)).not.toContain(claimantEvidence);
    expect(JSON.stringify(mineBody)).not.toContain("signed release history");

    const publicProject = await call(`/api/v1/projects/${projectId}`);
    expect(publicProject.status).toBe(200);
    expect(await publicProject.text()).not.toContain(claimantEvidence);
  });

  it("lets a different moderator approve a claim and atomically transfer edit ownership", async () => {
    const selfProject = await seedClaimableProject("Self Review Robot");
    const selfEvidence = await uploadTestFile("self-review-proof.txt", "private self-review evidence", ownerCookie);
    const selfClaimResponse = await call(`/api/v1/projects/${selfProject.id}/claims`, {
      method: "POST", body: jsonBody({ evidenceFileId: selfEvidence }),
    }, ownerCookie);
    expect(selfClaimResponse.status).toBe(201);
    const selfClaim = (await body<{ item: { id: string } }>(selfClaimResponse)).item;
    const selfReview = await call(`/api/v1/admin/project-claims/${selfClaim.id}`, {
      method: "PATCH", body: jsonBody({ action: "approve", privateModeratorNotes: "Verified repository control and release history." }),
    }, ownerCookie);
    expect(selfReview.status).toBe(403);
    expect(await body<{ error: { code: string } }>(selfReview)).toMatchObject({ error: { code: "PROJECT_CLAIM_SELF_REVIEW_DENIED" } });

    const project = await seedClaimableProject("Transfer Review Robot");
    const evidenceFileId = await uploadTestFile("transfer-proof.txt", "private transfer evidence", otherCookie);
    const submitted = await call(`/api/v1/projects/${project.id}/claims`, {
      method: "POST", body: jsonBody({ evidenceFileId, evidenceReference: "Maintainer profile and signed tags." }),
    }, otherCookie);
    const claim = (await body<{ item: { id: string } }>(submitted)).item;

    expect((await call("/api/v1/admin/project-claims?status=pending", {}, otherCookie)).status).toBe(403);
    const queue = await call("/api/v1/admin/project-claims?status=pending", {}, ownerCookie);
    expect(queue.status).toBe(200);
    const queueBody = await body<{ items: Array<{ id: string; claimantUserId: string; evidenceFile: { id: string; contentUrl: string }; evidenceReference: string }> }>(queue);
    expect(queueBody.items).toContainEqual(expect.objectContaining({
      id: claim.id,
      claimantUserId: otherId,
      evidenceFile: expect.objectContaining({ id: evidenceFileId }),
      evidenceReference: "Maintainer profile and signed tags.",
    }));
    const queuedClaim = queueBody.items.find((item) => item.id === claim.id)!;
    expect((await call(queuedClaim.evidenceFile.contentUrl, {}, otherCookie)).status).toBe(403);
    const evidence = await call(queuedClaim.evidenceFile.contentUrl, {}, ownerCookie);
    expect(evidence.status).toBe(200);
    expect(await evidence.text()).toBe("private transfer evidence");

    const approved = await call(`/api/v1/admin/project-claims/${claim.id}`, {
      method: "PATCH", body: jsonBody({ action: "approve", privateModeratorNotes: "Verified repository control and signed release history." }),
    }, ownerCookie);
    expect(approved.status, await approved.clone().text()).toBe(200);
    expect(await body<{ item: { id: string; status: string; transferredAt: string } }>(approved)).toMatchObject({ item: { id: claim.id, status: "approved" } });
    const transferred = await env.DB.prepare("SELECT owner_user_id, version FROM projects WHERE id = ?1").bind(project.id).first<{ owner_user_id: string; version: number }>();
    expect(transferred).toEqual({ owner_user_id: otherId, version: 2 });
    expect(await env.DB.prepare("SELECT role FROM project_maintainers WHERE project_id = ?1 AND user_id = ?2").bind(project.id, otherId).first()).toEqual({ role: "owner" });
    expect(await env.DB.prepare("SELECT role FROM project_maintainers WHERE project_id = ?1 AND user_id = 'robotics-catalog-import'").bind(project.id).first()).toBeNull();
  });

  it("rejects stale project claim approval without a partial transfer", async () => {
    const project = await seedClaimableProject("Stale Review Robot");
    const evidenceFileId = await uploadTestFile("stale-proof.txt", "private stale evidence", otherCookie);
    const submitted = await call(`/api/v1/projects/${project.id}/claims`, { method: "POST", body: jsonBody({ evidenceFileId }) }, otherCookie);
    const claim = (await body<{ item: { id: string } }>(submitted)).item;
    await env.DB.prepare("UPDATE projects SET version = version + 1 WHERE id = ?1").bind(project.id).run();

    const stale = await call(`/api/v1/admin/project-claims/${claim.id}`, {
      method: "PATCH", body: jsonBody({ action: "approve", privateModeratorNotes: "The evidence looked valid before the project changed." }),
    }, ownerCookie);
    expect(stale.status).toBe(409);
    expect(await body<{ error: { code: string } }>(stale)).toMatchObject({ error: { code: "PROJECT_CLAIM_STALE" } });
    expect(await env.DB.prepare("SELECT owner_user_id FROM projects WHERE id = ?1").bind(project.id).first()).toEqual({ owner_user_id: "robotics-catalog-import" });
    expect(await env.DB.prepare("SELECT status FROM project_claim_requests WHERE id = ?1").bind(claim.id).first()).toEqual({ status: "pending" });
  });

  it("lets only the claimant withdraw a pending project claim", async () => {
    const project = await seedClaimableProject("Withdraw Claim Robot");
    const evidenceFileId = await uploadTestFile("withdraw-proof.txt", "private withdraw evidence", otherCookie);
    const submitted = await call(`/api/v1/projects/${project.id}/claims`, { method: "POST", body: jsonBody({ evidenceFileId }) }, otherCookie);
    const claim = (await body<{ item: { id: string } }>(submitted)).item;

    expect((await call(`/api/v1/project-claims/${claim.id}/withdraw`, { method: "POST", body: "{}" }, ownerCookie)).status).toBe(403);
    const withdrawn = await call(`/api/v1/project-claims/${claim.id}/withdraw`, { method: "POST", body: "{}" }, otherCookie);
    expect(withdrawn.status).toBe(200);
    expect(await body<{ item: { status: string; withdrawnAt: string } }>(withdrawn)).toMatchObject({ item: { status: "withdrawn" } });
    expect(await env.DB.prepare("SELECT owner_user_id FROM projects WHERE id = ?1").bind(project.id).first()).toEqual({ owner_user_id: "robotics-catalog-import" });
  });

  it("creates a persistent build and isolates it from another user", async () => {
    const created = await call("/api/v1/builds", { method: "POST", body: jsonBody({ name: "Private test robot", description: "A narrative build passport for the exact TM-42 test configuration.", visibility: "private" }) }, ownerCookie);
    expect(created.status).toBe(201); const createdItem = (await body<{ item: { id: string; description: string } }>(created)).item; buildId = createdItem.id;
    expect(createdItem.description).toContain("narrative build passport");
    const added = await call(`/api/v1/builds/${buildId}/items`, { method: "POST", body: jsonBody({ componentId: "c-test", description: "TM-42 Motor", quantity: 2 }) }, ownerCookie);
    expect(added.status).toBe(201);
    const denied = await call(`/api/v1/builds/${buildId}`, {}, otherCookie); expect(denied.status).toBe(403);
    const csv = await call(`/api/v1/builds/${buildId}/export?format=csv`, {}, ownerCookie); expect(csv.status).toBe(200); expect(await csv.text()).toContain("TM-42 Motor");
  });

  it("authorizes RFQ targets before estimating private BOM data", async () => {
    const createdBom = await call("/api/v1/boms", { method: "POST", body: jsonBody({
      name: "Private RFQ BOM",
      visibility: "private",
      items: [{ componentId: "c-test", slotKey: "drive-motor", description: "TM-42 Motor", quantity: 2 }],
    }) }, ownerCookie);
    expect(createdBom.status).toBe(201);
    const bomId = (await body<{ item: { id: string } }>(createdBom)).item.id;

    const deniedEstimate = await call("/api/v1/sourcing/estimate", { method: "POST", body: jsonBody({ bomId }) }, otherCookie);
    expect(deniedEstimate.status).toBe(403);
    expect(await body<{ error: { code: string } }>(deniedEstimate)).toMatchObject({ error: { code: "RESOURCE_ACCESS_DENIED" } });
    const allowedEstimate = await call("/api/v1/sourcing/estimate", { method: "POST", body: jsonBody({ bomId }) }, ownerCookie);
    expect(allowedEstimate.status).toBe(200);
    expect((await body<{ estimate: { basket: unknown[] } }>(allowedEstimate)).estimate.basket).toHaveLength(1);

    const denied = await call("/api/v1/rfq", { method: "POST", body: jsonBody({ bomId }) }, otherCookie);
    expect(denied.status).toBe(403);
    expect(await body<{ error: { code: string } }>(denied)).toMatchObject({ error: { code: "RESOURCE_ACCESS_DENIED" } });
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM rfq_requests WHERE bom_id = ?1").bind(bomId).first<{ value: number }>())?.value)).toBe(0);

    const allowed = await call("/api/v1/rfq", { method: "POST", body: jsonBody({ bomId, expiresInDays: 30 }) }, ownerCookie);
    expect(allowed.status).toBe(201);
    const request = (await body<{ item: { id: string; bomId: string; createdByUserId: string } }>(allowed)).item;
    expect(request).toMatchObject({ bomId, createdByUserId: ownerId });
    expect((await call(`/api/v1/rfq/${request.id}`, {}, otherCookie)).status).toBe(403);

    const ambiguous = await call("/api/v1/rfq", { method: "POST", body: jsonBody({ bomId, projectId: crypto.randomUUID() }) }, ownerCookie);
    expect(ambiguous.status).toBe(422);
  });

  it("rejects anonymous mine=true project listing instead of returning an empty success", async () => {
    const anonymous = await call("/api/v1/projects?mine=true&limit=50");
    expect(anonymous.status).toBe(401);
    expect(await body<{ error: { code: string } }>(anonymous)).toMatchObject({ error: { code: "AUTHENTICATION_REQUIRED" } });
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM projects").first<{ value: number }>())?.value)).toBeGreaterThanOrEqual(0);

    const authenticated = await call("/api/v1/projects?mine=true&limit=50", {}, ownerCookie);
    expect(authenticated.status).toBe(200);
  });

  it("canonicalizes persisted managed project media URLs at the API boundary", async () => {
    const legacyCover = "https://robopartpicker-production.ludomi2502.workers.dev/api/v1/files/content?id=legacy-cover";
    const legacyRppsImage = "https://robopartpicker-production.ludomi2502.workers.dev/api/v1/files/content?id=legacy-rpps-image";
    const officialImage = "https://manufacturer.example/robots/canonical-media-bot.webp";
    const created = await call("/api/v1/projects", { method: "POST", body: jsonBody({
      visibility: "private",
      rpps: emptyRpps({
        name: "Canonical Media Bot",
        slug: "canonical-media-bot",
        cover_image_url: legacyCover,
        files: [
          { path: "images/managed.webp", kind: "image", url: legacyRppsImage },
          { path: "images/official.webp", kind: "image", url: officialImage },
        ],
      }),
    }) }, ownerCookie);
    expect(created.status).toBe(201);
    const project = (await body<{ item: {
      id: string;
      slug: string;
      cover_image_url: string | null;
      rpps: { cover_image_url?: string; files?: Array<{ url?: string }> };
    } }>(created)).item;
    expect(project.cover_image_url).toBe("/api/v1/files/content?id=legacy-cover");
    expect(project.rpps.cover_image_url).toBe("/api/v1/files/content?id=legacy-cover");
    expect(project.rpps.files?.map((file) => file.url)).toEqual([
      "/api/v1/files/content?id=legacy-rpps-image",
      officialImage,
    ]);

    const initialized = await call("/api/v1/files/uploads", { method: "POST", body: jsonBody({
      originalName: "managed-preview.png",
      mediaType: "image/png",
      sizeBytes: 24,
      kind: "image",
      visibility: "private",
    }) }, ownerCookie);
    expect(initialized.status).toBe(201);
    const upload = await body<{ file: { id: string }; upload: { url: string; token: string } }>(initialized);
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect((await call(upload.upload.url, {
      method: "PUT",
      headers: { "content-type": "image/png", "content-length": "24", "x-upload-token": upload.upload.token },
      body: pngHeader,
    }, ownerCookie)).status).toBe(201);
    expect((await call(`/api/v1/files/${upload.file.id}/attachments`, {
      method: "POST",
      body: jsonBody({ entityType: "project", entityId: project.id, purpose: "media", relativePath: "images/managed-preview.png", altText: "Managed preview" }),
    }, ownerCookie)).status).toBe(201);

    const listedResponse = await call("/api/v1/projects?mine=true&limit=100", {}, ownerCookie);
    expect(listedResponse.status).toBe(200);
    const listed = (await body<{ items: Array<{ slug: string; media: Array<{ contentUrl: string }> }> }>(listedResponse)).items
      .find((item) => item.slug === project.slug);
    expect(listed?.media).toEqual([
      expect.objectContaining({ contentUrl: `/api/v1/files/content?id=${encodeURIComponent(upload.file.id)}` }),
    ]);

    const fetched = await call(`/api/v1/projects/${project.slug}`, {}, ownerCookie);
    expect(fetched.status).toBe(200);
    const fetchedProject = (await body<{ item: { cover_image_url: string | null; rpps: { cover_image_url?: string; files?: Array<{ url?: string }> } } }>(fetched)).item;
    expect(fetchedProject.cover_image_url).toBe("/api/v1/files/content?id=legacy-cover");
    expect(fetchedProject.rpps.cover_image_url).toBe("/api/v1/files/content?id=legacy-cover");
    expect(fetchedProject.rpps.files?.[0]?.url).toBe("/api/v1/files/content?id=legacy-rpps-image");
  });

  it("requires RFQ auth and project access before sourcing estimation", async () => {
    const privateProjectResponse = await call("/api/v1/projects", { method: "POST", body: jsonBody({
      visibility: "private",
      rpps: emptyRpps({ name: "Private RFQ Project", slug: "private-rfq-project", bom: [{ name: "TM-42 Motor", manufacturer: "Test Motors", mpn: "TM-42", qty: 2 }] }),
    }) }, ownerCookie);
    expect(privateProjectResponse.status).toBe(201);
    const privateProject = (await body<{ item: { id: string } }>(privateProjectResponse)).item;

    const denied = await call("/api/v1/rfq", { method: "POST", body: jsonBody({ projectId: privateProject.id }) }, otherCookie);
    expect(denied.status).toBe(403);
    expect(await body<{ error: { code: string } }>(denied)).toMatchObject({ error: { code: "RESOURCE_ACCESS_DENIED" } });
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM rfq_requests WHERE project_id = ?1").bind(privateProject.id).first<{ value: number }>())?.value)).toBe(0);

    const ownerAllowed = await call("/api/v1/rfq", { method: "POST", body: jsonBody({ projectId: privateProject.id }) }, ownerCookie);
    expect(ownerAllowed.status).toBe(201);
    expect((await body<{ item: { projectId: string; createdByUserId: string; estimateSnapshot: { basket: unknown[] } } }>(ownerAllowed)).item)
      .toMatchObject({ projectId: privateProject.id, createdByUserId: ownerId, estimateSnapshot: { basket: expect.any(Array) } });

    const publicProjectResponse = await call("/api/v1/projects", { method: "POST", body: jsonBody({
      visibility: "public",
      rpps: emptyRpps({ name: "Public RFQ Project", slug: "public-rfq-project", bom: [{ name: "TM-42 Motor", manufacturer: "Test Motors", mpn: "TM-42", qty: 1 }] }),
    }) }, ownerCookie);
    expect(publicProjectResponse.status).toBe(201);
    const publicProject = (await body<{ item: { id: string } }>(publicProjectResponse)).item;

    const unauthenticated = await call("/api/v1/rfq", { method: "POST", body: jsonBody({ projectId: publicProject.id }) });
    expect(unauthenticated.status).toBe(401);
    expect(await body<{ error: { code: string } }>(unauthenticated)).toMatchObject({ error: { code: "AUTHENTICATION_REQUIRED" } });

    const publicAllowed = await call("/api/v1/rfq", { method: "POST", body: jsonBody({ projectId: publicProject.id }) }, otherCookie);
    expect(publicAllowed.status).toBe(409);
    expect(await body<{ error: { code: string } }>(publicAllowed)).toMatchObject({ error: { code: "BOM_NOT_PUBLISHED" } });
  });

  it("runs the RFQ response lifecycle safely and rejects invalid response writes", async () => {
    const createdBom = await call("/api/v1/boms", { method: "POST", body: jsonBody({
      name: "RFQ Response BOM",
      visibility: "private",
      items: [{ componentId: "c-test", slotKey: "drive-motor", description: "TM-42 Motor", quantity: 2 }],
    }) }, ownerCookie);
    expect(createdBom.status).toBe(201);
    const bomId = (await body<{ item: { id: string } }>(createdBom)).item.id;

    const created = await call("/api/v1/rfq", { method: "POST", body: jsonBody({ bomId }) }, ownerCookie);
    expect(created.status).toBe(201);
    const request = (await body<{ item: { id: string; status: string } }>(created)).item;
    expect(request.status).toBe("estimate_ready");

    const premature = await call(`/api/v1/rfq/${request.id}/responses`, { method: "POST", body: jsonBody({ items: [{ lineKey: "drive-motor", quoteUnitPriceMinor: 1200, quoteCurrency: "USD" }] }) }, ownerCookie);
    expect(premature.status).toBe(409);
    expect(await body<{ error: { code: string } }>(premature)).toMatchObject({ error: { code: "RFQ_INVALID_TRANSITION" } });
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM rfq_line_items WHERE rfq_request_id = ?1 AND quote_unit_price_minor IS NOT NULL").bind(request.id).first<{ value: number }>())?.value)).toBe(0);

    for (const action of ["request", "prepare", "send"] as const) {
      const transitioned = await call(`/api/v1/rfq/${request.id}/transition`, { method: "POST", body: jsonBody({ action }) }, ownerCookie);
      expect(transitioned.status, `${action}: ${await transitioned.clone().text()}`).toBe(200);
    }

    const detail = await call(`/api/v1/rfq/${request.id}`, {}, ownerCookie);
    expect(detail.status).toBe(200);
    const line = (await body<{ lines: Array<{ lineKey: string }> }>(detail)).lines[0];
    expect(line.lineKey).toBe("drive-motor");

    const unknownLine = await call(`/api/v1/rfq/${request.id}/responses`, { method: "POST", body: jsonBody({ items: [{ lineKey: "missing-line", quoteUnitPriceMinor: 1200, quoteCurrency: "USD" }] }) }, ownerCookie);
    expect(unknownLine.status).toBe(400);
    expect(await body<{ error: { code: string } }>(unknownLine)).toMatchObject({ error: { code: "RFQ_UNKNOWN_LINE" } });

    const response = await call(`/api/v1/rfq/${request.id}/responses`, { method: "POST", body: jsonBody({ items: [{ lineKey: line.lineKey, quoteUnitPriceMinor: 1200, quoteCurrency: "USD", supplierSku: "ALT-1", isSubstitute: true }] }) }, ownerCookie);
    expect(response.status, await response.clone().text()).toBe(200);
    expect((await body<{ item: { status: string } }>(response)).item.status).toBe("partial_quotes_received");

    const omittedSubstitute = await call(`/api/v1/rfq/${request.id}/responses`, { method: "POST", body: jsonBody({ items: [{ lineKey: line.lineKey, supplierSku: "ALT-2" }] }) }, ownerCookie);
    expect(omittedSubstitute.status, await omittedSubstitute.clone().text()).toBe(200);
    const storedLine = await env.DB.prepare("SELECT quote_unit_price_minor AS price, quote_currency AS currency, supplier_sku AS sku, is_substitute AS substitute FROM rfq_line_items WHERE rfq_request_id = ?1 AND line_key = ?2")
      .bind(request.id, line.lineKey).first<{ price: number; currency: string; sku: string; substitute: number }>();
    expect(storedLine).toEqual({ price: 1200, currency: "USD", sku: "ALT-2", substitute: 1 });

    const reconciled = await call(`/api/v1/rfq/${request.id}/reconcile`, { method: "POST", body: jsonBody({}) }, ownerCookie);
    expect(reconciled.status, await reconciled.clone().text()).toBe(200);
    expect((await body<{ item: { status: string } }>(reconciled)).item.status).toBe("user_review_required");
    const approved = await call(`/api/v1/rfq/${request.id}/approve`, { method: "POST", body: jsonBody({}) }, ownerCookie);
    expect(approved.status, await approved.clone().text()).toBe(200);
    expect((await body<{ item: { status: string } }>(approved)).item.status).toBe("option_selected");
  });

  it("estimates a project BOM through the public project workflow", async () => {
    const created = await call("/api/v1/projects", { method: "POST", body: jsonBody({
      visibility: "public",
      rpps: emptyRpps({ name: "Public Sourcing Robot", slug: "public-sourcing-robot", bom: [{ name: "TM-42 Motor", manufacturer: "Test Motors", mpn: "TM-42", qty: 2 }] }),
    }) }, ownerCookie);
    expect(created.status).toBe(201);
    const project = (await body<{ item: { id: string; slug: string } }>(created)).item;

    const byId = await call("/api/v1/sourcing/estimate", { method: "POST", body: jsonBody({ projectId: project.id }) });
    expect(byId.status).toBe(409);
    expect(await body<{ error: { code: string } }>(byId)).toMatchObject({ error: { code: "BOM_NOT_PUBLISHED" } });

    const bySlug = await call("/api/v1/sourcing/estimate", { method: "POST", body: jsonBody({ projectId: project.slug }) });
    expect(bySlug.status).toBe(409);
  });

  it("persists build configuration, firmware, calibration, and test records with build authorization", async () => {
    const configuration = await call(`/api/v1/builds/${buildId}/configurations`, { method: "POST", body: jsonBody({ name: "Motor controller", format: "yaml", contentText: "motor:\n  current_limit: 12" }) }, ownerCookie);
    expect(configuration.status).toBe(201); const configurationId = (await body<{ item: { id: string } }>(configuration)).item.id;
    const firmware = await call(`/api/v1/builds/${buildId}/firmware`, { method: "POST", body: jsonBody({ name: "Drive firmware", repositoryUrl: "https://github.com/example/drive-firmware", revision: "v1.2.0", licenseSpdx: "MIT", notes: "Pinned for repeatability." }) }, ownerCookie);
    expect(firmware.status).toBe(201);
    const calibration = await call(`/api/v1/builds/${buildId}/calibrations`, { method: "POST", body: jsonBody({ name: "Encoder zero", procedureText: "Unload the shaft and set the encoder offset.", resultData: { offsetDegrees: 0.42 }, status: "passed" }) }, ownerCookie);
    expect(calibration.status).toBe(201);
    const unattachedEvidence = await call(`/api/v1/builds/${buildId}/tests`, { method: "POST", body: jsonBody({ name: "Unattached evidence", methodText: "Reference a file outside the build.", result: "pending", evidenceFileId: crypto.randomUUID() }) }, ownerCookie);
    expect(unattachedEvidence.status).toBe(422);
    const test = await call(`/api/v1/builds/${buildId}/tests`, { method: "POST", body: jsonBody({ name: "No-load spin", methodText: "Command 100 RPM for 60 seconds.", expectedText: "Stable speed within 2 RPM.", observedText: "Maximum error was 1.4 RPM.", result: "passed" }) }, ownerCookie);
    expect(test.status).toBe(201);
    const denied = await call(`/api/v1/builds/${buildId}/tests`, { method: "POST", body: jsonBody({ name: "Unauthorized test", methodText: "Should never persist.", result: "pending" }) }, otherCookie);
    expect(denied.status).toBe(403);
    const detail = await call(`/api/v1/builds/${buildId}`, {}, ownerCookie);
    expect(detail.status).toBe(200);
    const record = (await body<{ item: { configurations: unknown[]; firmware: unknown[]; calibrations: Array<{ resultData: unknown }>; tests: unknown[] } }>(detail)).item;
    expect(record.configurations).toHaveLength(1); expect(record.firmware).toHaveLength(1); expect(record.calibrations).toHaveLength(1); expect(record.tests).toHaveLength(1);
    expect(record.calibrations[0].resultData).toEqual({ offsetDegrees: 0.42 });
    const removed = await call(`/api/v1/builds/${buildId}/configurations/${configurationId}`, { method: "DELETE" }, ownerCookie);
    expect(removed.status).toBe(204);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM build_configurations WHERE id = ?1").bind(configurationId).first<{ value: number }>())?.value)).toBe(0);
  });

  it("preserves completed step attribution when editing a completed build step", async () => {
    const created = await call("/api/v1/builds", { method: "POST", body: jsonBody({ name: "Step edit regression", description: "Validates build step editing does not erase completion metadata." }) }, ownerCookie);
    expect(created.status).toBe(201);
    const build = (await body<{ item: { id: string } }>(created)).item;

    const added = await call(`/api/v1/builds/${build.id}/steps`, { method: "POST", body: jsonBody({ title: "Assemble frame", body: "Install the chassis and verify fasteners." }) }, ownerCookie);
    expect(added.status).toBe(201);
    const step = (await body<{ item: { id: string; status: string; completedByUserId: string | null; completedAt: string | null } }>(added)).item;

    const completed = await call(`/api/v1/builds/${build.id}/steps/${step.id}`, { method: "PATCH", body: jsonBody({ status: "complete" }) }, ownerCookie);
    expect(completed.status).toBe(200);
    const completedStep = (await body<{ item: { status: string; completedByUserId: string | null; completedAt: string | null } }>(completed)).item;
    expect(completedStep).toMatchObject({ status: "complete", completedByUserId: ownerId, completedAt: expect.any(String) });

    const edited = await call(`/api/v1/builds/${build.id}/steps/${step.id}`, { method: "PATCH", body: jsonBody({ title: "Assemble frame v2", body: "Install the chassis, verify fasteners, and check square." }) }, ownerCookie);
    expect(edited.status).toBe(200);
    const editedStep = (await body<{ item: { title: string; body: string | null; status: string; completedByUserId: string | null; completedAt: string | null } }>(edited)).item;
    expect(editedStep).toMatchObject({
      title: "Assemble frame v2",
      status: "complete",
      completedByUserId: ownerId,
      completedAt: expect.any(String),
    });
  });

  it("enforces accepted-answer ownership and reopens a question after reply deletion", async () => {
    const threadResponse = await call("/api/v1/community/threads", { method: "POST", body: jsonBody({ categoryId: "cat-general", title: "How should this test actuator be calibrated?", slug: "test-actuator-calibration", body: "I need a repeatable calibration method for this actuator before integration.", tags: ["calibration"], threadType: "question", structuredData: {} }) }, ownerCookie);
    expect(threadResponse.status).toBe(201); const threadId = (await body<{ item: { id: string } }>(threadResponse)).item.id;
    const replyResponse = await call(`/api/v1/community/threads/${threadId}/posts`, { method: "POST", body: jsonBody({ body: "Use a fixed reference load, record encoder zero, and repeat three times." }) }, otherCookie);
    expect(replyResponse.status).toBe(201); const postId = (await body<{ item: { id: string } }>(replyResponse)).item.id;
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM notifications WHERE user_id = ?1 AND notification_type = 'community_reply'").bind(ownerId).first<{ value: number }>())?.value)).toBe(1);
    const preference = await call("/api/v1/notifications/preferences", { method: "PUT", body: jsonBody({ notificationType: "community_reply", inAppEnabled: false, emailEnabled: false }) }, ownerCookie);
    expect(preference.status).toBe(200);
    const mutedReply = await call(`/api/v1/community/threads/${threadId}/posts`, { method: "POST", body: jsonBody({ body: "A second valid reply should respect the owner's muted in-app preference." }) }, otherCookie);
    expect(mutedReply.status).toBe(201);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM notifications WHERE user_id = ?1 AND notification_type = 'community_reply'").bind(ownerId).first<{ value: number }>())?.value)).toBe(1);
    const forbidden = await call(`/api/v1/community/threads/${threadId}/accepted-answer`, { method: "PUT", body: jsonBody({ postId }) }, otherCookie); expect(forbidden.status).toBe(403);
    await forbidden.text();
    const ownership = await env.DB.prepare("SELECT user_id, thread_type FROM forum_threads WHERE id = ?1").bind(threadId).first<{ user_id: string; thread_type: string }>();
    expect(ownership).toEqual({ user_id: ownerId, thread_type: "question" });
    const accepted = await call(`/api/v1/community/threads/${threadId}/accepted-answer`, { method: "PUT", body: jsonBody({ postId }) }, ownerCookie);
    const acceptedText = await accepted.text(); expect(accepted.status, acceptedText).toBe(200);
    const removed = await call(`/api/v1/community/posts/${postId}`, { method: "DELETE" }, otherCookie); expect(removed.status).toBe(204);
    const row = await env.DB.prepare("SELECT status, accepted_post_id FROM forum_threads WHERE id = ?1").bind(threadId).first<{ status: string; accepted_post_id: string | null }>();
    expect(row).toEqual({ status: "open", accepted_post_id: null });
  });

  it("stages partial ingestion batches, rejects malformed records, and is idempotent", async () => {
    const payload = { schemaVersion: "1.0", batchId: "batch-integration-1", idempotencyKey: "idempotency-integration-1", retrievalTimestamp: new Date().toISOString(), source: { name: "Integration Scraper", type: "test" }, records: [
      { externalRecordId: "maker-1", recordType: "manufacturer", sourceUrl: "https://example.net/maker", rawPayload: { name: "Imported Motors" }, parsedData: { name: "Imported Motors", websiteUrl: "https://example.net" }, confidence: 0.9 },
      { externalRecordId: "bad-component", recordType: "component", rawPayload: {}, parsedData: { category: "actuator" }, confidence: 0.2 },
    ] };
    const first = await call("/api/v1/imports/batches", { method: "POST", headers: { authorization: `Bearer ${ingestionSecret}`, "idempotency-key": payload.idempotencyKey }, body: jsonBody(payload) });
    expect(first.status).toBe(202); const result = await body<{ job: { status: string; acceptedCount: number; rejectedCount: number } }>(first); expect(result.job).toMatchObject({ status: "partial", acceptedCount: 1, rejectedCount: 1 });
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM staging_manufacturers").first<{ value: number }>())?.value)).toBe(1);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM manufacturers WHERE name = 'Imported Motors'").first<{ value: number }>())?.value)).toBe(0);
    const staged = await env.DB.prepare("SELECT id FROM import_records WHERE external_record_id = 'maker-1'").first<{ id: string }>();
    const approved = await call(`/api/v1/admin/import-records/${staged?.id}/approve`, { method: "POST", body: jsonBody({ decision: "create" }) }, ownerCookie);
    expect(approved.status).toBe(200);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM manufacturers WHERE name = 'Imported Motors'").first<{ value: number }>())?.value)).toBe(1);
    const duplicate = await call("/api/v1/imports/batches", { method: "POST", headers: { authorization: `Bearer ${ingestionSecret}`, "idempotency-key": payload.idempotencyKey }, body: jsonBody(payload) });
    expect(duplicate.status).toBe(200); expect((await body<{ duplicate: boolean }>(duplicate)).duplicate).toBe(true);
  });

  it("promotes dependent offer, project, BOM, and integration records after review", async () => {
    const payload = { schemaVersion: "1.0", batchId: "batch-promotion-1", idempotencyKey: "idempotency-promotion-1", retrievalTimestamp: new Date().toISOString(), source: { name: "Promotion Scraper", type: "test" }, records: [
      { externalRecordId: "supplier-1", recordType: "supplier", rawPayload: {}, parsedData: { name: "Promotion Parts", regions: ["CA"] }, confidence: 0.8 },
      { externalRecordId: "component-1", recordType: "component", rawPayload: {}, parsedData: { name: "Promotion Actuator", category: "actuator", specs: { voltage: 24 } }, confidence: 0.8 },
      { externalRecordId: "offer-1", recordType: "offer", sourceUrl: "https://example.net/offer-1", rawPayload: {}, parsedData: { supplierExternalId: "supplier-1", componentExternalId: "component-1", supplierSku: "PROMO-1", currency: "CAD", unitPriceMinor: 12500, regionCode: "CA", observedAt: new Date().toISOString() }, confidence: 0.8 },
      { externalRecordId: "project-1", recordType: "project", rawPayload: {}, parsedData: { name: "Promotion Robot", repositoryUrl: "https://github.com/example/promotion-robot", licenseSpdx: "MIT", extracted: { summary: "Admin-reviewed imported robot project." } }, confidence: 0.8 },
      { externalRecordId: "bom-1", recordType: "bom", rawPayload: {}, parsedData: { name: "Promotion Robot BOM", items: [{ ref: "ACT-1", name: "Promotion Actuator", quantity: 2, componentExternalId: "component-1" }] }, confidence: 0.8 },
      { externalRecordId: "integration-1", recordType: "integration", rawPayload: {}, parsedData: { name: "Promotion actuator integration", integrationType: "mechanical", entities: [{ recordType: "component", externalRecordId: "component-1", role: "actuator" }, { recordType: "project", externalRecordId: "project-1", role: "project" }] }, confidence: 0.8 },
      { externalRecordId: "evidence-1", recordType: "evidence", sourceUrl: "https://example.net/evidence-1", rawPayload: {}, parsedData: { title: "Promotion actuator datasheet", sourceType: "manufacturer_datasheet" }, confidence: 0.8 },
    ] };
    const staged = await call("/api/v1/imports/batches", { method: "POST", headers: { authorization: `Bearer ${ingestionSecret}`, "idempotency-key": payload.idempotencyKey }, body: jsonBody(payload) });
    expect(staged.status).toBe(202);
    const rows = await env.DB.prepare("SELECT id, record_type FROM import_records WHERE import_job_id = (SELECT id FROM import_jobs WHERE batch_id = ?1)").bind(payload.batchId).all<{ id: string; record_type: string }>();
    const ids = new Map(rows.results.map((row) => [row.record_type, row.id]));
    const prematureOffer = await call(`/api/v1/admin/import-records/${ids.get("offer")}/approve`, { method: "POST", body: jsonBody({ decision: "create" }) }, ownerCookie);
    expect(prematureOffer.status).toBe(422);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM supplier_offers WHERE supplier_sku = 'PROMO-1'").first<{ value: number }>())?.value)).toBe(0);
    for (const type of ["supplier", "component", "project", "offer", "bom", "integration", "evidence"]) {
      const response = await call(`/api/v1/admin/import-records/${ids.get(type)}/approve`, { method: "POST", body: jsonBody({ decision: "create" }) }, ownerCookie);
      expect(response.status, `${type}: ${await response.text()}`).toBe(200);
    }
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM supplier_offers WHERE supplier_sku = 'PROMO-1'").first<{ value: number }>())?.value)).toBe(1);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM projects WHERE name = 'Promotion Robot'").first<{ value: number }>())?.value)).toBe(1);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM boms WHERE name = 'Promotion Robot BOM'").first<{ value: number }>())?.value)).toBe(1);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM integrations WHERE name = 'Promotion actuator integration'").first<{ value: number }>())?.value)).toBe(1);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM evidence WHERE title = 'Promotion actuator datasheet'").first<{ value: number }>())?.value)).toBe(1);
  });

  it("serves files whose imported ids contain slashes through the safe content endpoint", async () => {
    const now = new Date().toISOString();
    const fileId = "harvest/github.com/example/robot/README.md";
    const objectKey = `tests/${crypto.randomUUID()}/slash-id-readme.txt`;
    await env.FILES.put(objectKey, "slash-id content", { httpMetadata: { contentType: "text/plain", cacheControl: "private, no-store" } });
    await env.DB.prepare(`INSERT INTO files
      (id, object_key, original_name, media_type, size_bytes, owner_user_id, visibility, status, kind, metadata_json, created_at, updated_at)
      VALUES (?1, ?2, 'README.md', 'text/plain', 16, ?3, 'private', 'ready', 'document', '{}', ?4, ?4)`)
      .bind(fileId, objectKey, ownerId, now).run();

    const metadata = await call("/api/v1/files", {}, ownerCookie);
    expect(metadata.status).toBe(200);
    expect((await body<{ items: Array<{ id: string; contentUrl: string }> }>(metadata)).items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: fileId,
        contentUrl: `/api/v1/files/content?id=${encodeURIComponent(fileId)}`,
      }),
    ]));

    const denied = await call(`/api/v1/files/content?id=${encodeURIComponent(fileId)}`, {}, otherCookie);
    expect(denied.status).toBe(403);
    await denied.text();

    const safeContent = await call(`/api/v1/files/content?id=${encodeURIComponent(fileId)}`, {}, ownerCookie);
    expect(safeContent.status).toBe(200);
    expect(await safeContent.text()).toBe("slash-id content");

    const ambiguousOldRoute = await call(`/api/v1/files/${encodeURIComponent(fileId)}/content`, {}, ownerCookie);
    expect(ambiguousOldRoute.status).toBe(404);
    await ambiguousOldRoute.text();
  });

  it("keeps the legacy UUID content route working", async () => {
    const initialized = await call("/api/v1/files/uploads", { method: "POST", body: jsonBody({ originalName: "evidence.txt", mediaType: "text/plain", sizeBytes: 5, kind: "document", visibility: "private" }) }, ownerCookie);
    expect(initialized.status).toBe(201); const upload = await body<{ file: { id: string }; upload: { url: string; token: string }; accessUrl?: string }>(initialized);
    const stored = await call(upload.upload.url, { method: "PUT", headers: { "content-type": "text/plain", "content-length": "5", "x-upload-token": upload.upload.token }, body: "hello" }, ownerCookie);
    expect(stored.status).toBe(201); const storedBody = await body<{ status: string; accessUrl: string }>(stored); expect(storedBody.status).toBe("ready");
    expect(storedBody.accessUrl).toBe(`/api/v1/files/content?id=${encodeURIComponent(upload.file.id)}`);
    const attached = await call(`/api/v1/files/${upload.file.id}/attachments`, { method: "POST", body: jsonBody({ entityType: "build", entityId: buildId, purpose: "test_evidence" }) }, ownerCookie); expect(attached.status).toBe(201);
    const denied = await call(`/api/v1/files/${upload.file.id}/content`, {}, otherCookie); expect(denied.status).toBe(403); await denied.text();
    const content = await call(`/api/v1/files/${upload.file.id}/content`, {}, ownerCookie); expect(content.status).toBe(200); expect(await content.text()).toBe("hello");
    const safeContent = await call(storedBody.accessUrl, {}, ownerCookie); expect(safeContent.status).toBe(200); expect(await safeContent.text()).toBe("hello");
  });

  it("analyzes portable RPPS, BOM, and URDF inputs anonymously without persisting product data", async () => {
    const projectsBefore = Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM projects").first<{ value: number }>())?.value);
    const bom = await call("/api/v1/projects/import/analyze", {
      method: "POST",
      body: jsonBody({
        sourceType: "bom",
        fileName: "bom.csv",
        content: "Name,Manufacturer,MPN,Quantity\nDrive motor,Test Motors,TM-42,2\nController,Control Works,CW-7,1\n",
      }),
    });
    expect(bom.status).toBe(200);
    const bomAnalysis = (await body<{ analysis: {
      deterministic: boolean; aiUsed: boolean; manifest: { components: Array<{ name: string; quantity: number; mpn?: string }> };
      inventory: { detected: string[] }; retrieval: { mode: string; provider: string; attemptedFiles: number; fetchedFiles: number; failedFiles: number; mirroredFiles: number }; report: { profiles: { core: { score: number } }; findings: Array<{ ruleId: string }> };
    } }>(bom)).analysis;
    expect(bomAnalysis).toMatchObject({ deterministic: true, aiUsed: false });
    expect(bomAnalysis.retrieval).toMatchObject({ mode: "inline", provider: "request", attemptedFiles: 1, fetchedFiles: 1, failedFiles: 0, mirroredFiles: 0 });
    expect(bomAnalysis.inventory.detected).toContain("bom");
    expect(bomAnalysis.manifest.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Drive motor", quantity: 2, mpn: "TM-42" }),
      expect.objectContaining({ name: "Controller", quantity: 1, mpn: "CW-7" }),
    ]));
    expect(bomAnalysis.report.profiles.core.score).toBeGreaterThanOrEqual(0);

    const urdf = await call("/api/v1/projects/import/analyze", {
      method: "POST",
      body: jsonBody({ sourceType: "urdf", fileName: "robot.urdf", content: '<robot name="benchbot"><link name="base_link"/><link name="tool0"/></robot>' }),
    });
    expect(urdf.status).toBe(200);
    const urdfAnalysis = (await body<{ analysis: { manifest: { interfaces: Array<{ kind: string; name: string; description: string }> } } }>(urdf)).analysis;
    expect(urdfAnalysis.manifest.interfaces).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "coordinate-frame", name: "base_link coordinate frame" }),
      expect.objectContaining({ kind: "coordinate-frame", name: "tool0 coordinate frame" }),
    ]));
    expect(urdfAnalysis.manifest.interfaces[0].description).toContain("has not been inferred");

    const portable = await call("/api/v1/projects/import/analyze", {
      method: "POST",
      body: jsonBody({ sourceType: "rpps", fileName: "rpps.yaml", content: portableRpps }),
    });
    expect(portable.status).toBe(200);
    const portableAnalysis = (await body<{ analysis: { manifest: { project: { id: string }; extensions: Record<string, unknown> }; importWarnings: string[] } }>(portable)).analysis;
    expect(portableAnalysis.manifest.project.id).toBe("project:portable-test");
    expect(portableAnalysis.manifest.extensions["org.example.test"]).toEqual({ preserved: true });
    expect(portableAnalysis.importWarnings).not.toContain(expect.stringContaining("No portable rpps.yaml"));

    const unsafePath = await call("/api/v1/projects/import/analyze", {
      method: "POST", body: jsonBody({ sourceType: "bom", fileName: "../bom.csv", content: "Name,Quantity\nMotor,1" }),
    });
    expect(unsafePath.status).toBe(422);
    expect((await body<{ error: { code: string } }>(unsafePath)).error.code).toBe("UNSAFE_ARCHIVE_PATH");
    const nonCanonicalRepository = await call("/api/v1/projects/import/analyze", {
      method: "POST", body: jsonBody({ sourceType: "github", repositoryUrl: "https://github.com.example.invalid/owner/repository" }),
    });
    expect(nonCanonicalRepository.status).toBe(422);
    expect((await body<{ error: { code: string } }>(nonCanonicalRepository)).error.code).toBe("UNSUPPORTED_REPOSITORY_URL");

    const projectsAfter = Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM projects").first<{ value: number }>())?.value);
    expect(projectsAfter).toBe(projectsBefore);
  });

  it("stores project ZIPs privately in R2 and bounds archive analysis to the owner", async () => {
    const archive = zipSync({
      "README.md": strToU8("# Bench robot\nA small robot used for repeatable integration tests.\n\n## Quick Start\n1. Read the project overview.\n2. Review the supported interfaces.\n\n## Calibration\n1. Zero the wheel encoders on a level surface."),
      "docs/assembly_guide.md": strToU8("# Assembly Guide\n\n## Assembly\n1. Bolt the drive motors to the chassis.\n2. Route and strain-relieve the motor cables.\n3. Verify every chassis fastener is secure."),
      "bom/parts.csv": strToU8("Name,Manufacturer,MPN,Quantity\nDrive motor,Test Motors,TM-42,2\n"),
      "description/robot.urdf": strToU8('<robot name="benchbot"><link name="base_link"><visual><geometry><mesh filename="../cad/chassis.stl"/></geometry></visual></link><link name="wheel_link"/><joint name="wheel_joint" type="continuous"><parent link="base_link"/><child link="wheel_link"/></joint></robot>'),
      "software/package.xml": strToU8('<package format="3"><name>benchbot_driver</name><version>1.2.0</version><depend>rclcpp</depend><exec_depend>sensor_msgs</exec_depend></package>'),
      "config/controller.yaml": strToU8("motor:\n  current_limit: 12\n  enabled: true\n"),
      ".github/workflows/ci.yml": strToU8("name: validate\non: [push]\njobs: {}\n"),
      "docs/hero.png": strToU8("inventory-only-image"),
      "cad/chassis.step": strToU8("ISO-10303-21; placeholder for inventory-only analysis"),
    });
    const initialized = await call("/api/v1/files/uploads", {
      method: "POST",
      body: jsonBody({ originalName: "bench-robot.zip", mediaType: "application/zip", sizeBytes: archive.byteLength, kind: "attachment", visibility: "private" }),
    }, ownerCookie);
    expect(initialized.status).toBe(201);
    const upload = await body<{ file: { id: string }; upload: { url: string; token: string } }>(initialized);
    const stored = await call(upload.upload.url, {
      method: "PUT",
      headers: { "content-type": "application/zip", "content-length": String(archive.byteLength), "x-upload-token": upload.upload.token },
      body: archive,
    }, ownerCookie);
    expect(stored.status).toBe(201);

    const denied = await call("/api/v1/projects/import/archive", { method: "POST", body: jsonBody({ fileId: upload.file.id }) }, otherCookie);
    expect(denied.status).toBe(403);
    const analyzed = await call("/api/v1/projects/import/archive", { method: "POST", body: jsonBody({ fileId: upload.file.id }) }, ownerCookie);
    expect(analyzed.status).toBe(200);
    const result = (await body<{ analysis: {
      schemaVersion: string; sourceType: string; deterministic: boolean; aiUsed: boolean; inventory: { totalFiles: number; relevantFiles: number; detected: string[] }; retrieval: { mode: string; provider: string; fetchedFiles: number; mirroredFiles: number };
      manifest: { components: Array<{ mpn?: string }>; interfaces: Array<{ kind: string }> }; sourceMappings: unknown[];
      extracted: { model: { robotName: string; linkCount: number; movableJointCount: number; meshPaths: string[]; joints: Array<{ name: string; parent?: string; child?: string }> }; software: { packages: Array<{ name: string; dependencies: string[] }> }; configuration: { parameters: Array<{ keyPath: string; valueType: string }> }; repository: { ciDefinitions: string[]; nativeCadArtifacts: string[] }; procedureCandidates: Array<{ kind: string; steps: string[]; confidence: number }>; previews: { imagePath: string; modelPath: string; modelKind: string } };
    } }>(analyzed)).analysis;
    expect(result).toMatchObject({ schemaVersion: "project-import-analysis/3", sourceType: "archive", deterministic: true, aiUsed: false });
    expect(result.retrieval).toMatchObject({ mode: "uploaded", provider: "r2", mirroredFiles: 1 });
    expect(result.retrieval.fetchedFiles).toBeGreaterThan(0);
    expect(result.inventory).toMatchObject({ totalFiles: 9, relevantFiles: 9 });
    expect(result.inventory.detected).toEqual(expect.arrayContaining(["bom", "cad", "documentation", "image", "urdf"]));
    expect(result.manifest.components).toEqual(expect.arrayContaining([expect.objectContaining({ mpn: "TM-42" })]));
    expect(result.manifest.interfaces).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "coordinate-frame" })]));
    expect(result.extracted.model).toMatchObject({ robotName: "benchbot", linkCount: 2, movableJointCount: 1 });
    expect(result.extracted.model.meshPaths).toContain("../cad/chassis.stl");
    expect(result.extracted.model.joints).toEqual(expect.arrayContaining([expect.objectContaining({ name: "wheel_joint", parent: "base_link", child: "wheel_link" })]));
    expect(result.extracted.software.packages).toEqual(expect.arrayContaining([expect.objectContaining({ name: "benchbot_driver", dependencies: expect.arrayContaining(["rclcpp", "sensor_msgs"]) })]));
    expect(result.extracted.procedureCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "assembly", steps: expect.arrayContaining(["Bolt the drive motors to the chassis."]) })]));
    expect(result.extracted.configuration.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ keyPath: "motor.current_limit", valueType: "number" })]));
    expect(result.extracted.repository).toMatchObject({ ciDefinitions: [".github/workflows/ci.yml"], nativeCadArtifacts: ["cad/chassis.step"] });
    expect(result.extracted.previews).toMatchObject({ imagePath: "docs/hero.png", modelPath: "description/robot.urdf", modelKind: "urdf" });
    expect(result.sourceMappings.length).toBeGreaterThanOrEqual(6);
  });

  it("analyzes an authorized set of individually uploaded project files", async () => {
    const bomId = await uploadTestFile("parts.csv", "Name,Manufacturer,MPN,Quantity\nHip actuator,Motion Labs,ML-24,12\n", ownerCookie, "bom");
    const urdfId = await uploadTestFile("robot.urdf", '<robot name="uploadbot"><link name="base"><visual><geometry><mesh filename="chassis.step"/></geometry></visual></link><link name="leg"/><joint name="hip" type="revolute"><parent link="base"/><child link="leg"/></joint></robot>', ownerCookie, "urdf");
    const readmeId = await uploadTestFile("README.md", "# Uploadbot\n\n## Quick Start\n1. Read the project overview.\n2. Review the supported interfaces.\n", ownerCookie);
    const assemblyId = await uploadTestFile("docs/assembly_guide.md", "# Assembly Guide\n\n## Assembly\n1. Attach each hip actuator to the chassis.\n2. Route the power harness.\n3. Verify the actuator fasteners.\n", ownerCookie);
    const denied = await call("/api/v1/projects/import/files", { method: "POST", body: jsonBody({ fileIds: [bomId, urdfId, readmeId] }) }, otherCookie);
    expect(denied.status).toBe(403);
    const analyzed = await call("/api/v1/projects/import/files", { method: "POST", body: jsonBody({ fileIds: [bomId, urdfId, readmeId, assemblyId] }) }, ownerCookie);
    expect(analyzed.status).toBe(200);
    const result = (await body<{ analysis: { sourceType: string; inventory: { totalFiles: number; detected: string[] }; extracted: { model: { robotName: string; movableJointCount: number }; parts: { candidates: Array<{ mpn?: string }> }; procedureCandidates: Array<{ kind: string }> } } }>(analyzed)).analysis;
    expect(result.sourceType).toBe("files");
    expect(result.inventory).toMatchObject({ totalFiles: 4 });
    expect(result.inventory.detected).toEqual(expect.arrayContaining(["bom", "documentation", "urdf"]));
    expect(result.extracted.model).toMatchObject({ robotName: "uploadbot", movableJointCount: 1 });
    expect(result.extracted.parts.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ mpn: "ML-24" })]));
    expect(result.extracted.procedureCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "assembly" })]));
  });

  it("enforces organization roles on server-side mutations", async () => {
    const created = await call("/api/v1/organizations", { method: "POST", body: jsonBody({ name: "Test Robotics Group", slug: "test-robotics-group" }) }, ownerCookie);
    expect(created.status).toBe(201); const organization = (await body<{ item: { id: string; version: number } }>(created)).item;
    const added = await call(`/api/v1/organizations/${organization.id}/members`, { method: "POST", body: jsonBody({ email: "other@example.com", role: "viewer" }) }, ownerCookie);
    expect(added.status).toBe(201);
    const denied = await call(`/api/v1/organizations/${organization.id}`, { method: "PATCH", body: jsonBody({ name: "Unauthorized rename", version: organization.version }) }, otherCookie);
    expect(denied.status).toBe(403);
    const roleChanged = await call(`/api/v1/organizations/${organization.id}/members/${otherId}`, { method: "PATCH", body: jsonBody({ role: "engineer", status: "active" }) }, ownerCookie);
    expect(roleChanged.status).toBe(200); expect(await body(roleChanged)).toMatchObject({ item: { user_id: otherId, role: "engineer", status: "active" } });
    const lastOwner = await call(`/api/v1/organizations/${organization.id}/members/${ownerId}`, { method: "DELETE" }, ownerCookie);
    expect(lastOwner.status).toBe(409); expect((await body<{ error: { code: string } }>(lastOwner)).error.code).toBe("LAST_OWNER_REQUIRED");
    const updated = await call(`/api/v1/organizations/${organization.id}`, { method: "PATCH", body: jsonBody({ name: "Authorized Robotics Group", version: organization.version }) }, ownerCookie);
    expect(updated.status).toBe(200);
  });

  it("keeps organization-owned project and build scope changes behind admin authorization", async () => {
    const created = await call("/api/v1/organizations", { method: "POST", body: jsonBody({ name: "Scoped Robotics Group", slug: "scoped-robotics-group" }) }, ownerCookie);
    expect(created.status).toBe(201);
    const organizationId = (await body<{ item: { id: string } }>(created)).item.id;
    const added = await call(`/api/v1/organizations/${organizationId}/members`, { method: "POST", body: jsonBody({ email: "other@example.com", role: "engineer" }) }, ownerCookie);
    expect(added.status).toBe(201);

    const projectCreated = await call("/api/v1/projects", { method: "POST", body: jsonBody({
      organizationId,
      visibility: "organization",
      rpps: emptyRpps({ name: "Scoped Robot Project", slug: "scoped-robot-project", bom: [{ name: "TM-42 Motor", qty: 2 }] }),
    }) }, otherCookie);
    expect(projectCreated.status).toBe(201);
    const project = (await body<{ item: { id: string; organization_id: string; visibility: string; record_version: number } }>(projectCreated)).item;
    expect(project).toMatchObject({ organization_id: organizationId, visibility: "organization" });
    expect(await env.DB.prepare("SELECT owner_user_id, organization_id, visibility FROM boms WHERE project_id = ?1").bind(project.id).first()).toEqual({
      owner_user_id: otherId,
      organization_id: organizationId,
      visibility: "organization",
    });

    const engineerProjectDetach = await call(`/api/v1/projects/${project.id}`, { method: "PATCH", body: jsonBody({ version: project.record_version, organizationId: null, visibility: "private" }) }, otherCookie);
    expect(engineerProjectDetach.status).toBe(403);
    const adminProjectDetach = await call(`/api/v1/projects/${project.id}`, { method: "PATCH", body: jsonBody({ version: project.record_version, organizationId: null, visibility: "private" }) }, ownerCookie);
    expect(adminProjectDetach.status).toBe(200);
    expect((await body<{ item: { organization_id: string | null; visibility: string } }>(adminProjectDetach)).item).toMatchObject({ organization_id: null, visibility: "private" });
    expect(await env.DB.prepare("SELECT owner_user_id, organization_id, visibility FROM boms WHERE project_id = ?1").bind(project.id).first()).toEqual({
      owner_user_id: otherId,
      organization_id: null,
      visibility: "private",
    });

    const buildCreated = await call("/api/v1/builds", { method: "POST", body: jsonBody({ name: "Scoped Robot Build", organizationId, visibility: "organization" }) }, otherCookie);
    expect(buildCreated.status).toBe(201);
    const build = (await body<{ item: { id: string; organization_id: string; visibility: string; version: number } }>(buildCreated)).item;
    expect(build).toMatchObject({ organization_id: organizationId, visibility: "organization" });
    const engineerBuildDetach = await call(`/api/v1/builds/${build.id}`, { method: "PATCH", body: jsonBody({ version: build.version, organizationId: null, visibility: "private" }) }, otherCookie);
    expect(engineerBuildDetach.status).toBe(403);
    const adminBuildDetach = await call(`/api/v1/builds/${build.id}`, { method: "PATCH", body: jsonBody({ version: build.version, organizationId: null, visibility: "private" }) }, ownerCookie);
    expect(adminBuildDetach.status).toBe(200);
    expect((await body<{ item: { organization_id: string | null; visibility: string } }>(adminBuildDetach)).item).toMatchObject({ organization_id: null, visibility: "private" });
  });

  it("validates portable RPPS anonymously and stores immutable authorized releases", async () => {
    const validation = await call("/api/v1/rpps/validate", { method: "POST", body: jsonBody({ manifest: portableRpps }) });
    expect(validation.status).toBe(200);
    const validationBody = await body<{ report: { profiles: { core: { conformant: boolean }; buildable: { conformant: boolean } } }; manifest: { extensions: Record<string, unknown> } }>(validation);
    expect(validationBody.report.profiles.core.conformant).toBe(true);
    expect(validationBody.report.profiles.buildable.conformant).toBe(false);
    expect(validationBody.manifest.extensions["org.example.test"]).toEqual({ preserved: true });

    const projectResponse = await call("/api/v1/projects", { method: "POST", body: jsonBody({
      visibility: "public",
      rpps: emptyRpps({ name: "Portable Release Host", slug: "portable-release-host" }),
    }) }, ownerCookie);
    expect(projectResponse.status).toBe(201);
    const projectId = (await body<{ item: { id: string } }>(projectResponse)).item.id;
    const denied = await call(`/api/v1/projects/${projectId}/releases`, { method: "POST", body: jsonBody({ manifest: portableRpps, status: "published" }) }, otherCookie);
    expect(denied.status).toBe(403);
    const created = await call(`/api/v1/projects/${projectId}/releases`, { method: "POST", body: jsonBody({ manifest: portableRpps, status: "published" }) }, ownerCookie);
    expect(created.status).toBe(201);
    const item = (await body<{ item: { id: string; packageSha256: string; status: string } }>(created)).item;
    expect(item).toMatchObject({ status: "published" });
    expect(item.packageSha256).toMatch(/^[a-f0-9]{64}$/u);
    const duplicate = await call(`/api/v1/projects/${projectId}/releases`, { method: "POST", body: jsonBody({ manifest: portableRpps, status: "published" }) }, ownerCookie);
    expect(duplicate.status).toBe(409);
    const draftManifest = portableRpps.replaceAll("0.1.0", "0.1.1").replace("quantity: 2", "quantity: 3");
    const draft = await call(`/api/v1/projects/${projectId}/releases`, { method: "POST", body: jsonBody({ manifest: draftManifest, status: "draft" }) }, ownerCookie);
    expect(draft.status).toBe(201);
    const draftItem = (await body<{ item: { id: string } }>(draft)).item;
    const listed = await call(`/api/v1/projects/${projectId}/releases`, {}, ownerCookie);
    expect(listed.status).toBe(200);
    expect((await body<{ total: number }>(listed)).total).toBe(2);
    const publicList = await call(`/api/v1/projects/${projectId}/releases`);
    expect(publicList.status).toBe(200);
    expect((await body<{ total: number }>(publicList)).total).toBe(1);
    const publishedDraft = await call(`/api/v1/projects/${projectId}/releases/${draftItem.id}/publish`, { method: "POST" }, ownerCookie);
    expect(publishedDraft.status).toBe(200);
    expect((await body<{ item: { status: string } }>(publishedDraft)).item.status).toBe("published");
    const diff = await call(`/api/v1/projects/${projectId}/releases/${draftItem.id}/diff?against=${encodeURIComponent(item.id)}`);
    expect(diff.status).toBe(200);
    expect((await body<{ collections: { components: { changed: Array<{ id: string; fields: string[] }> } } }>(diff)).collections.components.changed)
      .toEqual([{ id: "component:motor", fields: ["quantity"] }]);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM rpps_validation_findings WHERE release_id = ?1").bind(item.id).first<{ value: number }>())?.value)).toBeGreaterThan(0);
    expect(await env.DB.prepare("SELECT stable_id, name FROM rpps_release_assemblies WHERE release_id = ?1").bind(item.id).first()).toEqual({ stable_id: "assembly:drive", name: "Drive assembly" });
    expect(await env.DB.prepare("SELECT stable_id, interface_kind FROM rpps_release_interfaces WHERE release_id = ?1").bind(item.id).first()).toEqual({ stable_id: "interface:motor-mount", interface_kind: "mechanical" });
    expect(await env.DB.prepare("SELECT source_url, source_revision FROM rpps_source_mappings WHERE release_id = ?1").bind(item.id).first()).toEqual({ source_url: "https://github.com/example/portable-test", source_revision: "abc123" });
  });

  it("creates exact-release build passports and turns tested outcomes into scoped reproducibility evidence", async () => {
    const manifest = portableRpps.replace("extensions:", `procedures:
  - id: procedure:drive-assembly
    kind: assembly
    title: Assemble drive
    steps:
      - id: step:mount-motor
        instruction: Mount both motors to the drive plate using the documented torque.
      - id: step:verify-rotation
        instruction: Verify both shafts rotate freely before applying power.
    expectedResult: Both shafts rotate without binding.
extensions:`);
    const projectResponse = await call("/api/v1/projects", { method: "POST", body: jsonBody({
      visibility: "public", rpps: emptyRpps({ name: "Release Passport Host", slug: "release-passport-host" }),
    }) }, ownerCookie);
    expect(projectResponse.status).toBe(201);
    const projectId = (await body<{ item: { id: string } }>(projectResponse)).item.id;
    const releaseResponse = await call(`/api/v1/projects/${projectId}/releases`, {
      method: "POST", body: jsonBody({ manifest, status: "published" }),
    }, ownerCookie);
    expect(releaseResponse.status).toBe(201);
    const release = (await body<{ item: { id: string; packageSha256: string } }>(releaseResponse)).item;

    const started = await call(`/api/v1/projects/${projectId}/releases/${release.id}/build-passports`, {
      method: "POST", body: jsonBody({ name: "Independent exact build", visibility: "private" }),
    }, otherCookie);
    expect(started.status).toBe(201);
    const startedBody = await body<{ item: { id: string; slug: string; items: Array<{ componentId: string | null }>; steps: Array<{ title: string }> }; passport: { packageSha256: string } }>(started);
    expect(startedBody.passport.packageSha256).toBe(release.packageSha256);
    expect(startedBody.item.items).toEqual([expect.objectContaining({ componentId: "c-test" })]);
    expect(startedBody.item.steps).toHaveLength(2);
    const projectAfterStart = await call(`/api/v1/projects/${projectId}`);
    expect((await body<{ item: { reproduction_count: number; successful_reproduction_count: number } }>(projectAfterStart)).item)
      .toMatchObject({ reproduction_count: 1, successful_reproduction_count: 0 });
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM rpps_build_passport_steps WHERE passport_id = (SELECT id FROM rpps_build_passports WHERE build_id = ?1)")
      .bind(startedBody.item.id).first<{ value: number }>())?.value)).toBe(2);

    const premature = await call(`/api/v1/projects/${projectId}/releases/${release.id}/outcomes`, {
      method: "POST", body: jsonBody({ buildId: startedBody.item.id, outcome: "succeeded", summary: "The exact release completed successfully under the recorded bench conditions." }),
    }, otherCookie);
    expect(premature.status).toBe(422);
    expect((await body<{ error: { code: string } }>(premature)).error.code).toBe("BUILD_EVIDENCE_REQUIRED");
    const test = await call(`/api/v1/builds/${startedBody.item.id}/tests`, { method: "POST", body: jsonBody({
      name: "Free rotation", methodText: "Rotate both shafts through a complete revolution.", expectedText: "No binding.", observedText: "No binding was observed.", result: "passed",
    }) }, otherCookie);
    expect(test.status).toBe(201);
    const outcome = await call(`/api/v1/projects/${projectId}/releases/${release.id}/outcomes`, {
      method: "POST", body: jsonBody({ buildId: startedBody.item.id, outcome: "succeeded",
        summary: "The exact release completed successfully under the recorded bench conditions.", conditions: { supplyVoltage: 24, ambient: "bench" } }),
    }, otherCookie);
    expect(outcome.status).toBe(201);
    expect((await body<{ item: { independence: string } }>(outcome)).item.independence).toBe("independent");
    const projectAfterOutcome = await call(`/api/v1/projects/${projectId}`);
    expect((await body<{ item: { reproduction_count: number; successful_reproduction_count: number } }>(projectAfterOutcome)).item)
      .toMatchObject({ reproduction_count: 1, successful_reproduction_count: 1 });

    const proposal = await call(`/api/v1/projects/${projectId}/releases/${release.id}/proposals`, { method: "POST", body: jsonBody({
      type: "correct_component_identity", targetComponentId: "component:motor", manufacturer: "Test Motors", mpn: "TM-42-R2",
      rationale: "The independently built unit used the R2 manufacturer revision and the manifest should preserve that exact identity.",
    }) }, otherCookie);
    expect(proposal.status).toBe(201);
    const proposalId = (await body<{ item: { id: string } }>(proposal)).item.id;
    const deniedReview = await call(`/api/v1/projects/${projectId}/releases/${release.id}/proposals/${proposalId}`, {
      method: "PATCH", body: jsonBody({ action: "accept" }),
    }, otherCookie);
    expect(deniedReview.status).toBe(403);
    const accepted = await call(`/api/v1/projects/${projectId}/releases/${release.id}/proposals/${proposalId}`, {
      method: "PATCH", body: jsonBody({ action: "accept", note: "Accepted for the next immutable release." }),
    }, ownerCookie);
    expect(accepted.status).toBe(200);

    const collaboration = await call(`/api/v1/projects/${projectId}/releases/${release.id}/collaboration`, {}, otherCookie);
    expect(collaboration.status).toBe(200);
    const collaborationBody = await body<{ evidence: { achieved: string[]; succeededIndependent: number }; eligibleBuilds: unknown[]; outcomes: Array<{ independence: string; buildId: string | null }>; proposals: Array<{ status: string }> }>(collaboration);
    expect(collaborationBody.evidence.achieved).toEqual(expect.arrayContaining(["structured", "reproduced"]));
    expect(collaborationBody.evidence.succeededIndependent).toBe(1);
    expect(collaborationBody.eligibleBuilds).toHaveLength(0);
    expect(collaborationBody.outcomes[0]).toMatchObject({ independence: "independent", buildId: startedBody.item.id });
    expect(collaborationBody.proposals).toEqual(expect.arrayContaining([expect.objectContaining({ status: "accepted" })]));
  });

  it("versions project technical records with normalized requirements and evidence", async () => {
    const initialRpps = emptyRpps({
      name: "Technical Record Robot",
      slug: "technical-record-robot",
      version: "0.1.0",
      build: { required_tools: ["Torque wrench"], required_skills: ["Soldering"] },
      known_issues: [{ title: "Encoder drift", body: "Recalibrate after transport." }],
      evidence: [{ claim: "Joint repeatability measured at 0.2 degrees.", source_type: "test", source_url: "https://example.com/repeatability", confidence: 0.9 }],
    });
    const created = await call("/api/v1/projects", { method: "POST", body: jsonBody({ visibility: "private", rpps: initialRpps }) }, ownerCookie);
    expect(created.status).toBe(201);
    const project = (await body<{ item: { id: string; record_version: number } }>(created)).item;

    expect(Number((await env.DB.prepare(`SELECT COUNT(*) AS value FROM project_requirements pr
      JOIN projects p ON p.current_version_id = pr.project_version_id WHERE p.id = ?1`).bind(project.id).first<{ value: number }>())?.value)).toBe(2);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM evidence_claims WHERE entity_type = 'project' AND entity_id = ?1").bind(project.id).first<{ value: number }>())?.value)).toBe(1);

    const revisedRpps = { ...initialRpps, version: "0.1.1", build: { required_tools: ["Torque wrench", "Multimeter"], required_skills: ["Soldering"] } };
    const denied = await call(`/api/v1/projects/${project.id}/rpps`, { method: "PUT", body: jsonBody({ version: project.record_version, rpps: revisedRpps }) }, otherCookie);
    expect(denied.status).toBe(403);
    const updated = await call(`/api/v1/projects/${project.id}/rpps`, { method: "PUT", body: jsonBody({ version: project.record_version, rpps: revisedRpps }) }, ownerCookie);
    expect(updated.status).toBe(200);
    expect((await body<{ item: { record_version: number; rpps: { version: string } } }>(updated)).item).toMatchObject({ record_version: 2, rpps: { version: "0.1.1" } });

    const stale = await call(`/api/v1/projects/${project.id}/rpps`, { method: "PUT", body: jsonBody({ version: project.record_version, rpps: { ...revisedRpps, version: "0.1.2" } }) }, ownerCookie);
    expect(stale.status).toBe(409);
    const currentRequirements = await env.DB.prepare(`SELECT requirement_type, label FROM project_requirements pr
      JOIN projects p ON p.current_version_id = pr.project_version_id WHERE p.id = ?1 ORDER BY requirement_type, label`).bind(project.id).all();
    expect(currentRequirements.results).toEqual([
      { requirement_type: "skill", label: "Soldering" },
      { requirement_type: "tool", label: "Multimeter" },
      { requirement_type: "tool", label: "Torque wrench" },
    ]);
  });

  it("validates and manages authorized R2-backed project media", async () => {
    const created = await call("/api/v1/projects", { method: "POST", body: jsonBody({
      visibility: "private",
      rpps: emptyRpps({ name: "Project Media Robot", slug: "project-media-robot" }),
    }) }, ownerCookie);
    expect(created.status).toBe(201);
    const projectId = (await body<{ item: { id: string } }>(created)).item.id;

    const invalidInit = await call("/api/v1/files/uploads", { method: "POST", body: jsonBody({ originalName: "invalid.png", mediaType: "image/png", sizeBytes: 8, kind: "image", visibility: "private" }) }, ownerCookie);
    const invalidUpload = await body<{ file: { id: string }; upload: { url: string; token: string } }>(invalidInit);
    const invalidBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const invalidStored = await call(invalidUpload.upload.url, { method: "PUT", headers: { "content-type": "image/png", "content-length": "8", "x-upload-token": invalidUpload.upload.token }, body: invalidBytes }, ownerCookie);
    expect(invalidStored.status).toBe(422);
    expect(await env.DB.prepare("SELECT status FROM files WHERE id = ?1").bind(invalidUpload.file.id).first()).toEqual({ status: "rejected" });

    const initialized = await call("/api/v1/files/uploads", { method: "POST", body: jsonBody({ originalName: "assembly.png", mediaType: "image/png", sizeBytes: 24, kind: "image", visibility: "private" }) }, ownerCookie);
    expect(initialized.status).toBe(201);
    const upload = await body<{ file: { id: string }; upload: { url: string; token: string } }>(initialized);
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1]);
    const stored = await call(upload.upload.url, { method: "PUT", headers: { "content-type": "image/png", "content-length": "24", "x-upload-token": upload.upload.token }, body: pngHeader }, ownerCookie);
    expect(stored.status).toBe(201);
    const unsafePath = await call(`/api/v1/files/${upload.file.id}/attachments`, { method: "POST", body: jsonBody({ entityType: "project", entityId: projectId, purpose: "media", relativePath: "../private/assembly.png", altText: "Robot arm assembly fixture" }) }, ownerCookie);
    expect(unsafePath.status).toBe(422);
    expect(await env.DB.prepare("SELECT COUNT(*) AS value FROM project_files WHERE project_id = ?1 AND file_id = ?2").bind(projectId, upload.file.id).first()).toEqual({ value: 0 });
    const attached = await call(`/api/v1/files/${upload.file.id}/attachments`, { method: "POST", body: jsonBody({ entityType: "project", entityId: projectId, purpose: "media", relativePath: "images/assembly.png", altText: "Robot arm assembly fixture" }) }, ownerCookie);
    expect(attached.status).toBe(201);
    expect(await env.DB.prepare("SELECT alt_text FROM project_media WHERE project_id = ?1 AND file_id = ?2").bind(projectId, upload.file.id).first()).toEqual({ alt_text: "Robot arm assembly fixture" });

    const deniedList = await call(`/api/v1/projects/${projectId}/files`, {}, otherCookie);
    expect(deniedList.status).toBe(403);
    const listed = await call(`/api/v1/projects/${projectId}/files`, {}, ownerCookie);
    expect(listed.status).toBe(200);
    expect((await body<{ items: Array<Record<string, unknown>> }>(listed)).items).toEqual([
      expect.objectContaining({ id: upload.file.id, purpose: "media", relativePath: "images/assembly.png", altText: "Robot arm assembly fixture", status: "ready" }),
    ]);

    const deniedDetach = await call(`/api/v1/projects/${projectId}/files/${upload.file.id}`, { method: "DELETE" }, otherCookie);
    expect(deniedDetach.status).toBe(403);
    const detached = await call(`/api/v1/projects/${projectId}/files/${upload.file.id}`, { method: "DELETE" }, ownerCookie);
    expect(detached.status).toBe(204);
    expect(await env.DB.prepare("SELECT COUNT(*) AS value FROM project_files WHERE project_id = ?1 AND file_id = ?2").bind(projectId, upload.file.id).first()).toEqual({ value: 0 });
    expect(await env.DB.prepare("SELECT status FROM files WHERE id = ?1").bind(upload.file.id).first()).toEqual({ status: "ready" });
  });

  it("persists Marketplace inquiry records without claiming payment processing", async () => {
    const sourceBuildResponse = await call("/api/v1/builds", { method: "POST", body: jsonBody({ name: "Marketplace source build", description: "Private source build used to publish an aggregate parts-cost comparison.", visibility: "private" }) }, ownerCookie);
    const sourceBuildId = (await body<{ item: { id: string } }>(sourceBuildResponse)).item.id;
    const sourceItem = await call(`/api/v1/builds/${sourceBuildId}/items`, { method: "POST", body: jsonBody({ componentId: "c-test", description: "TM-42 Motor", quantity: 2, unitCostMinor: 5000 }) }, ownerCookie);
    expect(sourceItem.status).toBe(201);
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO suppliers (id, slug, name, status, is_demo, created_at, updated_at)
        VALUES ('s-eur-marketplace', 'eur-marketplace-supplier', 'EUR Marketplace Supplier', 'active', 0, ?1, ?1)`).bind(now),
      env.DB.prepare(`INSERT INTO supplier_offers (id, supplier_id, component_id, supplier_sku, currency, unit_price_minor, minimum_quantity, availability, observed_at, is_demo, created_at, updated_at)
        VALUES ('o-eur-marketplace', 's-eur-marketplace', 'c-test', 'TM-42-EUR', 'EUR', 2500, 1, 'in_stock', ?1, 0, ?1, ?1)`).bind(now),
    ]);
    expect((await call(`/api/v1/builds/${sourceBuildId}/items`, { method: "POST", body: jsonBody({ componentId: "c-test", description: "EUR-only spare", quantity: 1, selectedSupplierOfferId: "o-eur-marketplace" }) }, ownerCookie)).status).toBe(201);
    const deniedSource = await call("/api/v1/marketplace", { method: "POST", body: jsonBody({ listingType: "sell", title: "Unauthorized source build", description: "This listing must not reveal another user's private build costs.", category: "robot", conditionGrade: "B", currency: "USD", price: 125, quantity: 1, region: "US", visibility: "public", sourceBuildId }) }, otherCookie);
    expect(deniedSource.status).toBe(403);
    const draft = await call("/api/v1/marketplace", { method: "POST", body: jsonBody({ listingType: "sell", title: "TM-42 actuator test unit", description: "Used for integration testing with measured encoder output.", category: "actuator", conditionGrade: "B", currency: "USD", price: 125, quantity: 1, region: "US", visibility: "private", sourceBuildId }) }, ownerCookie);
    expect(draft.status).toBe(201); const listing = (await body<{ item: { id: string; version: number; visibility: string; partsCost: number; partsCostPricedItems: number; partsCostTotalItems: number } }>(draft)).item;
    expect(listing).toMatchObject({ visibility: "private", partsCost: 100, partsCostPricedItems: 1, partsCostTotalItems: 2 });
    const imageInit = await call("/api/v1/files/uploads", { method: "POST", body: jsonBody({ originalName: "listing.png", mediaType: "image/png", sizeBytes: 24, kind: "image", visibility: "private" }) }, ownerCookie);
    const imageUpload = await body<{ file: { id: string }; upload: { url: string; token: string } }>(imageInit);
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect((await call(imageUpload.upload.url, { method: "PUT", headers: { "content-type": "image/png", "content-length": "24", "x-upload-token": imageUpload.upload.token }, body: pngHeader }, ownerCookie)).status).toBe(201);
    expect((await call(`/api/v1/files/${imageUpload.file.id}/attachments`, { method: "POST", body: jsonBody({ entityType: "marketplace_listing", entityId: listing.id, purpose: "media", altText: "TM-42 actuator on a test stand" }) }, ownerCookie)).status).toBe(201);
    expect((await env.DB.prepare("SELECT visibility FROM files WHERE id = ?1").bind(imageUpload.file.id).first<{ visibility: string }>())?.visibility).toBe("private");
    const published = await call(`/api/v1/marketplace/${listing.id}/status`, { method: "PUT", body: jsonBody({ status: "published" }) }, ownerCookie); expect(published.status).toBe(200);
    expect((await body<{ item: { visibility: string } }>(published)).item.visibility).toBe("public");
    expect((await env.DB.prepare("SELECT visibility FROM files WHERE id = ?1").bind(imageUpload.file.id).first<{ visibility: string }>())?.visibility).toBe("public");
    const publicListing = await call(`/api/v1/marketplace/${listing.id}`, {}, otherCookie);
    expect((await body<{ item: { images: Array<{ fileId: string }>; partsCost: number } }>(publicListing)).item).toMatchObject({ images: [{ fileId: imageUpload.file.id }], partsCost: 100 });
    const inquiry = await call(`/api/v1/marketplace/${listing.id}/inquiries`, { method: "POST", body: jsonBody({ subject: "Encoder evidence", message: "Can you share the encoder test conditions and calibration log?" }) }, otherCookie);
    expect(inquiry.status).toBe(201); expect((await body<{ paymentProcessed: boolean }>(inquiry)).paymentProcessed).toBe(false);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM notifications WHERE user_id = ?1 AND notification_type = 'marketplace_inquiry'").bind(ownerId).first<{ value: number }>())?.value)).toBe(1);
    const removedImage = await call(`/api/v1/marketplace/${listing.id}/images/${imageUpload.file.id}`, { method: "DELETE" }, ownerCookie);
    expect(removedImage.status).toBe(204);
  });

  it("isolates notifications and persists read state and delivery preferences", async () => {
    const now = new Date().toISOString();
    const notificationId = crypto.randomUUID();
    await env.DB.prepare("DELETE FROM notifications WHERE user_id = ?1").bind(ownerId).run();
    await env.DB.prepare(`INSERT INTO notifications
      (id, user_id, notification_type, title, body, internal_path, data_json, created_at)
      VALUES (?1, ?2, 'build_activity', 'Build test completed', 'The no-load spin test passed.', ?3, '{}', ?4)`)
      .bind(notificationId, ownerId, `/builder?build=${buildId}`, now).run();
    const ownerInbox = await call("/api/v1/notifications?unread=true", {}, ownerCookie);
    expect(ownerInbox.status).toBe(200); expect(await body(ownerInbox)).toMatchObject({ unreadCount: 1 });
    const otherInbox = await call("/api/v1/notifications", {}, otherCookie);
    expect(otherInbox.status).toBe(200); expect(await body(otherInbox)).toMatchObject({ items: [], unreadCount: 0 });
    const otherRead = await call(`/api/v1/notifications/${notificationId}/read`, { method: "PATCH" }, otherCookie);
    expect(otherRead.status).toBe(200); expect(await body(otherRead)).toEqual({ updated: false });
    const ownerRead = await call(`/api/v1/notifications/${notificationId}/read`, { method: "PATCH" }, ownerCookie);
    expect(ownerRead.status).toBe(200); expect(await body(ownerRead)).toEqual({ updated: true });
    const preference = await call("/api/v1/notifications/preferences", { method: "PUT", body: jsonBody({ notificationType: "build_activity", inAppEnabled: true, emailEnabled: false }) }, ownerCookie);
    expect(preference.status).toBe(200);
    const preferences = await call("/api/v1/notifications/preferences", {}, ownerCookie);
    expect(preferences.status).toBe(200);
    const preferenceItems = (await body<{ items: Array<{ notificationType: string; inAppEnabled: number; emailEnabled: number }> }>(preferences)).items;
    expect(preferenceItems.find((item) => item.notificationType === "build_activity")).toMatchObject({ inAppEnabled: 1, emailEnabled: 0 });
  });

  it("persists public partner interest with same-origin and spam protections", async () => {
    const payload = {
      inquiryType: "supplier",
      organizationName: "Test Robotics Supply",
      contactName: "Ada Partner",
      email: "Ada@ExampleSupplier.com",
      websiteUrl: "https://example-supplier.test/robotics",
      message: "We supply robotics actuator components and want to provide source-backed supplier records for RoboPartPicker review.",
      company: "",
    };

    const crossOrigin = await exports.default.fetch(new Request(`${origin}/api/v1/partner-interest`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: jsonBody(payload),
    }));
    expect(crossOrigin.status).toBe(403);

    const spam = await call("/api/v1/partner-interest", { method: "POST", body: jsonBody({ ...payload, message: "Buy links https://a.test https://b.test https://c.test https://d.test" }) });
    expect(spam.status).toBe(422);

    const created = await call("/api/v1/partner-interest", { method: "POST", body: jsonBody(payload) });
    expect(created.status).toBe(201);
    const createdBody = await body<{ item: { referenceId: string; status: string; receivedAt: string }; message: string }>(created);
    expect(createdBody.item).toMatchObject({ status: "received" });
    expect(createdBody.item.referenceId).toBeTruthy();
    expect(Object.keys(createdBody.item).sort()).toEqual(["receivedAt", "referenceId", "status"]);
    expect(createdBody.message).toContain("manual review");

    const duplicate = await call("/api/v1/partner-interest", { method: "POST", headers: { "X-Request-Id": "fixed-client-reference" }, body: jsonBody({
      ...payload,
      email: "ADA@EXAMPLESUPPLIER.COM",
    }) });
    expect(duplicate.status).toBe(201);
    const duplicateBody = await body<{ item: { referenceId: string; status: string; receivedAt: string } }>(duplicate);
    expect(duplicateBody.item.referenceId).not.toBe(createdBody.item.referenceId);
    expect(duplicateBody.item.referenceId).not.toBe("fixed-client-reference");
    expect(Object.keys(duplicateBody.item).sort()).toEqual(["receivedAt", "referenceId", "status"]);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM partner_interest_submissions WHERE normalized_email = ?1 AND normalized_organization = ?2")
      .bind("ada@examplesupplier.com", "test robotics supply").first<{ value: number }>())?.value)).toBe(1);

    const persisted = await env.DB.prepare("SELECT id, created_at FROM partner_interest_submissions WHERE normalized_email = ?1 AND normalized_organization = ?2")
      .bind("ada@examplesupplier.com", "test robotics supply").first<{ id: string; created_at: string }>();
    expect(persisted).toBeTruthy();
    partnerInterestId = persisted!.id;
    expect(JSON.stringify(duplicateBody)).not.toContain(partnerInterestId);
    expect(JSON.stringify(duplicateBody)).not.toContain(persisted!.created_at);
    expect(JSON.stringify(duplicateBody)).not.toContain("Ada Partner");
    expect(JSON.stringify(duplicateBody)).not.toContain("ada@examplesupplier.com");

    const row = await env.DB.prepare("SELECT inquiry_type, normalized_email, status, source, request_id FROM partner_interest_submissions WHERE id = ?1")
      .bind(partnerInterestId).first<{ inquiry_type: string; normalized_email: string; status: string; source: string; request_id: string }>();
    expect(row).toMatchObject({ inquiry_type: "supplier", normalized_email: "ada@examplesupplier.com", status: "received", source: "public_partners_page" });
    expect(row?.request_id).toBeTruthy();

    const poisonedIdentity = {
      ...payload,
      inquiryType: "partner",
      organizationName: "Victim Robotics Supply",
      contactName: "Untrusted Probe",
      email: "victim@example-supplier.com",
      message: "We claim a robotics partnership and are attempting to preempt a later legitimate supplier submission for this organization.",
    };
    const poisoned = await call("/api/v1/partner-interest", { method: "POST", body: jsonBody(poisonedIdentity) });
    expect(poisoned.status).toBe(201);
    const legitimate = await call("/api/v1/partner-interest", { method: "POST", body: jsonBody({
      ...payload,
      organizationName: "Victim Robotics Supply",
      email: "victim@example-supplier.com",
    }) });
    expect(legitimate.status).toBe(201);
    const victimRows = await env.DB.prepare(`SELECT inquiry_type, contact_name FROM partner_interest_submissions
      WHERE normalized_email = ?1 AND normalized_organization = ?2 ORDER BY created_at`).bind(
      "victim@example-supplier.com",
      "victim robotics supply",
    ).all<{ inquiry_type: string; contact_name: string }>();
    expect(victimRows.results).toEqual(expect.arrayContaining([
      { inquiry_type: "partner", contact_name: "Untrusted Probe" },
      { inquiry_type: "supplier", contact_name: "Ada Partner" },
    ]));
    expect(victimRows.results).toHaveLength(2);

    const concurrentPayload = {
      ...payload,
      organizationName: "Concurrent Robotics Supply",
      email: "race@example-supplier.com",
    };
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => call("/api/v1/partner-interest", {
      method: "POST",
      body: jsonBody(concurrentPayload),
    })));
    expect(concurrent.map((response) => response.status)).toEqual([201, 201, 201, 201, 201]);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM partner_interest_submissions WHERE normalized_email = ?1 AND normalized_organization = ?2")
      .bind("race@example-supplier.com", "concurrent robotics supply").first<{ value: number }>())?.value)).toBe(1);
  });

  it("publishes redacted supplier safeguards and restricts no-send triage to platform moderators", async () => {
    const policy = await call("/api/v1/supplier-relationships/policy");
    expect(policy.status).toBe(200);
    expect(policy.headers.get("cache-control")).toBe("no-store");
    const policyBody = await body<{ item: { counts: { leads: number; high_priority: number }; safeguards: Record<string, unknown> } }>(policy);
    expect(policyBody.item).toMatchObject({
      counts: { leads: 7, high_priority: 5 },
      safeguards: { contact_details_exposed: false, outbound_action_available: false, status: "research-only" },
    });
    expect(JSON.stringify(policyBody)).not.toContain("contact_channel");
    expect(JSON.stringify(policyBody)).not.toContain("@feetechrc.com.cn");

    const anonymous = await call("/api/v1/admin/supplier-relationships");
    expect(anonymous.status).toBe(401);
    const forbidden = await call("/api/v1/admin/supplier-relationships", {}, otherCookie);
    expect(forbidden.status).toBe(403);

    const queue = await call("/api/v1/admin/supplier-relationships?status=received&limit=10", {}, ownerCookie);
    expect(queue.status).toBe(200);
    const queueBody = await body<{ research: { leads: unknown[] }; inbound: { items: Array<{ id: string; status: string; updatedAt: string }>; total: number }; safeguards: Record<string, unknown> }>(queue);
    expect(queueBody.research.leads).toHaveLength(7);
    expect(queueBody.inbound.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: partnerInterestId, status: "received" })]));
    expect(queueBody.safeguards).toMatchObject({ outboundMessagesSent: false, outboundMutationAvailable: false, explicitApprovalRequired: true });
    const initial = queueBody.inbound.items.find((item) => item.id === partnerInterestId)!;

    const invalidFilter = await call("/api/v1/admin/supplier-relationships?status=sent", {}, ownerCookie);
    expect(invalidFilter.status).toBe(422);
    const unsafeTriage = await call(`/api/v1/admin/supplier-relationships/submissions/${partnerInterestId}`, {
      method: "PATCH",
      body: jsonBody({ status: "approved", adminNotes: "This must never imply approval.", expectedUpdatedAt: initial.updatedAt }),
    }, ownerCookie);
    expect(unsafeTriage.status).toBe(422);

    const skippedReview = await call(`/api/v1/admin/supplier-relationships/submissions/${partnerInterestId}`, {
      method: "PATCH",
      body: jsonBody({ status: "qualified", adminNotes: "Skipping review must be rejected.", expectedUpdatedAt: initial.updatedAt }),
    }, ownerCookie);
    expect(skippedReview.status).toBe(409);
    expect((await body<{ error: { code: string } }>(skippedReview)).error.code).toBe("INVALID_STATE_TRANSITION");

    const reviewed = await call(`/api/v1/admin/supplier-relationships/submissions/${partnerInterestId}`, {
      method: "PATCH",
      body: jsonBody({ status: "reviewing", adminNotes: "Validate public supplier evidence before any approval request.", expectedUpdatedAt: initial.updatedAt }),
    }, ownerCookie);
    expect(reviewed.status).toBe(200);
    const reviewedBody = await body<{ item: { id: string; status: string; adminNotes: string; updatedAt: string }; safeguards: Record<string, unknown> }>(reviewed);
    expect(reviewedBody).toMatchObject({
      item: { id: partnerInterestId, status: "reviewing", adminNotes: "Validate public supplier evidence before any approval request." },
      safeguards: { outboundMessagesSent: false, approvalGranted: false },
    });
    expect(await env.DB.prepare("SELECT status, admin_notes FROM partner_interest_submissions WHERE id = ?1").bind(partnerInterestId).first())
      .toMatchObject({ status: "reviewing", admin_notes: "Validate public supplier evidence before any approval request." });
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM audit_events WHERE action = 'supplier_relationship.triage' AND entity_id = ?1")
      .bind(partnerInterestId).first<{ value: number }>())?.value)).toBe(1);

    await env.DB.prepare(`CREATE TRIGGER reject_supplier_triage_audit
      BEFORE INSERT ON audit_events
      WHEN NEW.action = 'supplier_relationship.triage'
      BEGIN SELECT RAISE(ABORT, 'forced supplier triage audit failure'); END`).run();
    const auditFailure = await call(`/api/v1/admin/supplier-relationships/submissions/${partnerInterestId}`, {
      method: "PATCH",
      body: jsonBody({ status: "qualified", adminNotes: "This update must roll back with its failed audit.", expectedUpdatedAt: reviewedBody.item.updatedAt }),
    }, ownerCookie);
    await env.DB.prepare("DROP TRIGGER reject_supplier_triage_audit").run();
    expect(auditFailure.status).toBe(500);
    expect(await env.DB.prepare("SELECT status, admin_notes, updated_at FROM partner_interest_submissions WHERE id = ?1").bind(partnerInterestId).first())
      .toMatchObject({ status: "reviewing", admin_notes: "Validate public supplier evidence before any approval request.", updated_at: reviewedBody.item.updatedAt });
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM audit_events WHERE action = 'supplier_relationship.triage' AND entity_id = ?1")
      .bind(partnerInterestId).first<{ value: number }>())?.value)).toBe(1);

    const concurrentTriage = await Promise.all([
      call(`/api/v1/admin/supplier-relationships/submissions/${partnerInterestId}`, {
        method: "PATCH",
        body: jsonBody({ status: "qualified", adminNotes: "Qualification contender A.", expectedUpdatedAt: reviewedBody.item.updatedAt }),
      }, ownerCookie),
      call(`/api/v1/admin/supplier-relationships/submissions/${partnerInterestId}`, {
        method: "PATCH",
        body: jsonBody({ status: "qualified", adminNotes: "Qualification contender B.", expectedUpdatedAt: reviewedBody.item.updatedAt }),
      }, ownerCookie),
    ]);
    expect(concurrentTriage.map((response) => response.status).sort()).toEqual([200, 409]);
    const qualifiedResponse = concurrentTriage.find((response) => response.status === 200)!;
    const qualifiedBody = await body<{ item: { status: string; updatedAt: string } }>(qualifiedResponse);
    expect(qualifiedBody.item.status).toBe("qualified");
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM audit_events WHERE action = 'supplier_relationship.triage' AND entity_id = ?1")
      .bind(partnerInterestId).first<{ value: number }>())?.value)).toBe(2);

    const closed = await call(`/api/v1/admin/supplier-relationships/submissions/${partnerInterestId}`, {
      method: "PATCH",
      body: jsonBody({ status: "closed", adminNotes: "Research review complete with no outbound action.", expectedUpdatedAt: qualifiedBody.item.updatedAt }),
    }, ownerCookie);
    expect(closed.status).toBe(200);
    const closedBody = await body<{ item: { status: string; updatedAt: string } }>(closed);
    expect(closedBody.item.status).toBe("closed");

    const reopen = await call(`/api/v1/admin/supplier-relationships/submissions/${partnerInterestId}`, {
      method: "PATCH",
      body: jsonBody({ status: "reviewing", adminNotes: "Terminal states cannot be reopened here.", expectedUpdatedAt: closedBody.item.updatedAt }),
    }, ownerCookie);
    expect(reopen.status).toBe(409);
    expect((await body<{ error: { code: string } }>(reopen)).error.code).toBe("INVALID_STATE_TRANSITION");
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM audit_events WHERE action = 'supplier_relationship.triage' AND entity_id = ?1")
      .bind(partnerInterestId).first<{ value: number }>())?.value)).toBe(3);

    const missing = await call(`/api/v1/admin/supplier-relationships/submissions/${crypto.randomUUID()}`, {
      method: "PATCH",
      body: jsonBody({ status: "closed", adminNotes: null, expectedUpdatedAt: new Date().toISOString() }),
    }, ownerCookie);
    expect(missing.status).toBe(404);
  });

  it("fails AI requests honestly when no provider secret is configured", async () => {
    const conversation = await call("/api/v1/ai/conversations", { method: "POST", body: jsonBody({ title: "New chat" }) }, ownerCookie);
    expect(conversation.status).toBe(201); const id = (await body<{ item: { id: string } }>(conversation)).item.id;
    const anonymousDraft = await call("/api/v1/ai/form-drafts", { method: "POST", body: jsonBody({ form: "project", prompt: "Draft a small robot arm project", current: {} }) });
    expect(anonymousDraft.status).toBe(401);
    const unavailableDraft = await call("/api/v1/ai/form-drafts", { method: "POST", body: jsonBody({ form: "project", prompt: "Draft a small robot arm project", current: {} }) }, ownerCookie);
    expect(unavailableDraft.status).toBe(503); expect((await body<{ error: { code: string } }>(unavailableDraft)).error.code).toBe("AI_PROVIDER_NOT_CONFIGURED");
    const unavailableReview = await call("/api/v1/ai/quality-reviews", { method: "POST", body: jsonBody({ submissionType: "project", narrative: "A small robot arm with an unresolved controller revision.", submission: { name: "Arm" } }) }, ownerCookie);
    expect(unavailableReview.status).toBe(503); expect((await body<{ error: { code: string } }>(unavailableReview)).error.code).toBe("AI_PROVIDER_NOT_CONFIGURED");
    const response = await call("/api/v1/ai/chat", { method: "POST", body: jsonBody({ threadId: id, messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "Find an actuator" }] }] }) }, ownerCookie);
    expect(response.status).toBe(503); expect((await body<{ error: { code: string } }>(response)).error.code).toBe("AI_PROVIDER_NOT_CONFIGURED");

    const proposalId = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO ai_tool_calls
      (id, conversation_id, tool_name, input_json, status, requires_confirmation, created_at)
      VALUES (?1, ?2, 'propose_build_decision', ?3, 'proposed', 1, ?4)`)
      .bind(proposalId, id, jsonBody({ buildId, title: "Controller selection", context: "Two supported controllers", decision: "Use the pinned controller revision", consequences: "Document the connector mapping" }), new Date().toISOString()).run();
    const hidden = await call(`/api/v1/ai/tool-calls/${proposalId}`, {}, otherCookie); expect(hidden.status).toBe(404);
    const pending = await call(`/api/v1/ai/tool-calls/${proposalId}`, {}, ownerCookie); expect(pending.status).toBe(200); expect(await body(pending)).toMatchObject({ item: { id: proposalId, status: "proposed", requiresConfirmation: true } });
    const applied = await call(`/api/v1/ai/tool-calls/${proposalId}/confirm`, { method: "POST", body: jsonBody({ confirm: true }) }, ownerCookie); expect(applied.status).toBe(200);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM build_decisions WHERE build_id = ?1 AND title = 'Controller selection'").bind(buildId).first<{ value: number }>())?.value)).toBe(1);
    const completed = await call(`/api/v1/ai/tool-calls/${proposalId}`, {}, ownerCookie); expect(await body(completed)).toMatchObject({ item: { status: "succeeded" } });
  });

  it("serves stateless read-only robotics tools over MCP Streamable HTTP", async () => {
    const discovery = await call("/.well-known/mcp.json");
    expect(discovery.status).toBe(200);
    expect(discovery.headers.get("content-type")).toContain("application/json");
    const discoveryBody = await body<{ capabilities: string[] } & Record<string, unknown>>(discovery);
    expect(discoveryBody).toMatchObject({
      name: "RoboPartPicker",
      transport: "streamable-http",
      endpoint: `${origin}/mcp`,
      documentation: `${origin}/developers`,
      capabilities: expect.arrayContaining(["search_projects", "get_project", "search_components", "validate_rpps"]),
    });
    expect(discoveryBody.capabilities).not.toContain("search_suppliers");

    const headers = { accept: "application/json, text/event-stream", "content-type": "application/json" };
    const initialized = await call("/mcp", { method: "POST", headers, body: jsonBody({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "worker-test", version: "1.0.0" } },
    }) });
    expect(initialized.status).toBe(200);
    expect(await body<{ result: { serverInfo: { name: string } } }>(initialized)).toMatchObject({ result: { serverInfo: { name: "RoboPartPicker" } } });

    const listed = await call("/mcp", { method: "POST", headers, body: jsonBody({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) });
    expect(listed.status).toBe(200);
    const tools = (await body<{ result: { tools: Array<{ name: string }> } }>(listed)).result.tools.map((tool) => tool.name);
    expect(tools).toEqual(expect.arrayContaining(["search_components", "compare_components", "search_projects", "get_project", "validate_rpps"]));
    expect(tools).not.toContain("search_suppliers");

    const searched = await call("/mcp", { method: "POST", headers, body: jsonBody({
      jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_components", arguments: { query: "TM-42", limit: 5 } },
    }) });
    expect(searched.status).toBe(200);
    const result = await body<{ result: { structuredContent: { items: Array<{ id: string }> } } }>(searched);
    expect(result.result.structuredContent.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: "c-test" })]));
    const validated = await call("/mcp", { method: "POST", headers, body: jsonBody({
      jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "validate_rpps", arguments: { manifest: portableRpps } },
    }) });
    expect(validated.status).toBe(200);
    const validation = await body<{ result: { structuredContent: { valid: boolean; format: string; report: { profiles: { core: { conformant: boolean } } } } } }>(validated);
    expect(validation.result.structuredContent).toMatchObject({ valid: true, format: "portable-0.1-draft", report: { profiles: { core: { conformant: true } } } });
  });

  it("protects private MCP with OAuth 2.1, PKCE, audience scopes, and explicit proposal confirmation", async () => {
    const oauthBuildResponse = await call("/api/v1/builds", { method: "POST", body: jsonBody({ name: "Private MCP test build", visibility: "private" }) }, ownerCookie);
    expect(oauthBuildResponse.status).toBe(201);
    const oauthBuildId = (await body<{ item: { id: string } }>(oauthBuildResponse)).item.id;
    const metadata = await call("/.well-known/oauth-protected-resource/mcp/private");
    expect(metadata.status).toBe(200);
    expect(await body(metadata)).toMatchObject({
      resource: `${origin}/mcp/private`,
      authorization_servers: [`${origin}/api/auth`],
      scopes_supported: ["rpp:read", "rpp:write"],
      resource_documentation: `${origin}/developers`,
    });
    const authMetadata = await call("/.well-known/oauth-authorization-server/api/auth");
    expect(authMetadata.status).toBe(200);
    expect(await body(authMetadata)).toMatchObject({ issuer: `${origin}/api/auth`, code_challenge_methods_supported: ["S256"] });

    const unauthorized = await call("/mcp/private", {
      method: "POST",
      headers: { accept: "application/json, text/event-stream" },
      body: jsonBody({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain("/.well-known/oauth-protected-resource/mcp/private");

    const redirectUri = "http://127.0.0.1:7777/oauth/callback";
    const registered = await call("/api/auth/oauth2/register", {
      method: "POST",
      body: jsonBody({
        client_name: "RoboPartPicker Worker Test",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "openid profile rpp:read rpp:write",
        type: "native",
      }),
    });
    const registrationText = await registered.text();
    expect(registered.status, registrationText).toBe(200);
    const registration = JSON.parse(registrationText) as { client_id: string };
    expect(await env.DB.prepare("SELECT clientId, scopes, redirectUris FROM oauthClient WHERE clientId = ?1").bind(registration.client_id).first()).toBeTruthy();
    const publicClient = await call(`/api/auth/oauth2/public-client?client_id=${registration.client_id}`, {}, ownerCookie);
    const publicClientText = await publicClient.text();
    expect(publicClient.status, publicClientText).toBe(200);

    const verifier = "worker-test-pkce-verifier-abcdefghijklmnopqrstuvwxyz0123456789";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
    const authorize = new URLSearchParams({
      response_type: "code",
      client_id: registration.client_id,
      redirect_uri: redirectUri,
      scope: "openid profile rpp:read rpp:write",
      state: "worker-test-state",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const authorization = await call(`/api/auth/oauth2/authorize?${authorize}`, { redirect: "manual" }, ownerCookie);
    const authorizationText = await authorization.clone().text();
    expect(authorization.status, authorizationText).toBe(302);
    const consentLocation = authorization.headers.get("location");
    expect(consentLocation).toContain("/oauth/consent?");
    const oauthQuery = new URL(consentLocation!, origin).search.slice(1);

    const consent = await call("/api/auth/oauth2/consent", {
      method: "POST",
      headers: { accept: "application/json" },
      body: jsonBody({ accept: true, oauth_query: oauthQuery }),
    }, ownerCookie);
    expect(consent.status).toBe(200);
    const consentBody = await body<{ url: string }>(consent);
    const callback = new URL(consentBody.url);
    expect(callback.origin + callback.pathname).toBe(redirectUri);
    expect(callback.searchParams.get("state")).toBe("worker-test-state");

    const tokenForm = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: registration.client_id,
      redirect_uri: redirectUri,
      code: callback.searchParams.get("code")!,
      code_verifier: verifier,
      resource: `${origin}/mcp/private`,
    });
    const token = await call("/api/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: tokenForm.toString(),
    });
    const tokenText = await token.text();
    expect(token.status, tokenText).toBe(200);
    const accessToken = (JSON.parse(tokenText) as { access_token: string }).access_token;
    expect(accessToken.split(".")).toHaveLength(3);

    const mcpHeaders = {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    };
    const initialized = await call("/mcp/private", { method: "POST", headers: mcpHeaders, body: jsonBody({
      jsonrpc: "2.0", id: 10, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "private-worker-test", version: "1.0.0" } },
    }) });
    expect(initialized.status).toBe(200);
    expect(await body(initialized)).toMatchObject({ result: { serverInfo: { name: "RoboPartPicker Private" } } });

    const privateTools = await call("/mcp/private", { method: "POST", headers: mcpHeaders, body: jsonBody({
      jsonrpc: "2.0", id: 15, method: "tools/list", params: {},
    }) });
    expect(privateTools.status).toBe(200);
    expect((await body<{ result: { tools: Array<{ name: string }> } }>(privateTools)).result.tools.map((tool) => tool.name))
      .toEqual(expect.arrayContaining(["list_project_releases", "read_release_collaboration", "read_build_state", "propose_build_problem", "confirm_proposal"]));

    const proposed = await call("/mcp/private", { method: "POST", headers: mcpHeaders, body: jsonBody({
      jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "propose_build_problem", arguments: {
        buildId: oauthBuildId, title: "Intermittent encoder reading", description: "Encoder count drops under vibration.", severity: "high",
      } },
    }) });
    expect(proposed.status).toBe(200);
    const proposalId = (await body<{ result: { structuredContent: { proposalId: string; applied: boolean } } }>(proposed)).result.structuredContent.proposalId;
    expect(proposalId).toBeTruthy();
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM build_problems WHERE build_id = ?1 AND title = 'Intermittent encoder reading'").bind(oauthBuildId).first<{ value: number }>())?.value)).toBe(0);

    const confirmed = await call("/mcp/private", { method: "POST", headers: mcpHeaders, body: jsonBody({
      jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "confirm_proposal", arguments: { proposalId, confirm: true } },
    }) });
    expect(confirmed.status).toBe(200);
    expect((await body<{ result: { structuredContent: { applied: boolean } } }>(confirmed)).result.structuredContent.applied).toBe(true);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM build_problems WHERE build_id = ?1 AND title = 'Intermittent encoder reading'").bind(oauthBuildId).first<{ value: number }>())?.value)).toBe(1);
  });

  it("filters private file metadata from get_my_project for non-owner public project readers", async () => {
    const created = await call("/api/v1/projects", { method: "POST", body: jsonBody({
      visibility: "public",
      rpps: emptyRpps({ name: "Public MCP File Visibility Robot", slug: "public-mcp-file-visibility-robot" }),
    }) }, ownerCookie);
    expect(created.status).toBe(201);
    const project = (await body<{ item: { id: string; slug: string } }>(created)).item;
    const privateFileId = await uploadTestFile("private-notes.txt", "private assembly notes", ownerCookie);
    const publicFileId = await uploadTestFile("public-readme.txt", "public readme", ownerCookie);
    await env.DB.prepare("UPDATE files SET visibility = 'public' WHERE id = ?1").bind(publicFileId).run();
    expect((await call(`/api/v1/files/${privateFileId}/attachments`, { method: "POST", body: jsonBody({ entityType: "project", entityId: project.id, purpose: "reference", relativePath: "private/notes.txt" }) }, ownerCookie)).status).toBe(201);
    expect((await call(`/api/v1/files/${publicFileId}/attachments`, { method: "POST", body: jsonBody({ entityType: "project", entityId: project.id, purpose: "reference", relativePath: "README.txt" }) }, ownerCookie)).status).toBe(201);

    const accessToken = await issuePrivateMcpToken(otherCookie, "openid profile rpp:read");
    const response = await call("/mcp/private", { method: "POST", headers: privateMcpHeaders(accessToken), body: jsonBody({
      jsonrpc: "2.0", id: 101, method: "tools/call", params: { name: "get_my_project", arguments: { idOrSlug: project.slug } },
    }) });
    expect(response.status).toBe(200);
    const result = await body<{ result: { structuredContent: { files: Array<{ id: string; visibility: string; name: string; storageKey?: string; sizeBytes?: number; sha256?: string }> } } }>(response);
    expect(result.result.structuredContent.files).toEqual([expect.objectContaining({ id: publicFileId, visibility: "public", name: "public-readme.txt" })]);
    expect(result.result.structuredContent.files.some((file) => file.id === privateFileId || file.name === "private-notes.txt")).toBe(false);
    for (const file of result.result.structuredContent.files) {
      expect(file).not.toHaveProperty("storageKey");
      expect(file).not.toHaveProperty("sha256");
    }
  });

  it("returns a stable MCP tool authorization error when write scope is missing", async () => {
    const oauthBuildResponse = await call("/api/v1/builds", { method: "POST", body: jsonBody({ name: "Read-only MCP scope build", visibility: "private" }) }, ownerCookie);
    expect(oauthBuildResponse.status).toBe(201);
    const oauthBuildId = (await body<{ item: { id: string } }>(oauthBuildResponse)).item.id;
    const accessToken = await issuePrivateMcpToken(ownerCookie, "openid profile rpp:read");
    const response = await call("/mcp/private", { method: "POST", headers: privateMcpHeaders(accessToken), body: jsonBody({
      jsonrpc: "2.0", id: 102, method: "tools/call", params: { name: "propose_build_problem", arguments: {
        buildId: oauthBuildId, title: "Missing write scope", description: "This must not create a proposal.", severity: "low",
      } },
    }) });
    expect(response.status).toBe(200);
    const responseText = await response.clone().text();
    expect(responseText).not.toContain("Internal Server Error");
    const result = await body<{ result: { isError: boolean; content: Array<{ text: string }>; structuredContent: { error: { code: string; requiredScope: string } } } }>(response);
    expect(result.result.isError).toBe(true);
    expect(result.result.content[0].text).toContain("OAuth scope rpp:write is required.");
    expect(result.result.structuredContent.error).toMatchObject({ code: "INSUFFICIENT_SCOPE", requiredScope: "rpp:write" });
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM ai_tool_calls WHERE input_json LIKE '%Missing write scope%'").first<{ value: number }>())?.value)).toBe(0);
  });

  it("creates private human-reviewed quote requests with frozen materials and shipping estimates", async () => {
    const createdBom = await call("/api/v1/boms", { method: "POST", body: jsonBody({
      name: "Customer shipping quote BOM",
      visibility: "private",
      items: [{ componentId: "c-test", slotKey: "drive-motor", description: "TM-42 Motor", quantity: 2 }],
    }) }, ownerCookie);
    expect(createdBom.status).toBe(201);
    const bomId = (await body<{ item: { id: string } }>(createdBom)).item.id;
    const payload = {
      bomId,
      firstName: "Luca",
      lastName: "Builder",
      email: "luca@example.com",
      phone: "+1 555 0100",
      addressLine1: "100 Robotics Way",
      addressLine2: "Lab 2",
      city: "Toronto",
      region: "ON",
      postalCode: "M5V 2T6",
      countryCode: "CA",
      deliveryNotes: "Commercial loading dock.",
      consent: true,
    };

    const unauthenticated = await call("/api/v1/customer-quote-requests", { method: "POST", body: jsonBody(payload) });
    expect(unauthenticated.status).toBe(401);
    await env.DB.prepare("UPDATE boms SET owner_user_id = ?1 WHERE id = ?2").bind(otherId, bomId).run();
    const denied = await call("/api/v1/customer-quote-requests", { method: "POST", body: jsonBody(payload) }, ownerCookie);
    const deniedText = await denied.clone().text();
    expect(denied.status, deniedText).toBe(403);
    await env.DB.prepare("UPDATE boms SET owner_user_id = ?1 WHERE id = ?2").bind(ownerId, bomId).run();
    const invalidConsent = await call("/api/v1/customer-quote-requests", { method: "POST", body: jsonBody({ ...payload, consent: false }) }, ownerCookie);
    expect(invalidConsent.status).toBe(422);

    const created = await call("/api/v1/customer-quote-requests", { method: "POST", body: jsonBody(payload) }, ownerCookie);
    expect(created.status).toBe(201);
    const item = (await body<{ item: { id: string; status: string; materialsEstimateMinor: number; shippingEstimateMinor: number; totalEstimateMinor: number; shippingConfidence: string; humanReviewRequired: boolean } }>(created)).item;
    expect(item).toMatchObject({ status: "submitted", shippingConfidence: "low", humanReviewRequired: true });
    expect(item.materialsEstimateMinor).toBeGreaterThan(0);
    expect(item.shippingEstimateMinor).toBeGreaterThan(0);
    expect(item.totalEstimateMinor).toBe(item.materialsEstimateMinor + item.shippingEstimateMinor);
    expect(JSON.stringify(item)).not.toContain("100 Robotics Way");
    expect(JSON.stringify(item)).not.toContain("luca@example.com");

    const stored = await env.DB.prepare("SELECT email, address_line1, requester_user_id, consent_at, retention_expires_at, estimate_snapshot_json FROM customer_quote_requests WHERE id = ?1").bind(item.id).first<Record<string, unknown>>();
    expect(stored).toMatchObject({ email: "luca@example.com", address_line1: "100 Robotics Way", requester_user_id: ownerId });
    expect(String(stored?.consent_at)).not.toBe("");
    expect(Date.parse(String(stored?.retention_expires_at))).toBeGreaterThan(Date.now());
    expect(String(stored?.estimate_snapshot_json)).not.toContain("Private Test Supplier");
    expect(String(stored?.estimate_snapshot_json)).not.toContain("SECRET-SKU");

    await env.DB.prepare("UPDATE customer_quote_requests SET requester_user_id = ?1 WHERE id = ?2").bind(otherId, item.id).run();
    const privateDenied = await call(`/api/v1/customer-quote-requests/${item.id}`, {}, ownerCookie);
    expect(privateDenied.status).toBe(404);
    await env.DB.prepare("UPDATE customer_quote_requests SET requester_user_id = ?1 WHERE id = ?2").bind(ownerId, item.id).run();
    const ownerRead = await call(`/api/v1/customer-quote-requests/${item.id}`, {}, ownerCookie);
    expect(ownerRead.status).toBe(200);
    expect((await body<{ item: { contact: { email: string; addressLine1: string } } }>(ownerRead)).item.contact).toEqual(expect.objectContaining({ email: "luca@example.com", addressLine1: "100 Robotics Way" }));
  });

  it("keeps structured project proposals private until owner or moderator approval", async () => {
    const createdProject = await call("/api/v1/projects", { method: "POST", body: jsonBody({
      visibility: "public",
      rpps: emptyRpps({ name: "Proposal Review Robot", slug: `proposal-review-${crypto.randomUUID().slice(0, 8)}`, version: "1.0.0" }),
    }) }, ownerCookie);
    expect(createdProject.status).toBe(201);
    const project = (await body<{ item: { id: string } }>(createdProject)).item;
    await env.DB.prepare("UPDATE projects SET status = 'published' WHERE id = ?1").bind(project.id).run();
    const proposalPayload = {
      proposalType: "assembly_step",
      title: "Torque the hip fasteners",
      details: "Add a documented torque verification step after the hip actuator is aligned and before the covers are installed.",
      sourceUrls: ["https://manufacturer.example/assembly-guide#hip-torque"],
    };

    expect((await call(`/api/v1/projects/${project.id}/proposals`, { method: "POST", body: jsonBody(proposalPayload) })).status).toBe(401);
    const invalid = await call(`/api/v1/projects/${project.id}/proposals`, { method: "POST", body: jsonBody({ ...proposalPayload, sourceUrls: [] }) }, ownerCookie);
    expect(invalid.status).toBe(422);
    const created = await call(`/api/v1/projects/${project.id}/proposals`, { method: "POST", body: jsonBody(proposalPayload) }, ownerCookie);
    expect(created.status).toBe(201);
    const proposal = (await body<{ item: { id: string; status: string; sourceUrls: string[] } }>(created)).item;
    expect(proposal).toMatchObject({ status: "pending", sourceUrls: proposalPayload.sourceUrls });

    const publicBefore = await call(`/api/v1/projects/${project.id}/proposals`);
    expect(publicBefore.status).toBe(200);
    expect((await body<{ items: unknown[] }>(publicBefore)).items).toHaveLength(0);
    const reviewQueue = await call(`/api/v1/projects/${project.id}/proposals/review`, {}, ownerCookie);
    expect(reviewQueue.status).toBe(200);
    expect((await body<{ items: Array<{ id: string; status: string }> }>(reviewQueue)).items).toEqual([expect.objectContaining({ id: proposal.id, status: "pending" })]);

    await env.DB.prepare("UPDATE projects SET owner_user_id = ?1 WHERE id = ?2").bind(otherId, project.id).run();
    await env.DB.prepare("DELETE FROM platform_user_roles WHERE user_id = ?1").bind(ownerId).run();
    const deniedReview = await call(`/api/v1/projects/${project.id}/proposals/${proposal.id}`, { method: "PATCH", body: jsonBody({ action: "approve", reviewNote: "Verified against the linked manufacturer guide." }) }, ownerCookie);
    expect(deniedReview.status).toBe(403);
    await env.DB.prepare("INSERT INTO platform_user_roles (user_id, role, granted_by_user_id, granted_at) VALUES (?1, 'administrator', ?1, ?2)").bind(ownerId, new Date().toISOString()).run();
    await env.DB.prepare("UPDATE projects SET owner_user_id = ?1 WHERE id = ?2").bind(ownerId, project.id).run();

    const approved = await call(`/api/v1/projects/${project.id}/proposals/${proposal.id}`, { method: "PATCH", body: jsonBody({ action: "approve", reviewNote: "Verified against the linked manufacturer guide." }) }, ownerCookie);
    expect(approved.status).toBe(200);
    expect((await body<{ item: { status: string; reviewedByUserId: string } }>(approved)).item).toMatchObject({ status: "approved", reviewedByUserId: ownerId });
    const publicAfter = await call(`/api/v1/projects/${project.id}/proposals`);
    expect(publicAfter.status).toBe(200);
    expect((await body<{ items: Array<{ id: string; status: string; authorUserId?: string }> }>(publicAfter)).items).toEqual([
      expect.objectContaining({ id: proposal.id, status: "approved" }),
    ]);
    expect(JSON.stringify(await body<{ items: unknown[] }>(await call(`/api/v1/projects/${project.id}/proposals`)))).not.toContain(ownerId);
  });

  it("reads normalized project profiles and sorts the public catalog by active trend rank", async () => {
    const makeProject = async (name: string) => {
      const response = await call("/api/v1/projects", { method: "POST", body: jsonBody({ visibility: "public", rpps: emptyRpps({ name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}-${crypto.randomUUID().slice(0, 6)}`, version: "1.0.0" }) }) }, ownerCookie);
      expect(response.status).toBe(201);
      return (await body<{ item: { id: string } }>(response)).item;
    };
    const first = await makeProject("Trend Profile One");
    const second = await makeProject("Trend Profile Two");
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE projects SET status = 'published', project_kind = 'commercial_showcase' WHERE id IN (?1, ?2)").bind(first.id, second.id),
      env.DB.prepare(`INSERT INTO project_specs (id, project_id, spec_key, label, value_number, unit, confidence, observed_at, is_current, sort_order, created_at, updated_at)
        VALUES ('spec-trend-one-payload', ?1, 'payload_kg', 'Payload', 5.5, 'kg', 0.9, ?2, 1, 10, ?2, ?2)`).bind(first.id, now),
      env.DB.prepare(`INSERT INTO project_price_estimates (id, project_id, estimate_type, currency, min_minor, max_minor, representative_minor, confidence, method_version, summary, valued_at, expires_at, status, created_at, updated_at)
        VALUES ('price-trend-one', ?1, 'market_estimate', 'USD', 100000, 140000, 120000, 'medium', 'market-estimate-v1', 'Source-reviewed market estimate.', ?2, ?3, 'active', ?2, ?2)`).bind(first.id, now, expires),
      env.DB.prepare(`INSERT INTO project_trend_snapshots (id, project_id, methodology_version, window_start, window_end, search_score, news_score, video_score, official_score, first_party_traffic_score, traffic_sample_sufficient, composite_score, rank, active, captured_at, created_at)
        VALUES ('trend-one-rank-two', ?1, 'trend-v1', '2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 80, 70, 60, 50, NULL, 0, 69, 2, 1, ?2, ?2)`).bind(first.id, now),
      env.DB.prepare(`INSERT INTO project_trend_snapshots (id, project_id, methodology_version, window_start, window_end, search_score, news_score, video_score, official_score, first_party_traffic_score, traffic_sample_sufficient, composite_score, rank, active, captured_at, created_at)
        VALUES ('trend-two-rank-one', ?1, 'trend-v1', '2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 90, 80, 70, 60, NULL, 0, 79, 1, 1, ?2, ?2)`).bind(second.id, now),
    ]);

    const profileResponse = await call(`/api/v1/projects/${first.id}/profile`);
    expect(profileResponse.status).toBe(200);
    const profile = (await body<{ item: { specs: Array<{ spec_key: string; value_number: number }>; active_price_estimate: { representative_minor: number; freshness: string }; active_trend_snapshot: { rank: number; composite_score: number } } }>(profileResponse)).item;
    expect(profile.specs).toEqual([expect.objectContaining({ spec_key: "payload_kg", value_number: 5.5 })]);
    expect(profile.active_price_estimate).toMatchObject({ representative_minor: 120000, freshness: "current" });
    expect(profile.active_trend_snapshot).toMatchObject({ rank: 2, composite_score: 69 });

    const listResponse = await call("/api/v1/projects?kind=commercial_showcase&sort=trend&limit=100");
    expect(listResponse.status).toBe(200);
    const ids = (await body<{ items: Array<{ id: string }> }>(listResponse)).items.map((item) => item.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    expect(ids.indexOf(first.id)).toBeGreaterThanOrEqual(0);
  });

  it("supports editable reviews, one-level discussion, reports, and private evidence-backed badges", async () => {
    const projectResponse = await call("/api/v1/projects", { method: "POST", body: jsonBody({ visibility: "public", rpps: emptyRpps({ name: "Community Profile Robot", slug: `community-profile-${crypto.randomUUID().slice(0, 8)}`, version: "1.0.0" }) }) }, ownerCookie);
    expect(projectResponse.status).toBe(201);
    const project = (await body<{ item: { id: string } }>(projectResponse)).item;
    await env.DB.prepare("UPDATE projects SET status = 'published' WHERE id = ?1").bind(project.id).run();
    const reviewInput = { overallRating: 5, reliabilityRating: 4, usabilityRating: 5, valueRating: 4, supportRating: null, relationship: "evaluator", title: "Strong evaluation platform", body: "The platform was evaluated against its documented capabilities and remained repeatable across multiple controlled sessions." };

    expect((await call(`/api/v1/projects/${project.id}/reviews/mine`, { method: "PUT", body: jsonBody(reviewInput) })).status).toBe(401);
    const createdReview = await call(`/api/v1/projects/${project.id}/reviews/mine`, { method: "PUT", body: jsonBody(reviewInput) }, ownerCookie);
    expect(createdReview.status).toBe(200);
    const review = (await body<{ item: { id: string; version: number; editCount: number } }>(createdReview)).item;
    expect(review).toMatchObject({ version: 1, editCount: 0 });
    const editedReview = await call(`/api/v1/projects/${project.id}/reviews/mine`, { method: "PUT", body: jsonBody({ ...reviewInput, overallRating: 4, title: "Updated controlled evaluation" }) }, ownerCookie);
    expect(editedReview.status).toBe(200);
    expect((await body<{ item: { id: string; version: number; editCount: number } }>(editedReview)).item).toMatchObject({ id: review.id, version: 2, editCount: 1 });
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM project_review_revisions WHERE review_id = ?1").bind(review.id).first<{ value: number }>())?.value)).toBe(1);
    const reviews = await call(`/api/v1/projects/${project.id}/reviews`);
    expect(reviews.status).toBe(200);
    const reviewList = await body<{ aggregate: { count: number; overallAverage: number }; items: Array<{ id: string; authorName: string }> }>(reviews);
    expect(reviewList.aggregate).toMatchObject({ count: 1, overallAverage: 4 });
    expect(reviewList.items[0]).toMatchObject({ id: review.id, authorName: "Owner User" });

    const rootCommentResponse = await call(`/api/v1/projects/${project.id}/comments`, { method: "POST", body: jsonBody({ body: "Has anyone measured repeatability after changing the payload configuration?" }) }, ownerCookie);
    expect(rootCommentResponse.status).toBe(201);
    const rootComment = (await body<{ item: { id: string } }>(rootCommentResponse)).item;
    const replyResponse = await call(`/api/v1/projects/${project.id}/comments`, { method: "POST", body: jsonBody({ parentId: rootComment.id, body: "The published evaluation uses the standard payload configuration." }) }, ownerCookie);
    expect(replyResponse.status).toBe(201);
    const reply = (await body<{ item: { id: string } }>(replyResponse)).item;
    const nested = await call(`/api/v1/projects/${project.id}/comments`, { method: "POST", body: jsonBody({ parentId: reply.id, body: "This reply must be rejected because only one nesting level is supported." }) }, ownerCookie);
    expect(nested.status).toBe(422);
    const helpful = await call(`/api/v1/projects/${project.id}/comments/${rootComment.id}/helpful`, { method: "POST" }, ownerCookie);
    expect(helpful.status).toBe(200);
    expect((await body<{ item: { helpfulCount: number; helpfulByMe: boolean } }>(helpful)).item).toMatchObject({ helpfulCount: 1, helpfulByMe: true });
    const comments = await call(`/api/v1/projects/${project.id}/comments`);
    expect(comments.status).toBe(200);
    expect((await body<{ items: Array<{ id: string; parentId: string | null }> }>(comments)).items).toEqual(expect.arrayContaining([expect.objectContaining({ id: rootComment.id, parentId: null }), expect.objectContaining({ id: reply.id, parentId: rootComment.id })]));

    const report = await call("/api/v1/project-content-reports", { method: "POST", body: jsonBody({ entityType: "review", entityId: review.id, reason: "misinformation", details: "Requesting moderator verification against the linked evaluation record." }) }, ownerCookie);
    expect(report.status).toBe(201);

    const evidenceFileId = await uploadTestFile("operator-evidence.txt", "private operator evidence", ownerCookie);
    const claimResponse = await call(`/api/v1/projects/${project.id}/experience-claims`, { method: "POST", body: jsonBody({ claimType: "operator", evidenceFileId, evidenceReference: "Private commissioning record." }) }, ownerCookie);
    expect(claimResponse.status).toBe(201);
    const claim = (await body<{ item: { id: string; status: string } }>(claimResponse)).item;
    expect(claim.status).toBe("pending");
    expect((await body<{ items: unknown[] }>(await call(`/api/v1/projects/${project.id}/experience-badges`))).items).toHaveLength(0);
    await env.DB.prepare("UPDATE project_experience_claims SET user_id = ?1 WHERE id = ?2").bind(otherId, claim.id).run();
    const verified = await call(`/api/v1/experience-claims/${claim.id}/review`, { method: "PATCH", body: jsonBody({ status: "verified", privateModeratorNotes: "Evidence reviewed against the private commissioning record." }) }, ownerCookie);
    expect(verified.status).toBe(200);
    const badgesPayload = await body<{ items: Array<Record<string, unknown>> }>(await call(`/api/v1/projects/${project.id}/experience-badges`));
    expect(badgesPayload.items).toEqual([expect.objectContaining({ badgeType: "operator", verifiedAt: expect.any(String) })]);
    expect(JSON.stringify(badgesPayload)).not.toContain(evidenceFileId);
    expect(JSON.stringify(badgesPayload)).not.toContain("commissioning record");
  });

  it("persists and revokes Better Auth sessions across sign-out and sign-in", async () => {
    const email = "session-test@example.com";
    const password = "correct-horse-battery";
    const signup = await call("/api/auth/sign-up/email", { method: "POST", body: jsonBody({ name: "Session Test", email, password }) });
    expect(signup.status).toBe(200); const initialCookie = cookies(signup);
    const before = await call("/api/v1/me", {}, initialCookie); expect(before.status).toBe(200);
    const signout = await call("/api/auth/sign-out", { method: "POST" }, initialCookie); expect(signout.status).toBe(200);
    const revoked = await call("/api/v1/me", {}, initialCookie); expect(revoked.status).toBe(401);
    const signin = await call("/api/auth/sign-in/email", { method: "POST", body: jsonBody({ email, password }) });
    expect(signin.status).toBe(200); const renewedCookie = cookies(signin);
    const after = await call("/api/v1/me", {}, renewedCookie); expect(after.status).toBe(200);
  });
});
