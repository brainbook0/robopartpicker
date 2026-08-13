import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { authenticatedUserId, requirePlatformRole } from "../middleware/authorization";
import { parseJson } from "../validation";
import { matchStatements, normalizedName, recordTypes, sha256, stagingStatements, validateParsedData } from "../services/ingestion";
import { recordAuditEvent } from "../services/audit";
import { computePublishability, resolveUpstreamIdentity } from "../../src/shared/provenance";

const httpUrl = z.string().url().max(2_048).refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Only HTTP(S) URLs are allowed.");
const sourceSchema = z.object({ name: z.string().trim().min(2).max(200), type: z.string().trim().min(2).max(100), baseUrl: httpUrl.nullable().optional(), priority: z.number().int().min(1).max(1_000).default(100), trustWeight: z.number().min(0).max(1).default(0.5) }).strict();
const recordEnvelope = z.object({
  externalRecordId: z.string().trim().min(1).max(500), recordType: z.enum(recordTypes), sourceUrl: httpUrl.nullable().optional(),
  rawPayload: z.unknown(), parsedData: z.unknown(), confidence: z.number().min(0).max(1), action: z.enum(["upsert", "withdraw"]).default("upsert"),
  withdrawalOfExternalRecordId: z.string().trim().min(1).max(500).nullable().optional(),
}).strict().superRefine((record, ctx) => {
  if (record.action === "withdraw" && !record.withdrawalOfExternalRecordId) {
    ctx.addIssue({ code: "custom", path: ["withdrawalOfExternalRecordId"], message: "A withdrawal target is required." });
  }
});
export const batchSchema = z.object({
  schemaVersion: z.literal("1.0"), batchId: z.string().trim().min(1).max(200), idempotencyKey: z.string().trim().min(8).max(200),
  retrievalTimestamp: z.string().datetime(), source: sourceSchema, records: z.array(z.unknown()).min(1).max(100),
}).strict();
const reviewSchema = z.object({ decision: z.enum(["create", "merge"]).default("create"), canonicalEntityId: z.string().max(200).nullable().optional() }).strict();
const rejectSchema = z.object({ reason: z.string().trim().min(2).max(2_000) }).strict();

export const importRoutes = new Hono<AppBindings>();

importRoutes.post("/imports/batches", async (c) => {
  await requireIngestionCredential(c.req.raw.headers, c.env.INGESTION_SECRET);
  const idempotencyHeader = c.req.header("idempotency-key");
  const body = await parseJson(c, batchSchema);
  if (idempotencyHeader !== body.idempotencyKey) throw new AppError(422, "IDEMPOTENCY_KEY_MISMATCH", "Idempotency-Key must match the payload.");
  const sourceSlug = slugify(body.source.name);
  const now = new Date().toISOString();
  let source = await c.env.DB.prepare("SELECT id FROM import_sources WHERE slug = ?1").bind(sourceSlug).first<{ id: string }>();
  if (!source) {
    source = { id: crypto.randomUUID() };
    await c.env.DB.prepare(`INSERT INTO import_sources
      (id, slug, name, source_type, base_url, priority, trust_weight, status, service_credential_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', 'ingestion-secret', ?8, ?8)`)
      .bind(source.id, sourceSlug, body.source.name, body.source.type, body.source.baseUrl ?? null, body.source.priority, body.source.trustWeight, now).run();
  }
  const prior = await c.env.DB.prepare("SELECT * FROM import_jobs WHERE source_id = ?1 AND (idempotency_key = ?2 OR batch_id = ?3) LIMIT 1")
    .bind(source.id, body.idempotencyKey, body.batchId).first<Record<string, unknown>>();
  if (prior) return c.json({ duplicate: true, job: summarizeJob(prior), records: [] });

  const jobId = crypto.randomUUID();
  const payloadHash = await sha256(JSON.stringify(body));
  await c.env.DB.prepare(`INSERT INTO import_jobs
    (id, source_id, batch_id, idempotency_key, schema_version, status, retrieval_timestamp, payload_hash,
     attempt_count, service_actor_id, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, 'validating', ?6, ?7, 1, 'external-ingestion', ?8, ?8)`)
    .bind(jobId, source.id, body.batchId, body.idempotencyKey, body.schemaVersion, body.retrievalTimestamp, payloadHash, now).run();

  const outcomes: Array<Record<string, unknown>> = [];
  let accepted = 0; let rejected = 0; let duplicates = 0;
  for (let index = 0; index < body.records.length; index += 1) {
    const envelope = recordEnvelope.safeParse(body.records[index]);
    if (!envelope.success) {
      rejected += 1;
      const issue = envelope.error.issues[0];
      await addImportError(c.env.DB, jobId, null, "INVALID_RECORD_ENVELOPE", `records.${index}.${issue?.path.join(".") ?? ""}`, issue?.message ?? "Invalid record.", now);
      outcomes.push({ index, status: "rejected", errors: envelope.error.issues.map((item) => ({ path: item.path.join("."), message: item.message })) });
      continue;
    }
    const record = envelope.data;
    const parsed = validateParsedData(record.recordType, record.parsedData);
    if (!parsed.success && record.action !== "withdraw") {
      rejected += 1;
      for (const issue of parsed.error.issues.slice(0, 20)) await addImportError(c.env.DB, jobId, null, "INVALID_PARSED_DATA", `records.${index}.parsedData.${issue.path.join(".")}`, issue.message, now);
      outcomes.push({ index, externalRecordId: record.externalRecordId, status: "rejected", errors: parsed.error.issues.map((item) => ({ path: item.path.join("."), message: item.message })) });
      continue;
    }
    try {
      const recordId = crypto.randomUUID();
      const rawJson = JSON.stringify(record.rawPayload ?? null);
      const parsedJson = JSON.stringify(parsed.success ? parsed.data : record.parsedData ?? {});
      const fingerprint = await sha256(`${record.recordType}\n${normalizedName(record.externalRecordId)}\n${parsedJson}`);
      const duplicate = await c.env.DB.prepare(`SELECT id FROM import_records WHERE source_id = ?1 AND record_type = ?2
        AND normalized_fingerprint = ?3 AND status NOT IN ('withdrawn', 'rejected', 'failed') LIMIT 1`)
        .bind(source.id, record.recordType, fingerprint).first<{ id: string }>();
      const previousWithdrawal = record.action === "withdraw"
        ? await c.env.DB.prepare(`SELECT id FROM import_records WHERE source_id = ?1 AND record_type = ?2 AND external_record_id = ?3
            AND status NOT IN ('withdrawn', 'rejected') ORDER BY created_at DESC LIMIT 1`)
          .bind(source.id, record.recordType, record.withdrawalOfExternalRecordId ?? record.externalRecordId).first<{ id: string }>()
        : null;
      const status = record.action === "withdraw" ? "withdrawn" : duplicate ? "duplicate" : "staged";
      const statements: D1PreparedStatement[] = [c.env.DB.prepare(`INSERT INTO import_records
        (id, import_job_id, source_id, external_record_id, record_type, source_url, confidence, raw_payload_json,
         parsed_data_json, normalized_fingerprint, status, withdrawal_of_record_id, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)`)
        .bind(recordId, jobId, source.id, record.externalRecordId, record.recordType, record.sourceUrl ?? null, record.confidence,
          rawJson, parsedJson, fingerprint, status, previousWithdrawal?.id ?? null, now)];
      if (previousWithdrawal) statements.push(c.env.DB.prepare("UPDATE import_records SET status = 'withdrawn', updated_at = ?1 WHERE id = ?2").bind(now, previousWithdrawal.id));
      if (!duplicate && record.action === "upsert" && parsed.success) {
        statements.push(...stagingStatements(c.env.DB, record.recordType, recordId, parsed.data, now));
        statements.push(...await matchStatements(c.env.DB, record.recordType, recordId, parsed.data, now));
      }
      statements.push(c.env.DB.prepare(`INSERT INTO import_audit_events
        (id, import_job_id, import_record_id, actor_service_id, event_type, after_json, created_at)
        VALUES (?1, ?2, ?3, 'external-ingestion', ?4, ?5, ?6)`)
        .bind(crypto.randomUUID(), jobId, recordId, record.action === "withdraw" ? "record.withdrawn" : `record.${status}`, JSON.stringify({ fingerprint }), now));
      await c.env.DB.batch(statements);
      if (duplicate) duplicates += 1; else accepted += 1;
      outcomes.push({ index, externalRecordId: record.externalRecordId, recordId, status, duplicateOf: duplicate?.id ?? null });
    } catch (error) {
      rejected += 1;
      await addImportError(c.env.DB, jobId, null, "RECORD_PROCESSING_FAILED", `records.${index}`, error instanceof Error ? error.message.slice(0, 500) : "Record processing failed.", now);
      outcomes.push({ index, externalRecordId: record.externalRecordId, status: "failed" });
    }
  }
  const finalStatus = rejected === 0 ? "staged" : accepted + duplicates > 0 ? "partial" : "failed";
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE import_jobs SET status = ?1, accepted_count = ?2, rejected_count = ?3, duplicate_count = ?4,
      updated_at = ?5, completed_at = ?5 WHERE id = ?6`).bind(finalStatus, accepted, rejected, duplicates, new Date().toISOString(), jobId),
    c.env.DB.prepare(`INSERT INTO import_audit_events
      (id, import_job_id, actor_service_id, event_type, after_json, created_at)
      VALUES (?1, ?2, 'external-ingestion', 'batch.completed', ?3, ?4)`)
      .bind(crypto.randomUUID(), jobId, JSON.stringify({ status: finalStatus, accepted, rejected, duplicates }), new Date().toISOString()),
  ]);
  return c.json({ duplicate: false, job: { id: jobId, status: finalStatus, acceptedCount: accepted, rejectedCount: rejected, duplicateCount: duplicates }, records: outcomes }, finalStatus === "failed" ? 422 : 202);
});

importRoutes.get("/imports", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const jobs = await c.env.DB.prepare(`SELECT * FROM import_jobs WHERE requested_by_user_id = ?1
    ORDER BY created_at DESC LIMIT 100`).bind(userId).all<Record<string, unknown>>();
  return c.json({ items: jobs.results.map(summarizeJob) });
});

importRoutes.get("/admin/import-records", loadAuthSession, requireAuth, requirePlatformRole("moderator", "administrator"), async (c) => {
  const status = c.req.query("status") ?? "staged";
  const result = await c.env.DB.prepare(`SELECT ir.*, i.name AS source_name FROM import_records ir
    JOIN import_sources i ON i.id = ir.source_id WHERE ir.status = ?1 ORDER BY ir.created_at LIMIT 200`).bind(status).all<Record<string, unknown>>();
  return c.json({ items: result.results.map((row) => ({ ...row, raw_payload_json: undefined, parsedData: JSON.parse(String(row.parsed_data_json)), parsed_data_json: undefined })) });
});

importRoutes.post("/admin/import-records/:id/approve", loadAuthSession, requireAuth, requirePlatformRole("administrator"), async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, reviewSchema);
  const record = await c.env.DB.prepare("SELECT * FROM import_records WHERE id = ?1 AND status IN ('staged', 'review')").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!record) throw new AppError(404, "IMPORT_RECORD_NOT_FOUND", "Pending import record not found.");
  const recordType = String(record.record_type);
  const parsed = JSON.parse(String(record.parsed_data_json)) as Record<string, unknown>;
  const now = new Date().toISOString();
  let canonicalId = body.canonicalEntityId ?? null;
  let canonicalStatements: D1PreparedStatement[] = [];
  if (body.decision === "merge") {
    if (!canonicalId) throw new AppError(422, "CANONICAL_ENTITY_REQUIRED", "A canonical entity is required for a merge.");
    await ensureCanonical(c.env.DB, recordType, canonicalId);
  } else {
    if (["teardown", "commercial_robot", "marketplace_reference"].includes(recordType)) canonicalId = String(record.id);
    else {
      const prepared = await prepareCanonical(c.env.DB, recordType, parsed, {
        importRecordId: String(record.id),
        sourceId: String(record.source_id),
        sourceUrl: String(record.source_url ?? "") || null,
        userId,
        now,
      });
      canonicalId = prepared.id;
      canonicalStatements = prepared.statements;
    }
  }
  const stagingTable = stagingTableFor(recordType);
  const statements: D1PreparedStatement[] = [
    ...canonicalStatements,
    c.env.DB.prepare(`UPDATE import_records SET status = 'approved', canonical_entity_type = ?1,
      canonical_entity_id = ?2, updated_at = ?3 WHERE id = ?4`).bind(recordType, canonicalId, now, record.id),
    c.env.DB.prepare(`UPDATE canonical_match_candidates SET decision = CASE WHEN canonical_entity_id = ?1 THEN 'accepted' ELSE 'rejected' END,
      decided_by_user_id = ?2, decided_at = ?3 WHERE import_record_id = ?4`).bind(canonicalId, userId, now, record.id),
    c.env.DB.prepare(`INSERT INTO import_audit_events
      (id, import_job_id, import_record_id, actor_user_id, event_type, after_json, created_at)
      VALUES (?1, ?2, ?3, ?4, 'record.approved', ?5, ?6)`)
      .bind(crypto.randomUUID(), record.import_job_id, record.id, userId, JSON.stringify({ decision: body.decision, canonicalId }), now),
  ];
  if (stagingTable) statements.push(c.env.DB.prepare(`UPDATE ${stagingTable} SET review_status = ?1 WHERE import_record_id = ?2`).bind(body.decision === "merge" ? "merged" : "approved", record.id));
  await c.env.DB.batch(statements);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "import.record.approve", entityType: recordType, entityId: canonicalId, requestId: c.get("requestId"), after: { importRecordId: record.id, decision: body.decision } });
  return c.json({ importRecordId: record.id, canonicalEntityType: recordType, canonicalEntityId: canonicalId, decision: body.decision });
});

importRoutes.post("/admin/import-records/:id/reject", loadAuthSession, requireAuth, requirePlatformRole("moderator", "administrator"), async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, rejectSchema); const now = new Date().toISOString();
  const record = await c.env.DB.prepare("SELECT * FROM import_records WHERE id = ?1 AND status IN ('staged', 'review')").bind(c.req.param("id")).first<Record<string, unknown>>();
  if (!record) throw new AppError(404, "IMPORT_RECORD_NOT_FOUND", "Pending import record not found.");
  const stagingTable = stagingTableFor(String(record.record_type));
  const statements = [
    c.env.DB.prepare("UPDATE import_records SET status = 'rejected', updated_at = ?1 WHERE id = ?2").bind(now, record.id),
    c.env.DB.prepare(`INSERT INTO import_audit_events (id, import_job_id, import_record_id, actor_user_id, event_type, after_json, created_at)
      VALUES (?1, ?2, ?3, ?4, 'record.rejected', ?5, ?6)`).bind(crypto.randomUUID(), record.import_job_id, record.id, userId, JSON.stringify({ reason: body.reason }), now),
  ];
  if (stagingTable) statements.push(c.env.DB.prepare(`UPDATE ${stagingTable} SET review_status = 'rejected' WHERE import_record_id = ?1`).bind(record.id));
  await c.env.DB.batch(statements);
  return c.json({ rejected: true });
});

async function requireIngestionCredential(headers: Headers, configured: string): Promise<void> {
  const authorization = headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : headers.get("x-ingestion-secret") ?? "";
  if (!configured || configured.startsWith("replace-with") || !provided || !constantTime(await sha256(provided), await sha256(configured))) throw new AppError(401, "INGESTION_AUTHENTICATION_FAILED", "A valid ingestion service credential is required.");
}

async function addImportError(db: D1Database, jobId: string, recordId: string | null, code: string, path: string, message: string, now: string) {
  await db.prepare(`INSERT INTO import_errors (id, import_job_id, import_record_id, error_code, path, message, retryable, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)`).bind(crypto.randomUUID(), jobId, recordId, code, path, message, now).run();
}
function summarizeJob(row: Record<string, unknown>) { return { id: row.id, batchId: row.batch_id, status: row.status, schemaVersion: row.schema_version, acceptedCount: row.accepted_count, rejectedCount: row.rejected_count, duplicateCount: row.duplicate_count, createdAt: row.created_at, completedAt: row.completed_at }; }
function slugify(value: string): string { return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 80) || "source"; }
function constantTime(left: string, right: string): boolean { if (left.length !== right.length) return false; let value = 0; for (let index = 0; index < left.length; index += 1) value |= left.charCodeAt(index) ^ right.charCodeAt(index); return value === 0; }
function stagingTableFor(type: string): string | null { return ({ manufacturer: "staging_manufacturers", supplier: "staging_suppliers", component: "staging_components", offer: "staging_offers", project: "staging_projects", bom: "staging_boms", integration: "staging_integrations" } as Record<string, string>)[type] ?? null; }

async function ensureCanonical(db: D1Database, type: string, id: string): Promise<void> {
  const table = ({ manufacturer: "manufacturers", supplier: "suppliers", component: "components", offer: "supplier_offers", project: "projects", bom: "boms", integration: "integrations", evidence: "evidence" } as Record<string, string>)[type];
  if (!table) throw new AppError(422, "UNSUPPORTED_CANONICAL_TYPE", `Manual approval for ${type} is not implemented.`);
  const row = await db.prepare(`SELECT id FROM ${table} WHERE id = ?1`).bind(id).first();
  if (!row) throw new AppError(422, "CANONICAL_ENTITY_NOT_FOUND", "The selected canonical entity does not exist.");
}

type CanonicalContext = { importRecordId: string; sourceId: string; sourceUrl: string | null; userId: string; now: string };
type PreparedCanonical = { id: string; statements: D1PreparedStatement[] };

async function prepareCanonical(db: D1Database, type: string, parsed: Record<string, unknown>, context: CanonicalContext): Promise<PreparedCanonical> {
  const id = crypto.randomUUID();
  const slug = `${slugify(String(parsed.name ?? parsed.title ?? type)).slice(0, 71)}-${id.slice(0, 8)}`;
  const statements: D1PreparedStatement[] = [];
  if (type === "manufacturer") {
    statements.push(db.prepare(`INSERT INTO manufacturers
      (id, slug, name, website_url, headquarters_region, status, is_demo, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, 'unverified', 0, ?6, ?6)`)
      .bind(id, slug, parsed.name, parsed.websiteUrl ?? null, parsed.headquartersRegion ?? null, context.now));
  } else if (type === "supplier") {
    statements.push(db.prepare(`INSERT INTO suppliers (id, slug, name, website_url, status, freshness_at, is_demo, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, 'unverified', ?5, 0, ?5, ?5)`).bind(id, slug, parsed.name, parsed.websiteUrl ?? null, context.now));
    const regions = [...new Set(Array.isArray(parsed.regions) ? parsed.regions.map(String) : [])];
    statements.push(...regions.map((region) => db.prepare(`INSERT INTO supplier_regions
      (supplier_id, region_code, ships_from, ships_to) VALUES (?1, ?2, 0, 1)`).bind(id, region)));
  } else if (type === "component") {
    let manufacturerId: string | null = null;
    if (parsed.manufacturerName) manufacturerId = (await db.prepare("SELECT id FROM manufacturers WHERE lower(name) = lower(?1) LIMIT 1").bind(parsed.manufacturerName).first<{ id: string }>())?.id ?? null;
    statements.push(db.prepare(`INSERT INTO components
      (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status, source_url,
       provenance_label, freshness_at, is_demo, version, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'unknown', ?8, 'imported; admin-reviewed', ?9, 0, 1, ?9, ?9)`)
      .bind(id, slug, manufacturerId, parsed.manufacturerPartNumber ?? null, parsed.name, parsed.category, parsed.summary ?? null, context.sourceUrl, context.now));
  } else if (type === "evidence") {
    statements.push(db.prepare(`INSERT INTO evidence
      (id, source_type, source_url, title, retrieved_at, confidence, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 0.5, ?5)`)
      .bind(id, parsed.sourceType, parsed.sourceUrl ?? context.sourceUrl, parsed.title, context.now));
  } else if (type === "offer") {
    const supplierId = await resolveCanonicalReference(db, context.sourceId, "supplier", parsed.supplierCanonicalId, parsed.supplierExternalId);
    const componentId = await resolveCanonicalReference(db, context.sourceId, "component", parsed.componentCanonicalId, parsed.componentExternalId);
    statements.push(db.prepare(`INSERT INTO supplier_offers
      (id, supplier_id, component_id, supplier_sku, product_url, region_code, currency, unit_price_minor,
       minimum_quantity, availability, observed_at, is_demo, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, 'unknown', ?9, 0, ?10, ?10)`)
      .bind(id, supplierId, componentId, parsed.supplierSku ?? null, context.sourceUrl, parsed.regionCode ?? null, parsed.currency, parsed.unitPriceMinor, parsed.observedAt, context.now));
    statements.push(db.prepare(`INSERT INTO offer_price_history
      (id, supplier_offer_id, currency, unit_price_minor, observed_at, source_import_record_id)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
      .bind(crypto.randomUUID(), id, parsed.currency, parsed.unitPriceMinor, parsed.observedAt, context.importRecordId));
  } else if (type === "project") {
    const versionId = crypto.randomUUID();
    const extracted = asRecord(parsed.extracted);
    const summary = optionalString(parsed.summary) ?? optionalString(extracted.summary);
    const description = optionalString(parsed.description) ?? optionalString(extracted.description);
    const version = optionalString(parsed.version) ?? "0.1.0";
    const upstreamUrl = optionalString(parsed.upstreamUrl) ?? optionalString(parsed.repositoryUrl) ?? context.sourceUrl;
    const upstreamIdentity = resolveUpstreamIdentity({ upstreamUrl, repositoryUrl: optionalString(parsed.repositoryUrl) });
    const maintainer = optionalString(parsed.maintainer);
    const revision = optionalString(parsed.revision);
    const publishability = computePublishability({
      name: String(parsed.name), slug, version,
      license: optionalString(parsed.licenseSpdx) ?? optionalString(parsed.license),
      maintainer, authorsCount: Array.isArray(parsed.authors) ? parsed.authors.length : 0,
      upstreamUrl, repositoryUrl: optionalString(parsed.repositoryUrl), revision,
    });
    const rpps = { rpps_version: "1.0.0", name: String(parsed.name), slug, version, summary: summary ?? undefined, description: description ?? undefined, license: optionalString(parsed.licenseSpdx) ?? undefined, repo_url: upstreamUrl ?? undefined, bom: [] };
    statements.push(
      db.prepare(`INSERT INTO projects
        (id, slug, name, summary, description, owner_user_id, visibility, status, current_version_id,
         license_spdx, repository_url, is_demo, version, upstream_url, upstream_identity, maintainer,
         revision, ingested_at, last_checked_at, publishability, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'unlisted', 'review', ?7, ?8, ?9, 0, 1, ?10, ?11, ?12, ?13, ?14, ?14, ?15, ?14, ?14)`)
        .bind(id, slug, parsed.name, summary, description, context.userId, versionId, parsed.licenseSpdx ?? null, upstreamUrl, upstreamUrl, upstreamIdentity, maintainer, revision, context.now, publishability),
      db.prepare(`INSERT INTO project_versions
        (id, project_id, version_label, rpps_schema_version, changelog, rpps_json, status, created_by_user_id, created_at)
        VALUES (?1, ?2, ?3, '1.0.0', 'Created from an administrator-reviewed import', ?4, 'review', ?5, ?6)`)
        .bind(versionId, id, version, JSON.stringify(rpps), context.userId, context.now),
      db.prepare(`INSERT INTO project_maintainers (project_id, user_id, role, created_at)
        VALUES (?1, ?2, 'owner', ?3)`).bind(id, context.userId, context.now),
    );
  } else if (type === "bom") {
    const versionId = crypto.randomUUID();
    const version = optionalString(parsed.version) ?? "0.1.0";
    const currency = optionalString(parsed.currency) ?? "USD";
    statements.push(
      db.prepare(`INSERT INTO boms
        (id, owner_user_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 'private', 0, ?6, ?6)`)
        .bind(id, context.userId, slug, parsed.name, versionId, context.now),
      db.prepare(`INSERT INTO bom_versions
        (id, bom_id, version_label, notes, currency, created_by_user_id, created_at)
        VALUES (?1, ?2, ?3, 'Created from an administrator-reviewed import', ?4, ?5, ?6)`)
        .bind(versionId, id, version, currency, context.userId, context.now),
    );
    const items = Array.isArray(parsed.items) ? parsed.items.map(asRecord) : [];
    const slots = new Set<string>();
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const requestedSlot = optionalString(item.ref) ?? `item-${index + 1}`;
      const slot = slots.has(requestedSlot) ? `${requestedSlot}-${index + 1}` : requestedSlot;
      slots.add(slot);
      const componentId = item.componentCanonicalId || item.componentExternalId
        ? await resolveCanonicalReference(db, context.sourceId, "component", item.componentCanonicalId, item.componentExternalId)
        : null;
      statements.push(db.prepare(`INSERT INTO bom_items
        (id, bom_version_id, component_id, slot_key, description, quantity, unit, notes, sort_order)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
        .bind(crypto.randomUUID(), versionId, componentId, slot, item.name, item.quantity ?? item.qty, item.unit ?? "each", item.notes ?? null, index));
    }
  } else if (type === "integration") {
    statements.push(db.prepare(`INSERT INTO integrations
      (id, slug, name, integration_type, description, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, 'reported', ?6, ?6)`)
      .bind(id, slug, parsed.name, parsed.integrationType, parsed.description ?? null, context.now));
    const entities = Array.isArray(parsed.entities) ? parsed.entities.map(asRecord) : [];
    for (const entity of entities) {
      const entityType = String(entity.recordType);
      const entityId = await resolveCanonicalReference(db, context.sourceId, entityType, entity.canonicalEntityId, entity.externalRecordId);
      statements.push(db.prepare(`INSERT INTO integration_entities
        (integration_id, entity_type, entity_id, role, notes) VALUES (?1, ?2, ?3, ?4, ?5)`)
        .bind(id, entityType, entityId, entity.role, entity.notes ?? null));
    }
  } else {
    throw new AppError(422, "UNSUPPORTED_CANONICAL_TYPE", `Creating canonical ${type} records is not implemented; merge into a reviewed entity instead.`);
  }
  return { id, statements };
}

async function resolveCanonicalReference(db: D1Database, sourceId: string, type: string, canonicalValue: unknown, externalValue: unknown): Promise<string> {
  if (typeof canonicalValue === "string" && canonicalValue) {
    await ensureCanonical(db, type, canonicalValue);
    return canonicalValue;
  }
  if (typeof externalValue !== "string" || !externalValue) throw new AppError(422, "CANONICAL_DEPENDENCY_REQUIRED", `A canonical or external ${type} reference is required.`);
  const row = await db.prepare(`SELECT canonical_entity_id AS id FROM import_records
    WHERE source_id = ?1 AND record_type = ?2 AND external_record_id = ?3
      AND status = 'approved' AND canonical_entity_id IS NOT NULL
    ORDER BY updated_at DESC LIMIT 1`).bind(sourceId, type, externalValue).first<{ id: string }>();
  if (!row) throw new AppError(422, "CANONICAL_DEPENDENCY_NOT_APPROVED", `The referenced ${type} import must be approved first.`);
  return row.id;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
