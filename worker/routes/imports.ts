import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { authenticatedUserId, requirePlatformRole } from "../middleware/authorization";
import { parseJson } from "../validation";
import { matchStatements, normalizedName, recordTypes, sha256, stagingStatements, validateParsedData } from "../services/ingestion";
import { recordAuditEvent } from "../services/audit";

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
const traceIdSchema = z.string().regex(/^[0-9a-f]{32}$/u);
const traceparentSchema = z.string().regex(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u).max(55);
const claimClassificationSchema = z.enum(["official", "reported", "measured", "calculated", "estimated", "ai_inferred"]);
const v2ClaimSchema = z.object({
  claimKey: z.string().trim().min(1).max(300),
  originalValue: z.unknown(),
  normalizedValue: z.unknown().optional(),
  unit: z.string().trim().max(80).nullable().optional(),
  confidence: z.number().min(0).max(1),
  evidenceLocator: z.string().trim().min(1).max(2_000),
  classification: claimClassificationSchema,
  language: z.string().trim().max(35).nullable().optional(),
  countryOrRegion: z.string().trim().max(80).nullable().optional(),
  applicableRevision: z.string().trim().max(200).nullable().optional(),
  extractionMethod: z.string().trim().max(200).optional(),
}).strict();
const v2RecordSchema = recordEnvelope.safeExtend({
  sourceUrl: httpUrl,
  provenance: z.object({
    originalPublishedAt: z.string().datetime().nullable().optional(),
    lastSuccessfulCheckAt: z.string().datetime(),
    applicableRevision: z.string().trim().min(1).max(200),
    extractionMethod: z.string().trim().min(1).max(200),
    scraperVersion: z.string().trim().min(1).max(100),
    copyrightReuseStatus: z.string().trim().min(1).max(200),
  }).strict(),
  snapshot: z.object({
    sourceClass: claimClassificationSchema,
    declaredMediaType: z.string().trim().min(1).max(200),
    detectedMediaType: z.string().trim().min(1).max(200),
    byteSize: z.number().int().nonnegative().max(2_147_483_647),
    contentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    retainedObjectKey: z.string().trim().min(1).max(1_024).optional(),
    immutableExternalUrl: httpUrl.optional(),
    retrievalMetadata: z.record(z.string(), z.unknown()),
  }).strict().refine((snapshot) => Boolean(snapshot.retainedObjectKey || snapshot.immutableExternalUrl), {
    message: "A retained object key or immutable external URL is required.",
  }),
  claims: z.array(v2ClaimSchema).max(256),
  lifecycleEvents: z.array(z.object({
    eventType: z.string().trim().min(1).max(100),
    occurredAt: z.string().datetime(),
    reason: z.string().trim().max(2_000).nullable().optional(),
    details: z.record(z.string(), z.unknown()).default({}),
  }).strict()).max(20).default([]),
}).strict();
export const batchV2Schema = z.object({
  schemaVersion: z.literal("2.0"),
  batchId: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
  retrievalTimestamp: z.string().datetime(),
  traceId: traceIdSchema,
  traceparent: traceparentSchema.optional(),
  source: sourceSchema.extend({
    externalSourceId: z.string().trim().min(1).max(300),
    language: z.string().trim().max(35).nullable().optional(),
    countryOrRegion: z.string().trim().max(80).nullable().optional(),
    policy: z.object({
      robotsStatus: z.enum(["unknown", "allowed", "disallowed", "not_applicable"]),
      termsStatus: z.enum(["unknown", "approved", "denied", "requires_review", "not_applicable"]),
      reuseStatus: z.enum(["unknown", "metadata_only", "metadata_and_facts", "retention_approved", "denied"]),
    }).strict(),
  }).strict(),
  records: z.array(v2RecordSchema).min(1).max(100),
}).strict();
type ImportBatch = z.output<typeof batchSchema> | z.output<typeof batchV2Schema>;
const reviewSchema = z.object({ decision: z.enum(["create", "merge"]).default("create"), canonicalEntityId: z.string().max(200).nullable().optional() }).strict();
const rejectSchema = z.object({ reason: z.string().trim().min(2).max(2_000) }).strict();

export const importRoutes = new Hono<AppBindings>();

importRoutes.post("/imports/batches", async (c) => {
  await requireIngestionCredential(c.req.raw.headers, c.env.INGESTION_SECRET);
  const idempotencyHeader = c.req.header("idempotency-key");
  const { body } = await parseImportBatch(c.req.raw);
  if (idempotencyHeader !== body.idempotencyKey) throw new AppError(422, "IDEMPOTENCY_KEY_MISMATCH", "Idempotency-Key must match the payload.");
  const isV2 = body.schemaVersion === "2.0";
  const traceId = isV2 ? body.traceId : null;
  const sourceSlug = slugify(body.source.name);
  const now = new Date().toISOString();
  let source = await c.env.DB.prepare("SELECT id FROM import_sources WHERE slug = ?1").bind(sourceSlug).first<{ id: string }>();
  if (!source) {
    const sourceId = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO import_sources
      (id, slug, name, source_type, base_url, priority, trust_weight, status, service_credential_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', 'ingestion-secret', ?8, ?8)`)
      .bind(sourceId, sourceSlug, body.source.name, body.source.type, body.source.baseUrl ?? null, body.source.priority, body.source.trustWeight, now)
      .run()
      .catch(async (error: unknown) => {
        const racedSource = await c.env.DB.prepare("SELECT id FROM import_sources WHERE slug = ?1").bind(sourceSlug).first<{ id: string }>();
        if (!racedSource) throw error;
      });
    source = await c.env.DB.prepare("SELECT id FROM import_sources WHERE slug = ?1").bind(sourceSlug).first<{ id: string }>();
    if (!source) throw new AppError(500, "IMPORT_SOURCE_CLAIM_FAILED", "The import source could not be claimed.");
  }
  const payloadHash = await sha256(canonicalJson(body));
  const prior = await findPriorImportJob(c.env.DB, source.id, body.idempotencyKey, body.batchId, payloadHash);
  if (prior) {
    return c.json({ duplicate: true, traceId: prior.trace_id ?? traceId, job: summarizeJob(prior), records: [] });
  }

  const jobId = crypto.randomUUID();
  try {
    await c.env.DB.prepare(`INSERT INTO import_jobs
      (id, source_id, batch_id, idempotency_key, schema_version, status, retrieval_timestamp, payload_hash,
       attempt_count, service_actor_id, trace_id, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, 'validating', ?6, ?7, 1, 'external-ingestion', ?8, ?9, ?9)`)
      .bind(jobId, source.id, body.batchId, body.idempotencyKey, body.schemaVersion, body.retrievalTimestamp, payloadHash, traceId, now).run();
  } catch (error) {
    const racedJob = await findPriorImportJob(c.env.DB, source.id, body.idempotencyKey, body.batchId, payloadHash);
    if (!racedJob) throw error;
    return c.json({ duplicate: true, traceId: racedJob.trace_id ?? traceId, job: summarizeJob(racedJob), records: [] });
  }
  const sourcePolicyRevisionId = isV2
    ? await ensureUntrustedSourcePolicy(c.env.DB, source.id, body.source.policy, now)
    : null;

  const outcomes: Array<Record<string, unknown>> = [];
  let accepted = 0; let rejected = 0; let duplicates = 0;
  for (let index = 0; index < body.records.length; index += 1) {
    const envelope = (isV2 ? v2RecordSchema : recordEnvelope).safeParse(body.records[index]);
    if (!envelope.success) {
      rejected += 1;
      const issue = envelope.error.issues[0];
      await addImportError(c.env.DB, jobId, null, "INVALID_RECORD_ENVELOPE", `records.${index}.${issue?.path.join(".") ?? ""}`, issue?.message ?? "Invalid record.", now, traceId);
      outcomes.push({ index, status: "rejected", errors: envelope.error.issues.map((item) => ({ code: "INVALID_RECORD_ENVELOPE", path: item.path.join("."), message: item.message })) });
      continue;
    }
    const record = envelope.data;
    const parsed = validateParsedData(record.recordType, record.parsedData);
    if (!parsed.success && record.action !== "withdraw") {
      rejected += 1;
      for (const issue of parsed.error.issues.slice(0, 20)) await addImportError(c.env.DB, jobId, null, "INVALID_PARSED_DATA", `records.${index}.parsedData.${issue.path.join(".")}`, issue.message, now, traceId);
      outcomes.push({ index, externalRecordId: record.externalRecordId, status: "rejected", errors: parsed.error.issues.map((item) => ({ code: "INVALID_PARSED_DATA", path: item.path.join("."), message: item.message })) });
      continue;
    }
    try {
      if (parsed.success && record.action !== "withdraw") {
        await validateCanonicalReferences(c.env.DB, record.recordType, parsed.data);
      }
      const recordId = crypto.randomUUID();
      const rawJson = JSON.stringify(record.rawPayload ?? null);
      const parsedJson = canonicalJson(parsed.success ? parsed.data : record.parsedData ?? {});
      const fingerprint = await sha256(`${record.recordType}\n${normalizedName(record.externalRecordId)}\n${parsedJson}`);
      const duplicate = await c.env.DB.prepare(`SELECT id FROM import_records WHERE source_id = ?1 AND record_type = ?2
        AND normalized_fingerprint = ?3 AND status NOT IN ('withdrawn', 'rejected', 'failed') LIMIT 1`)
        .bind(source.id, record.recordType, fingerprint).first<{ id: string }>();
      const previousWithdrawal = record.action === "withdraw"
        ? await c.env.DB.prepare(`SELECT id FROM import_records WHERE source_id = ?1 AND record_type = ?2 AND external_record_id = ?3
            AND status NOT IN ('withdrawn', 'rejected') ORDER BY created_at DESC LIMIT 1`)
          .bind(source.id, record.recordType, record.withdrawalOfExternalRecordId ?? record.externalRecordId).first<{ id: string }>()
        : null;
      const requiresTypedReview = ["evidence", "teardown", "commercial_robot", "marketplace_reference"].includes(record.recordType);
      const status = record.action === "withdraw" ? "withdrawn" : duplicate ? "duplicate" : requiresTypedReview ? "review" : "staged";
      const statements: D1PreparedStatement[] = [c.env.DB.prepare(`INSERT INTO import_records
        (id, import_job_id, source_id, external_record_id, record_type, source_url, confidence, raw_payload_json,
         parsed_data_json, normalized_fingerprint, status, withdrawal_of_record_id, trace_id, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)`)
        .bind(recordId, jobId, source.id, record.externalRecordId, record.recordType, record.sourceUrl ?? null, record.confidence,
          rawJson, parsedJson, fingerprint, status, previousWithdrawal?.id ?? null, traceId, now)];
      if (!duplicate && record.action === "upsert" && parsed.success) {
        statements.push(...stagingStatements(c.env.DB, record.recordType, recordId, parsed.data, now));
        statements.push(...await matchStatements(c.env.DB, record.recordType, recordId, parsed.data, now));
      }
      if (isV2 && !duplicate && record.action === "upsert") {
        statements.push(...v2ProvenanceStatements(c.env.DB, {
          body: body as z.output<typeof batchV2Schema>,
          record: record as z.output<typeof v2RecordSchema>,
          jobId,
          recordId,
          sourceId: source.id,
          sourcePolicyRevisionId: sourcePolicyRevisionId!,
          traceId: traceId!,
          now,
        }));
      }
      statements.push(c.env.DB.prepare(`INSERT INTO import_audit_events
        (id, import_job_id, import_record_id, actor_service_id, event_type, after_json, trace_id, created_at)
        VALUES (?1, ?2, ?3, 'external-ingestion', ?4, ?5, ?6, ?7)`)
        .bind(crypto.randomUUID(), jobId, recordId, record.action === "withdraw" ? "record.withdrawn" : `record.${status}`, JSON.stringify({ fingerprint }), traceId, now));
      await c.env.DB.batch(statements);
      if (duplicate) duplicates += 1; else accepted += 1;
      outcomes.push({ index, externalRecordId: record.externalRecordId, recordId, status, duplicateOf: duplicate?.id ?? null });
    } catch (error) {
      rejected += 1;
      const code = error instanceof AppError ? error.code : "RECORD_PROCESSING_FAILED";
      const message = error instanceof Error ? error.message.slice(0, 500) : "Record processing failed.";
      await addImportError(c.env.DB, jobId, null, code, `records.${index}`, message, now, traceId);
      outcomes.push({ index, externalRecordId: record.externalRecordId, status: "failed", errors: [{ code, path: `records.${index}`, message }] });
    }
  }
  const finalStatus = rejected === 0 ? "staged" : accepted + duplicates > 0 ? "partial" : "failed";
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE import_jobs SET status = ?1, accepted_count = ?2, rejected_count = ?3, duplicate_count = ?4,
      updated_at = ?5, completed_at = ?5 WHERE id = ?6`).bind(finalStatus, accepted, rejected, duplicates, new Date().toISOString(), jobId),
    c.env.DB.prepare(`INSERT INTO import_audit_events
      (id, import_job_id, actor_service_id, event_type, after_json, trace_id, created_at)
      VALUES (?1, ?2, 'external-ingestion', 'batch.completed', ?3, ?4, ?5)`)
      .bind(crypto.randomUUID(), jobId, JSON.stringify({ status: finalStatus, accepted, rejected, duplicates }), traceId, new Date().toISOString()),
  ]);
  return c.json({ duplicate: false, traceId, job: { id: jobId, status: finalStatus, acceptedCount: accepted, rejectedCount: rejected, duplicateCount: duplicates }, records: outcomes }, finalStatus === "failed" ? 422 : 202);
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

async function parseImportBatch(request: Request): Promise<{ body: ImportBatch }> {
  const text = await request.text();
  const bodyBytes = new TextEncoder().encode(text).byteLength;
  if (bodyBytes > 1_048_576) throw new AppError(413, "PAYLOAD_TOO_LARGE", "Import batches are limited to 1 MiB.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AppError(400, "INVALID_JSON", "The request body must be valid JSON.");
  }
  const version = value && typeof value === "object" && !Array.isArray(value)
    ? (value as { schemaVersion?: unknown }).schemaVersion
    : undefined;
  if (version !== "1.0" && version !== "2.0") {
    throw new AppError(422, "UNSUPPORTED_SCHEMA_VERSION", "schemaVersion must be 1.0 or 2.0.");
  }
  assertImportJsonLimits(value, bodyBytes, version);
  const rawRecords = value && typeof value === "object" && !Array.isArray(value)
    ? (value as { records?: unknown }).records
    : undefined;
  if (Array.isArray(rawRecords)) {
    const unsupported = rawRecords.find((record) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) return false;
      const type = (record as { recordType?: unknown }).recordType;
      return typeof type === "string" && !recordTypes.includes(type as (typeof recordTypes)[number]);
    });
    if (unsupported) throw new AppError(422, "UNSUPPORTED_RECORD_TYPE", "The batch contains an unsupported recordType.");
  }
  if (version === "2.0") {
    const candidate = value as { traceId?: unknown; traceparent?: unknown };
    if (!traceIdSchema.safeParse(candidate.traceId).success) {
      throw new AppError(422, "INVALID_TRACE_ID", "traceId must be 32 lowercase hexadecimal characters.");
    }
    if (candidate.traceparent !== undefined && !traceparentSchema.safeParse(candidate.traceparent).success) {
      throw new AppError(422, "INVALID_TRACEPARENT", "traceparent must be a W3C version-00 trace parent.");
    }
  }
  const parsed = (version === "2.0" ? batchV2Schema : batchSchema).safeParse(value);
  if (!parsed.success) {
    throw new AppError(422, "VALIDATION_ERROR", "The request body is invalid.", parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    })));
  }
  return { body: parsed.data as ImportBatch };
}

export function assertImportJsonLimits(value: unknown, bodyBytes: number, _version: "1.0" | "2.0"): void {
  if (bodyBytes > 1_048_576) throw new AppError(413, "PAYLOAD_TOO_LARGE", "Import batches are limited to 1 MiB.");
  const visit = (item: unknown, depth: number, key: string | null): void => {
    if (key === "rawPayload") {
      const rawBytes = new TextEncoder().encode(JSON.stringify(item)).byteLength;
      if (rawBytes > 65_536) throw new AppError(422, "RAW_PAYLOAD_TOO_LARGE", "Each retained rawPayload is limited to 64 KiB.");
    }
    if (key && ["parsedData", "retrievalMetadata", "originalValue", "normalizedValue", "details"].includes(key)) {
      const boundedBytes = new TextEncoder().encode(JSON.stringify(item)).byteLength;
      if (boundedBytes > 131_072) {
        throw new AppError(422, "PAYLOAD_TOO_LARGE", `${key} exceeds the 128 KiB D1 metadata limit.`);
      }
    }
    if (typeof item === "string" && new TextEncoder().encode(item).byteLength > 65_536) {
      throw new AppError(422, "STRING_TOO_LARGE", "Individual import strings are limited to 64 KiB.");
    }
    if (!item || typeof item !== "object") return;
    if (depth > 10) throw new AppError(422, "OBJECT_TOO_DEEP", "Import JSON is limited to object depth 10.");
    if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1, null);
      return;
    }
    const entries = Object.entries(item as Record<string, unknown>);
    if (entries.length > 256) throw new AppError(422, "TOO_MANY_PROPERTIES", "Each import object is limited to 256 properties.");
    for (const [childKey, child] of entries) visit(child, depth + 1, childKey);
  };
  visit(value, 1, null);
}

async function ensureUntrustedSourcePolicy(
  db: D1Database,
  sourceId: string,
  policy: z.output<typeof batchV2Schema>["source"]["policy"],
  now: string,
): Promise<string> {
  const previous = await db.prepare(`
    SELECT id FROM source_policy_revisions WHERE source_id = ? ORDER BY effective_at DESC, created_at DESC LIMIT 1
  `).bind(sourceId).first<{ id: string }>();
  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO source_policy_revisions
      (id, source_id, robots_status, robots_checked_at, terms_status, reuse_status, decision, decision_notes,
       approval_authority_reference, effective_at, supersedes_policy_revision_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'unreviewed', 'Untrusted source-submitted policy metadata; not approval',
            'external-ingestion-untrusted', ?, ?, ?)
  `).bind(
    id,
    sourceId,
    policy.robotsStatus,
    now,
    policy.termsStatus,
    policy.reuseStatus,
    now,
    previous?.id ?? null,
    now,
  ).run();
  return id;
}

type V2ProvenanceContext = {
  body: z.output<typeof batchV2Schema>;
  record: z.output<typeof v2RecordSchema>;
  jobId: string;
  recordId: string;
  sourceId: string;
  sourcePolicyRevisionId: string;
  traceId: string;
  now: string;
};

function v2ProvenanceStatements(db: D1Database, context: V2ProvenanceContext): D1PreparedStatement[] {
  const { body, record, jobId, recordId, sourceId, sourcePolicyRevisionId, traceId, now } = context;
  const snapshotId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db.prepare(`
      INSERT INTO source_snapshots
        (id, source_id, import_record_id, source_policy_revision_id, source_class, source_url, original_published_at,
         retrieved_at, language, region_code, applicable_revision, declared_media_type, detected_media_type, byte_size,
         content_sha256, retained_object_key, immutable_external_url, retrieval_metadata_json, copyright_reuse_status,
         retention_state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      snapshotId,
      sourceId,
      recordId,
      sourcePolicyRevisionId,
      record.snapshot.sourceClass,
      record.sourceUrl,
      record.provenance.originalPublishedAt ?? null,
      body.retrievalTimestamp,
      body.source.language ?? null,
      body.source.countryOrRegion ?? null,
      record.provenance.applicableRevision,
      record.snapshot.declaredMediaType,
      record.snapshot.detectedMediaType,
      record.snapshot.byteSize,
      record.snapshot.contentSha256,
      record.snapshot.retainedObjectKey ?? null,
      record.snapshot.immutableExternalUrl ?? null,
      JSON.stringify({
        ...record.snapshot.retrievalMetadata,
        externalSourceId: body.source.externalSourceId,
        lastSuccessfulCheckAt: record.provenance.lastSuccessfulCheckAt,
        extractionMethod: record.provenance.extractionMethod,
        scraperVersion: record.provenance.scraperVersion,
        traceparent: body.traceparent ?? null,
      }),
      record.provenance.copyrightReuseStatus,
      record.snapshot.retainedObjectKey ? "retained" : "external_reference",
      now,
    ),
  ];
  statements.push(...record.claims.map((claim) => db.prepare(`
    INSERT INTO field_claims
      (id, source_id, import_record_id, snapshot_id, claim_key, original_value_json, normalized_value_json, unit,
       confidence, evidence_locator, classification, language, region_code, applicable_revision, extraction_method,
       extractor_version, schema_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2.0', ?)
  `).bind(
    crypto.randomUUID(),
    sourceId,
    recordId,
    snapshotId,
    claim.claimKey,
    JSON.stringify(claim.originalValue),
    claim.normalizedValue === undefined ? null : JSON.stringify(claim.normalizedValue),
    claim.unit ?? null,
    claim.confidence,
    claim.evidenceLocator,
    claim.classification,
    claim.language ?? body.source.language ?? null,
    claim.countryOrRegion ?? body.source.countryOrRegion ?? null,
    claim.applicableRevision ?? record.provenance.applicableRevision,
    claim.extractionMethod ?? record.provenance.extractionMethod,
    record.provenance.scraperVersion,
    now,
  )));
  statements.push(...record.lifecycleEvents.map((event) => db.prepare(`
    INSERT INTO import_audit_events
      (id, import_job_id, import_record_id, actor_service_id, event_type, after_json, trace_id, created_at)
    VALUES (?, ?, ?, 'external-ingestion', ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    jobId,
    recordId,
    `record.lifecycle.${event.eventType}`,
    JSON.stringify({ occurredAt: event.occurredAt, reason: event.reason ?? null, details: event.details }),
    traceId,
    now,
  )));
  return statements;
}

const canonicalTables = {
  manufacturer: "manufacturers",
  supplier: "suppliers",
  component: "components",
  offer: "supplier_offers",
  project: "projects",
  bom: "boms",
  integration: "integrations",
  evidence: "evidence",
} as const;

async function validateCanonicalId(db: D1Database, expectedType: keyof typeof canonicalTables, id: string): Promise<void> {
  const expected = await db.prepare(`SELECT id FROM ${canonicalTables[expectedType]} WHERE id = ?`).bind(id).first();
  if (expected) return;
  for (const [type, table] of Object.entries(canonicalTables)) {
    if (type === expectedType) continue;
    const mismatched = await db.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id).first();
    if (mismatched) {
      throw new AppError(422, "CANONICAL_REFERENCE_TYPE_MISMATCH", `Canonical reference ${id} is not a ${expectedType}.`);
    }
  }
  throw new AppError(422, "CANONICAL_REFERENCE_NOT_FOUND", `Canonical ${expectedType} reference ${id} does not exist.`);
}

async function validateCanonicalReferences(db: D1Database, recordType: string, parsed: Record<string, unknown>): Promise<void> {
  const references: Array<[keyof typeof canonicalTables, unknown]> = [];
  if (recordType === "offer") {
    references.push(["supplier", parsed.supplierCanonicalId], ["component", parsed.componentCanonicalId]);
  } else if (recordType === "bom" && Array.isArray(parsed.items)) {
    for (const item of parsed.items) references.push(["component", asRecord(item).componentCanonicalId]);
  } else if (recordType === "integration" && Array.isArray(parsed.entities)) {
    for (const entityValue of parsed.entities) {
      const entity = asRecord(entityValue);
      references.push([String(entity.recordType) as keyof typeof canonicalTables, entity.canonicalEntityId]);
    }
  }
  for (const [type, value] of references) {
    if (typeof value === "string" && value) await validateCanonicalId(db, type, value);
  }
}

async function requireIngestionCredential(headers: Headers, configured: string): Promise<void> {
  const authorization = headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : headers.get("x-ingestion-secret") ?? "";
  if (!configured || configured.startsWith("replace-with") || !provided || !constantTime(await sha256(provided), await sha256(configured))) throw new AppError(401, "INGESTION_AUTHENTICATION_FAILED", "A valid ingestion service credential is required.");
}

async function addImportError(db: D1Database, jobId: string, recordId: string | null, code: string, path: string, message: string, now: string, traceId: string | null = null) {
  await db.prepare(`INSERT INTO import_errors (id, import_job_id, import_record_id, error_code, path, message, retryable, trace_id, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8)`).bind(crypto.randomUUID(), jobId, recordId, code, path, message, traceId, now).run();
}

async function findPriorImportJob(
  db: D1Database,
  sourceId: string,
  idempotencyKey: string,
  batchId: string,
  payloadHash: string,
): Promise<Record<string, unknown> | null> {
  const prior = await db.prepare(`
    SELECT * FROM import_jobs
    WHERE source_id = ?1 AND (idempotency_key = ?2 OR batch_id = ?3)
    ORDER BY CASE WHEN idempotency_key = ?2 THEN 0 ELSE 1 END, created_at
    LIMIT 2
  `).bind(sourceId, idempotencyKey, batchId).all<Record<string, unknown>>();
  if (prior.results.length === 0) return null;
  if (prior.results.some((job) => String(job.payload_hash) !== payloadHash)) {
    throw new AppError(409, "IDEMPOTENCY_CONFLICT", "The batch or idempotency key was already used with a different payload.");
  }
  return prior.results[0] ?? null;
}

function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (!item || typeof item !== "object") return item;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(item as Record<string, unknown>).sort()) {
      const child = (item as Record<string, unknown>)[key];
      if (child !== undefined) normalized[key] = normalize(child);
    }
    return normalized;
  };
  return JSON.stringify(normalize(value));
}

function summarizeJob(row: Record<string, unknown>) { return { id: row.id, batchId: row.batch_id, status: row.status, schemaVersion: row.schema_version, acceptedCount: row.accepted_count, rejectedCount: row.rejected_count, duplicateCount: row.duplicate_count, createdAt: row.created_at, completedAt: row.completed_at }; }
function slugify(value: string): string { return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 80) || "source"; }
function constantTime(left: string, right: string): boolean { if (left.length !== right.length) return false; let value = 0; for (let index = 0; index < left.length; index += 1) value |= left.charCodeAt(index) ^ right.charCodeAt(index); return value === 0; }
function stagingTableFor(type: string): string | null { return ({ manufacturer: "staging_manufacturers", supplier: "staging_suppliers", component: "staging_components", offer: "staging_offers", project: "staging_projects", bom: "staging_boms", integration: "staging_integrations" } as Record<string, string>)[type] ?? null; }

async function ensureCanonical(db: D1Database, type: string, id: string): Promise<void> {
  const table = ({ manufacturer: "manufacturers", supplier: "suppliers", component: "components", offer: "supplier_offers", project: "projects", bom: "boms", integration: "integrations", evidence: "evidence" } as Record<string, string>)[type];
  if (!table) throw new AppError(422, "UNSUPPORTED_CANONICAL_TYPE", `Manual approval for ${type} is not implemented.`);
  await validateCanonicalId(db, type as keyof typeof canonicalTables, id);
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
    const rpps = { rpps_version: "1.0.0", name: String(parsed.name), slug, version, summary: summary ?? undefined, description: description ?? undefined, license: optionalString(parsed.licenseSpdx) ?? undefined, repo_url: optionalString(parsed.repositoryUrl) ?? undefined, bom: [] };
    statements.push(
      db.prepare(`INSERT INTO projects
        (id, slug, name, summary, description, owner_user_id, visibility, status, current_version_id,
         license_spdx, repository_url, is_demo, version, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'unlisted', 'review', ?7, ?8, ?9, 0, 1, ?10, ?10)`)
        .bind(id, slug, parsed.name, summary, description, context.userId, versionId, parsed.licenseSpdx ?? null, parsed.repositoryUrl ?? context.sourceUrl, context.now),
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
