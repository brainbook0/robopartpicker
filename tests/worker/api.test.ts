import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { emptyRpps } from "../../src/lib/rpps/schema";
import { classifyGithubProviderError, selectGithubFetchCandidates } from "../../worker/services/project-import";

const origin = "https://example.com";
const ingestionSecret = "test-only-ingestion-secret-32-characters-minimum";
let ownerCookie = "";
let otherCookie = "";
let ownerId = "";
let otherId = "";
let buildId = "";
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

  it("excludes inventory-only binary artifacts from the text fetch queue", () => {
    const selected = selectGithubFetchCandidates([
      { path: "cad/chassis.step", size: 2_000 },
      { path: "meshes/chassis.stl", size: 2_000 },
      { path: "bom.csv", size: 200 },
    ]);

    expect(selected.map((entry) => entry.path)).toEqual(["bom.csv"]);
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

beforeAll(async () => {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO forum_categories (id, slug, name, description, sort_order, created_at)
      VALUES ('cat-general', 'general', 'General engineering', 'Structured technical questions', 1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO manufacturers (id, slug, name, status, is_demo, created_at, updated_at)
      VALUES ('m-test', 'test-motors', 'Test Motors', 'active', 0, ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO components
      (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
       provenance_label, freshness_at, is_demo, version, created_at, updated_at)
      VALUES ('c-test', 'tm-42-motor', 'm-test', 'TM-42', 'TM-42 Motor', 'actuator', 'A test actuator',
       'active', 'worker integration test', ?1, 0, 1, ?1, ?1)`).bind(now),
  ]);
  const owner = await call("/api/auth/sign-up/email", { method: "POST", body: jsonBody({ name: "Owner User", email: "owner@example.com", password: "correct-horse-battery" }) });
  expect(owner.status).toBe(200); ownerCookie = cookies(owner); const ownerData = await body<{ user: { id: string } }>(owner); ownerId = ownerData.user.id;
  const other = await call("/api/auth/sign-up/email", { method: "POST", body: jsonBody({ name: "Other User", email: "other@example.com", password: "correct-horse-battery" }) });
  expect(other.status).toBe(200); otherCookie = cookies(other); const otherData = await body<{ user: { id: string } }>(other); otherId = otherData.user.id;
  await env.DB.prepare(`INSERT INTO platform_user_roles (user_id, role, granted_by_user_id, granted_at)
    VALUES (?1, 'administrator', ?1, ?2)`).bind(ownerId, now).run();
});

describe("Worker, D1, R2, authentication, and domain invariants", () => {
  it("applies the complete schema and searches the D1 FTS index", async () => {
    const migrations = await env.DB.prepare("SELECT COUNT(*) AS value FROM d1_migrations").first<{ value: number }>();
    expect(Number(migrations?.value)).toBe(14);
    const health = await call("/api/health"); expect(health.status).toBe(200); expect(await body<{ database: string; version: string }>(health)).toMatchObject({ database: "d1", version: "0.6.0" });
    const search = await call("/api/v1/search?q=motor"); expect(search.status).toBe(200);
    expect((await body<{ items: Array<{ id: string }> }>(search)).items.some((item) => item.id === "c-test")).toBe(true);
    const manufacturers = await call("/api/v1/manufacturers"); expect(manufacturers.status).toBe(200);
    const integrations = await call("/api/v1/integrations"); expect(integrations.status).toBe(200);
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

  it("stores a private file in R2, attaches it, and enforces content authorization", async () => {
    const initialized = await call("/api/v1/files/uploads", { method: "POST", body: jsonBody({ originalName: "evidence.txt", mediaType: "text/plain", sizeBytes: 5, kind: "document", visibility: "private" }) }, ownerCookie);
    expect(initialized.status).toBe(201); const upload = await body<{ file: { id: string }; upload: { url: string; token: string } }>(initialized);
    const stored = await call(upload.upload.url, { method: "PUT", headers: { "content-type": "text/plain", "content-length": "5", "x-upload-token": upload.upload.token }, body: "hello" }, ownerCookie);
    expect(stored.status).toBe(201); expect((await body<{ status: string }>(stored)).status).toBe("ready");
    const attached = await call(`/api/v1/files/${upload.file.id}/attachments`, { method: "POST", body: jsonBody({ entityType: "build", entityId: buildId, purpose: "test_evidence" }) }, ownerCookie); expect(attached.status).toBe(201);
    const denied = await call(`/api/v1/files/${upload.file.id}/content`, {}, otherCookie); expect(denied.status).toBe(403); await denied.text();
    const content = await call(`/api/v1/files/${upload.file.id}/content`, {}, ownerCookie); expect(content.status).toBe(200); expect(await content.text()).toBe("hello");
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
      "README.md": strToU8("# Bench robot\nA small robot used for repeatable integration tests.\n\n## Assembly\n1. Bolt the drive motors to the chassis.\n2. Route and strain-relieve the motor cables.\n\n## Calibration\n1. Zero the wheel encoders on a level surface."),
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
    expect(result.inventory).toMatchObject({ totalFiles: 8, relevantFiles: 8 });
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
    const readmeId = await uploadTestFile("README.md", "# Uploadbot\n\n## Assembly\n1. Attach each hip actuator to the chassis.\n2. Route the power harness.\n", ownerCookie);
    const denied = await call("/api/v1/projects/import/files", { method: "POST", body: jsonBody({ fileIds: [bomId, urdfId, readmeId] }) }, otherCookie);
    expect(denied.status).toBe(403);
    const analyzed = await call("/api/v1/projects/import/files", { method: "POST", body: jsonBody({ fileIds: [bomId, urdfId, readmeId] }) }, ownerCookie);
    expect(analyzed.status).toBe(200);
    const result = (await body<{ analysis: { sourceType: string; inventory: { totalFiles: number; detected: string[] }; extracted: { model: { robotName: string; movableJointCount: number }; parts: { candidates: Array<{ mpn?: string }> }; procedureCandidates: Array<{ kind: string }> } } }>(analyzed)).analysis;
    expect(result.sourceType).toBe("files");
    expect(result.inventory).toMatchObject({ totalFiles: 3 });
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

    const privateAttribution = await call(`/api/v1/projects/${projectId}/reproductions`);
    expect(privateAttribution.status).toBe(200);
    expect(await body(privateAttribution)).toMatchObject({
      publicAttributionCount: 0,
      privateAttributionCount: 1,
      items: [expect.objectContaining({ outcome: "succeeded", independence: "independent", builder_name: null, attribution_public: 0 })],
    });
    await env.DB.prepare("UPDATE builds SET visibility = 'public' WHERE id = ?1").bind(startedBody.item.id).run();
    const publicAttribution = await call(`/api/v1/projects/${projectId}/reproductions`);
    expect(publicAttribution.status).toBe(200);
    expect(await body(publicAttribution)).toMatchObject({
      publicAttributionCount: 1,
      privateAttributionCount: 0,
      items: [expect.objectContaining({ outcome: "succeeded", builder_name: "Other User", attribution_public: 1 })],
    });

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
    expect(tools).toEqual(expect.arrayContaining(["search_components", "compare_components", "search_projects", "get_project", "search_suppliers", "validate_rpps"]));

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

  it("persists technical evidence, resolves information gaps, and protects private project records", async () => {
    const created = await call("/api/v1/projects", { method: "POST", body: jsonBody({ visibility: "public", rpps: emptyRpps({ name: "Evidence Workflow Robot", slug: `evidence-workflow-${crypto.randomUUID().slice(0, 8)}` }) }) }, ownerCookie);
    expect(created.status).toBe(201); const project = (await body<{ item: { id: string } }>(created)).item;
    const privateRecord = await call("/api/v1/technical-records", { method: "POST", body: jsonBody({ recordType: "test_result", projectId: project.id, title: "Private drivetrain test", resultText: "Observed 4.2 A peak current under a 2 kg load.", confidence: 0.9, visibility: "private" }) }, ownerCookie);
    expect(privateRecord.status).toBe(201);
    const collaborators = await call(`/api/v1/projects/${project.id}/collaborators`, {}, ownerCookie);
    expect(collaborators.status).toBe(200);
    expect((await body<{ items: Array<{ user_id: string; role: string; status: string }> }>(collaborators)).items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ user_id: ownerId, role: "owner", status: "active" })]));
    const ownerRecords = await call(`/api/v1/technical-records?projectId=${project.id}`, {}, ownerCookie); expect(ownerRecords.status).toBe(200); expect((await body<{ items: unknown[] }>(ownerRecords)).items).toHaveLength(1);
    const publicRecords = await call(`/api/v1/technical-records?projectId=${project.id}`, {}, otherCookie); expect(publicRecords.status).toBe(200); expect((await body<{ items: unknown[] }>(publicRecords)).items).toHaveLength(0);

    const gap = await call(`/api/v1/projects/${project.id}/missing-information`, { method: "POST", body: jsonBody({ question: "Which encoder firmware revision was tested?", missingFields: ["firmware revision"], reliabilityReason: "No configuration snapshot names the encoder firmware.", suggestedSources: ["firmware manifest"], visibility: "project" }) }, ownerCookie);
    expect(gap.status).toBe(201); const gapId = (await body<{ id: string }>(gap)).id;
    const response = await call(`/api/v1/missing-information/${gapId}/responses`, { method: "POST", body: jsonBody({ responseText: "The attached build log identifies encoder firmware revision 2.3.1.", sources: [{ type: "build-log", revision: "2.3.1" }], fileIds: [] }) }, otherCookie);
    expect(response.status).toBe(201); const responseId = (await body<{ id: string }>(response)).id;
    const approved = await call(`/api/v1/missing-information/responses/${responseId}/review`, { method: "POST", body: jsonBody({ decision: "approve", notes: "Revision is explicitly recorded." }) }, ownerCookie);
    expect(approved.status).toBe(200); expect((await body<{ status: string }>(approved)).status).toBe("resolved");
    const resolved = await call(`/api/v1/missing-information/${gapId}`, {}, ownerCookie); expect(resolved.status).toBe(200); expect((await body<{ item: { status: string } }>(resolved)).item.status).toBe("resolved");

    const friction = await call("/api/v1/ai/friction", { method: "POST", body: jsonBody({ category: "user_correction", feature: "technical-record", context: { field: "firmware" }, userCorrection: "Revision is 2.3.1", projectId: project.id }) }, ownerCookie);
    expect(friction.status).toBe(201); const frictionId = (await body<{ id: string }>(friction)).id;
    const listed = await call("/api/v1/ai/friction", {}, ownerCookie); expect(listed.status).toBe(200); expect((await body<{ items: Array<{ id: string }> }>(listed)).items.some((item) => item.id === frictionId)).toBe(true);
    const removed = await call(`/api/v1/ai/friction/${frictionId}`, { method: "DELETE" }, ownerCookie); expect(removed.status).toBe(204);

    const analytics = await call(`/api/v1/projects/${project.id}/analytics/events`, { method: "POST", body: jsonBody({ eventType: "view", sessionId: "worker-test-session", metadata: { surface: "project" } }) }); expect(analytics.status).toBe(201);
    const creatorAnalytics = await call(`/api/v1/projects/${project.id}/analytics`, {}, ownerCookie); expect(creatorAnalytics.status).toBe(200); expect((await body<{ privateMetrics: { uniqueViews: number } }>(creatorAnalytics)).privateMetrics.uniqueViews).toBeGreaterThanOrEqual(1);
  });

  it("enforces message requests and creates safe active conversations", async () => {
    const requested = await call("/api/v1/messages/conversations", { method: "POST", body: jsonBody({ recipientUserId: otherId, contextType: "general", message: "Could we compare actuator test evidence?" }) }, ownerCookie);
    expect(requested.status).toBe(201); const conversation = await body<{ id: string; status: string }>(requested); expect(conversation.status).toBe("requested");
    const pending = await call(`/api/v1/messages/conversations/${conversation.id}`, {}, otherCookie); expect(pending.status).toBe(200); expect((await body<{ membership: { request_status: string } }>(pending)).membership.request_status).toBe("pending");
    const accepted = await call(`/api/v1/messages/conversations/${conversation.id}/respond`, { method: "POST", body: jsonBody({ accept: true }) }, otherCookie); expect(accepted.status).toBe(200);
    const sent = await call(`/api/v1/messages/conversations/${conversation.id}/messages`, { method: "POST", body: jsonBody({ bodyMarkdown: "Yes—please send the **measured conditions**." }) }, ownerCookie); expect(sent.status).toBe(201); expect((await body<{ status: string }>(sent)).status).toBe("sent");
    const inbox = await call("/api/v1/messages/conversations", {}, otherCookie); expect(inbox.status).toBe(200); expect((await body<{ items: Array<{ id: string }> }>(inbox)).items.some((item) => item.id === conversation.id)).toBe(true);
  });

  it("queues static robot imports and bounds the job to its owner", async () => {
    const fileId = await uploadTestFile("test-robot.urdf", `<robot name="safe"><link name="base"/><link name="arm"/><joint name="axis" type="revolute"><parent link="base"/><child link="arm"/></joint></robot>`, ownerCookie, "urdf");
    const queued = await call("/api/v1/imports/project-jobs", { method: "POST", body: jsonBody({ fileIds: [fileId], idempotencyKey: `worker-import-${crypto.randomUUID()}` }) }, ownerCookie);
    expect(queued.status).toBe(202); const jobId = (await body<{ item: { id: string } }>(queued)).item.id;
    const detail = await call(`/api/v1/imports/project-jobs/${jobId}`, {}, ownerCookie); expect(detail.status).toBe(200); expect((await body<{ files: Array<{ format_key: string }> }>(detail)).files[0].format_key).toBe("urdf");
    const denied = await call(`/api/v1/imports/project-jobs/${jobId}`, {}, otherCookie); expect(denied.status).toBe(404);
  });

  it("tracks exact BOM verification versions and robot part-out drafts", async () => {
    const projectResponse = await call("/api/v1/projects", { method: "POST", body: jsonBody({ visibility: "private", rpps: emptyRpps({ name: "Verification Robot", slug: `verification-${crypto.randomUUID().slice(0, 8)}`, bom: [{ name: "TM-42 Motor", qty: 2, mpn: "TM-42" }] }) }) }, ownerCookie);
    expect(projectResponse.status).toBe(201); const projectId = (await body<{ item: { id: string } }>(projectResponse)).item.id;
    const verification = await call("/api/v1/bom-verifications", { method: "POST", body: jsonBody({ projectId, sourceType: "manual", snapshot: { title: "Original" }, lines: [{ lineKey: "motor", rawText: "2x TM-42 Motor", identity: { mpn: "TM-42" }, quantity: 2, status: "unresolved", confidence: 0.6 }] }) }, ownerCookie);
    expect(verification.status).toBe(201); const verificationId = (await body<{ id: string }>(verification)).id;
    const correction = await call(`/api/v1/bom-verifications/${verificationId}/versions`, { method: "POST", body: jsonBody({ snapshot: { title: "Corrected" }, changeDescription: "Confirmed manufacturer part number", lines: [{ lineKey: "motor", rawText: "2x TM-42 Motor", componentId: "c-test", identity: { mpn: "TM-42" }, quantity: 2, status: "resolved", confidence: 1 }] }) }, ownerCookie); expect(correction.status).toBe(201);
    expect((await call(`/api/v1/bom-verifications/${verificationId}/submit`, { method: "POST" }, ownerCookie)).status).toBe(200);
    expect((await call(`/api/v1/bom-verifications/${verificationId}/reviews`, { method: "POST", body: jsonBody({ decision: "verify", notes: "Component identity matches the catalog." }) }, ownerCookie)).status).toBe(200);
    const verificationDetail = await call(`/api/v1/bom-verifications/${verificationId}`, {}, ownerCookie); expect(verificationDetail.status).toBe(200); const verificationBody = await body<{ item: { status: string }; versions: unknown[] }>(verificationDetail); expect(verificationBody.item.status).toBe("verified"); expect(verificationBody.versions).toHaveLength(2);

    const build = await call("/api/v1/builds", { method: "POST", body: jsonBody({ name: "Part-out source robot", visibility: "private" }) }, ownerCookie); expect(build.status).toBe(201); const sourceBuildId = (await body<{ item: { id: string } }>(build)).item.id;
    expect((await call(`/api/v1/builds/${sourceBuildId}/items`, { method: "POST", body: jsonBody({ componentId: "c-test", description: "TM-42 Motor", quantity: 2 }) }, ownerCookie)).status).toBe(201);
    const partOut = await call("/api/v1/marketplace/part-outs", { method: "POST", body: jsonBody({ sourceBuildId, currency: "USD" }) }, ownerCookie); expect(partOut.status).toBe(201); const partOutId = (await body<{ id: string }>(partOut)).id;
    const inventory = await call(`/api/v1/marketplace/part-outs/${partOutId}`, {}, ownerCookie); expect(inventory.status).toBe(200); const itemId = (await body<{ items: Array<{ id: string }> }>(inventory)).items[0].id;
    expect((await call(`/api/v1/marketplace/part-outs/${partOutId}/items/${itemId}`, { method: "PATCH", body: jsonBody({ presenceStatus: "present", conditionGrade: "B", testEvidence: [{ method: "spin test", result: "passed" }], pricing: { askingMinor: 12000 } }) }, ownerCookie)).status).toBe(200);
    const estimate = await call(`/api/v1/marketplace/part-outs/${partOutId}/estimates`, { method: "POST", body: jsonBody({ shippingComplexity: "medium", estimatedFeeRate: 0.13, ageAssumptionYears: 2 }) }, ownerCookie); expect(estimate.status).toBe(200); expect((await body<{ estimates: unknown[] }>(estimate)).estimates).toHaveLength(2);
    const drafts = await call(`/api/v1/marketplace/part-outs/${partOutId}/draft-listings`, { method: "POST", body: jsonBody({ itemIds: [itemId], bundleIds: [] }) }, ownerCookie); expect(drafts.status).toBe(201); expect((await body<{ items: unknown[] }>(drafts)).items).toHaveLength(1);
  });
});
