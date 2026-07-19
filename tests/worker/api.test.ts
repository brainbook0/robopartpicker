import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

const origin = "https://example.com";
const ingestionSecret = "test-only-ingestion-secret-32-characters-minimum";
let ownerCookie = "";
let otherCookie = "";
let ownerId = "";
let otherId = "";
let buildId = "";

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
    expect(Number(migrations?.value)).toBe(9);
    const health = await call("/api/health"); expect(health.status).toBe(200); expect((await body<{ database: string }>(health)).database).toBe("d1");
    const search = await call("/api/v1/search?q=motor"); expect(search.status).toBe(200);
    expect((await body<{ items: Array<{ id: string }> }>(search)).items.some((item) => item.id === "c-test")).toBe(true);
    const manufacturers = await call("/api/v1/manufacturers"); expect(manufacturers.status).toBe(200);
    const integrations = await call("/api/v1/integrations"); expect(integrations.status).toBe(200);
  });

  it("creates a persistent build and isolates it from another user", async () => {
    const created = await call("/api/v1/builds", { method: "POST", body: jsonBody({ name: "Private test robot", visibility: "private" }) }, ownerCookie);
    expect(created.status).toBe(201); buildId = (await body<{ item: { id: string } }>(created)).item.id;
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

  it("enforces organization roles on server-side mutations", async () => {
    const created = await call("/api/v1/organizations", { method: "POST", body: jsonBody({ name: "Test Robotics Group", slug: "test-robotics-group" }) }, ownerCookie);
    expect(created.status).toBe(201); const organization = (await body<{ item: { id: string; version: number } }>(created)).item;
    const added = await call(`/api/v1/organizations/${organization.id}/members`, { method: "POST", body: jsonBody({ email: "other@example.com", role: "viewer" }) }, ownerCookie);
    expect(added.status).toBe(201);
    const denied = await call(`/api/v1/organizations/${organization.id}`, { method: "PATCH", body: jsonBody({ name: "Unauthorized rename", version: organization.version }) }, otherCookie);
    expect(denied.status).toBe(403);
    const updated = await call(`/api/v1/organizations/${organization.id}`, { method: "PATCH", body: jsonBody({ name: "Authorized Robotics Group", version: organization.version }) }, ownerCookie);
    expect(updated.status).toBe(200);
  });

  it("persists Marketplace inquiry records without claiming payment processing", async () => {
    const draft = await call("/api/v1/marketplace", { method: "POST", body: jsonBody({ listingType: "sell", title: "TM-42 actuator test unit", description: "Used for integration testing with measured encoder output.", category: "actuator", conditionGrade: "B", currency: "USD", price: 125, quantity: 1, region: "US", visibility: "public" }) }, ownerCookie);
    expect(draft.status).toBe(201); const listing = (await body<{ item: { id: string; version: number } }>(draft)).item;
    const published = await call(`/api/v1/marketplace/${listing.id}/status`, { method: "PUT", body: jsonBody({ status: "published" }) }, ownerCookie); expect(published.status).toBe(200);
    const inquiry = await call(`/api/v1/marketplace/${listing.id}/inquiries`, { method: "POST", body: jsonBody({ subject: "Encoder evidence", message: "Can you share the encoder test conditions and calibration log?" }) }, otherCookie);
    expect(inquiry.status).toBe(201); expect((await body<{ paymentProcessed: boolean }>(inquiry)).paymentProcessed).toBe(false);
    expect(Number((await env.DB.prepare("SELECT COUNT(*) AS value FROM notifications WHERE user_id = ?1 AND notification_type = 'marketplace_inquiry'").bind(ownerId).first<{ value: number }>())?.value)).toBe(1);
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
    const response = await call("/api/v1/ai/chat", { method: "POST", body: jsonBody({ threadId: id, messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "Find an actuator" }] }] }) }, ownerCookie);
    expect(response.status).toBe(503); expect((await body<{ error: { code: string } }>(response)).error.code).toBe("AI_PROVIDER_NOT_CONFIGURED");
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
