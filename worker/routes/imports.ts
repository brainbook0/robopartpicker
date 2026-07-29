import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { authenticatedUserId, hasPlatformRole, requirePlatformRole } from "../middleware/authorization";
import { parseJson } from "../validation";
import { matchStatements, normalizedName, recordTypes, sha256, stagingStatements, validateParsedData } from "../services/ingestion";
import { recordAuditEvent } from "../services/audit";
import {
  PermanentScrapeIngestionError,
  queueImportForReview,
  resumeScrapeIngestionJob,
} from "../services/scrape-ingestion-jobs";

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
    immutableExternalUrl: httpUrl,
    retrievalMetadata: z.record(z.string(), z.unknown()),
  }).strict(),
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
const reviewSchema = z.object({
  decision: z.enum(["create", "merge"]).default("create"),
  canonicalEntityId: z.string().max(200).nullable().optional(),
  expectedDiffHash: z.string().regex(/^[0-9a-f]{64}$/u).optional(),
}).strict();
const rejectSchema = z.object({ reason: z.string().trim().min(2).max(2_000) }).strict();
const deferSchema = z.object({
  reason: z.string().trim().min(2).max(2_000),
  reviewAfter: z.string().datetime().nullable().optional(),
}).strict();
const conflictSchema = z.object({
  claimIds: z.array(z.string().trim().min(1).max(200)).min(2).max(20),
  conflictType: z.string().trim().min(2).max(100).regex(/^[a-z0-9_]+$/u),
}).strict();

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
  const completedAt = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE import_jobs SET status = ?1, accepted_count = ?2, rejected_count = ?3, duplicate_count = ?4,
      updated_at = ?5, completed_at = ?5 WHERE id = ?6`).bind(finalStatus, accepted, rejected, duplicates, completedAt, jobId),
    c.env.DB.prepare(`INSERT INTO import_audit_events
      (id, import_job_id, actor_service_id, event_type, after_json, trace_id, created_at)
      VALUES (?1, ?2, 'external-ingestion', 'batch.completed', ?3, ?4, ?5)`)
      .bind(crypto.randomUUID(), jobId, JSON.stringify({ status: finalStatus, accepted, rejected, duplicates }), traceId, completedAt),
  ]);
  let collectionJob: Record<string, unknown> | null = null;
  if (isV2 && finalStatus !== "failed" && c.env.SCRAPE_INGEST_QUEUE) {
    try {
      const queued = await queueImportForReview({
        db: c.env.DB,
        queue: c.env.SCRAPE_INGEST_QUEUE,
        importJobId: jobId,
        now: completedAt,
        sourcePolicyRevisionId,
        ...(body.traceparent ? { traceparent: body.traceparent } : {}),
      });
      collectionJob = { id: queued.collectionJobId, status: queued.enqueued ? "submitting" : "already_enqueued" };
    } catch {
      const failedCollection = await c.env.DB.prepare(`
        SELECT id, status FROM collection_jobs WHERE import_job_id = ?1
        ORDER BY created_at DESC LIMIT 1
      `).bind(jobId).first<{ id: string; status: string }>();
      collectionJob = {
        id: failedCollection?.id ?? null,
        status: "failed",
        error: "Queue submission failed; recovery is available from the durable collection job.",
      };
    }
  }
  return c.json({
    duplicate: false,
    traceId,
    job: {
      id: jobId,
      status: finalStatus,
      acceptedCount: accepted,
      rejectedCount: rejected,
      duplicateCount: duplicates,
    },
    collectionJob,
    records: outcomes,
  }, finalStatus === "failed" ? 422 : 202);
});

importRoutes.get("/imports", loadAuthSession, requireAuth, async (c) => {
  const userId = authenticatedUserId(c);
  const jobs = await c.env.DB.prepare(`SELECT * FROM import_jobs WHERE requested_by_user_id = ?1
    ORDER BY created_at DESC LIMIT 100`).bind(userId).all<Record<string, unknown>>();
  return c.json({ items: jobs.results.map(summarizeJob) });
});

importRoutes.get("/admin/import-records", loadAuthSession, requireAuth, requirePlatformRole("moderator", "administrator"), async (c) => {
  const status = c.req.query("status") ?? "staged";
  if (!["pending", "staged", "review", "approved", "rejected", "withdrawn", "failed"].includes(status)) {
    throw new AppError(422, "INVALID_REVIEW_STATUS", "The requested review status is invalid.");
  }
  const predicate = status === "pending" ? "ir.status IN ('staged', 'review')" : "ir.status = ?1";
  const statement = c.env.DB.prepare(`
    SELECT ir.*, source.name AS source_name, job.schema_version
    FROM import_records AS ir
    JOIN import_sources AS source ON source.id = ir.source_id
    JOIN import_jobs AS job ON job.id = ir.import_job_id
    WHERE ${predicate}
    ORDER BY ir.created_at LIMIT 200
  `);
  const result = status === "pending"
    ? await statement.all<Record<string, unknown>>()
    : await statement.bind(status).all<Record<string, unknown>>();
  const canMutate = await hasPlatformRole(c.env.DB, authenticatedUserId(c), ["administrator"]);
  return c.json({
    permissions: { canRead: true as const, canMutate },
    items: result.results.map((row) => ({
      ...row,
      raw_payload_json: undefined,
      parsedData: JSON.parse(String(row.parsed_data_json)),
      parsed_data_json: undefined,
    })),
  });
});

importRoutes.get("/admin/import-records/:id", loadAuthSession, requireAuth, requirePlatformRole("moderator", "administrator"), async (c) => {
  const canMutate = await hasPlatformRole(c.env.DB, authenticatedUserId(c), ["administrator"]);
  const record = await loadReviewRecord(c.env.DB, c.req.param("id"));
  const [claims, snapshots, candidates, conflicts, audit, collectionLifecycle] = await Promise.all([
    c.env.DB.prepare(`
      SELECT id, claim_key, original_value_json, normalized_value_json, unit, confidence, evidence_locator,
             classification, language, region_code, applicable_revision, extraction_method, extractor_version, created_at
      FROM field_claims WHERE import_record_id = ?1
      ORDER BY claim_key, classification, id
    `).bind(record.id).all<Record<string, unknown>>(),
    c.env.DB.prepare(`
      SELECT ss.id, ss.source_policy_revision_id, ss.source_class, ss.source_url, ss.original_published_at,
             ss.retrieved_at, ss.language, ss.region_code, ss.applicable_revision, ss.declared_media_type,
             ss.detected_media_type, ss.byte_size, ss.content_sha256, ss.file_id, ss.immutable_external_url,
             ss.copyright_reuse_status, ss.retention_state, ss.withdrawn_at,
             spr.robots_status, spr.terms_status, spr.reuse_status, spr.decision AS policy_decision
      FROM source_snapshots AS ss
      JOIN source_policy_revisions AS spr ON spr.id = ss.source_policy_revision_id
      WHERE ss.import_record_id = ?1 ORDER BY ss.retrieved_at, ss.id
    `).bind(record.id).all<Record<string, unknown>>(),
    c.env.DB.prepare(`
      SELECT id, canonical_entity_type, canonical_entity_id, match_method, score, explanation_json, decision, created_at
      FROM canonical_match_candidates WHERE import_record_id = ?1
      ORDER BY score DESC, canonical_entity_type, canonical_entity_id
    `).bind(record.id).all<Record<string, unknown>>(),
    c.env.DB.prepare(`
      SELECT cs.id, cs.field_key, cs.conflict_type, cs.status, cs.resolution_notes, cs.created_at,
             cm.field_claim_id, cm.member_role
      FROM claim_conflict_sets AS cs
      LEFT JOIN claim_conflict_members AS cm ON cm.conflict_set_id = cs.id
      WHERE cs.import_record_id = ?1 ORDER BY cs.created_at, cs.id, cm.field_claim_id
    `).bind(record.id).all<Record<string, unknown>>(),
    c.env.DB.prepare(`
      SELECT id, event_type, actor_user_id, actor_service_id, before_json, after_json, trace_id, created_at
      FROM import_audit_events WHERE import_record_id = ?1
      ORDER BY created_at, id
    `).bind(record.id).all<Record<string, unknown>>(),
    c.env.DB.prepare(`
      SELECT id, event_type, from_status, to_status, reason, details_json, trace_id, occurred_at
      FROM collection_lifecycle_events WHERE import_job_id = ?1
      ORDER BY occurred_at, id
    `).bind(record.import_job_id).all<Record<string, unknown>>(),
  ]);
  const decision = c.req.query("decision") === "merge" ? "merge" : "create";
  const canonicalEntityId = c.req.query("canonicalEntityId") ?? null;
  if (decision === "merge" && !canonicalEntityId) {
    throw new AppError(422, "CANONICAL_ENTITY_REQUIRED", "A canonical entity is required to preview a merge.");
  }
  if (decision === "merge") await ensureCanonical(c.env.DB, String(record.record_type), canonicalEntityId!);
  const mutation = await proposedReviewMutation(record, decision, canonicalEntityId);
  const rawPreview = boundedUtf8Preview(String(record.raw_payload_json), 16_384);
  const latestDecision = [...audit.results].reverse().find((event) =>
    ["record.approved", "record.rejected", "record.deferred"].includes(String(event.event_type)));
  const groupedConflicts = groupReviewConflicts(conflicts.results);
  return c.json({
    permissions: { canRead: true as const, canMutate },
    record: {
      id: record.id,
      importJobId: record.import_job_id,
      sourceId: record.source_id,
      sourceName: record.source_name,
      externalRecordId: record.external_record_id,
      recordType: record.record_type,
      sourceUrl: record.source_url,
      confidence: record.confidence,
      status: record.status,
      reviewState: latestDecision ? String(latestDecision.event_type).replace("record.", "") : "pending",
      traceId: record.trace_id,
      schemaVersion: record.schema_version,
      parsedData: JSON.parse(String(record.parsed_data_json)),
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    },
    claims: claims.results.map((claim) => ({
      id: claim.id,
      claimKey: claim.claim_key,
      originalValue: parseStoredJson(claim.original_value_json),
      normalizedValue: parseStoredJson(claim.normalized_value_json),
      unit: claim.unit,
      confidence: claim.confidence,
      evidenceLocator: claim.evidence_locator,
      classification: claim.classification,
      aiInferred: claim.classification === "ai_inferred",
      language: claim.language,
      region: claim.region_code,
      applicableRevision: claim.applicable_revision,
      extractionMethod: claim.extraction_method,
      extractorVersion: claim.extractor_version,
      createdAt: claim.created_at,
    })),
    evidence: snapshots.results.map((snapshot) => ({
      id: snapshot.id,
      sourcePolicyRevisionId: snapshot.source_policy_revision_id,
      sourceClass: snapshot.source_class,
      sourceUrl: snapshot.source_url,
      immutableExternalUrl: snapshot.immutable_external_url,
      originalPublishedAt: snapshot.original_published_at,
      retrievedAt: snapshot.retrieved_at,
      language: snapshot.language,
      region: snapshot.region_code,
      applicableRevision: snapshot.applicable_revision,
      declaredMediaType: snapshot.declared_media_type,
      detectedMediaType: snapshot.detected_media_type,
      byteSize: snapshot.byte_size,
      contentSha256: snapshot.content_sha256,
      fileId: snapshot.file_id,
      authorizedContentUrl: snapshot.file_id ? `/api/v1/files/${encodeURIComponent(String(snapshot.file_id))}/content` : null,
      copyrightReuseStatus: snapshot.copyright_reuse_status,
      retentionState: snapshot.retention_state,
      withdrawnAt: snapshot.withdrawn_at,
      policy: {
        robotsStatus: snapshot.robots_status,
        termsStatus: snapshot.terms_status,
        reuseStatus: snapshot.reuse_status,
        decision: snapshot.policy_decision,
      },
    })),
    previews: [{
      kind: "raw_payload_json",
      text: rawPreview.text,
      byteSize: rawPreview.byteSize,
      originalByteSize: rawPreview.originalByteSize,
      truncated: rawPreview.truncated,
    }],
    candidates: candidates.results.map((candidate) => ({
      ...candidate,
      explanation: parseStoredJson(candidate.explanation_json),
      explanation_json: undefined,
    })),
    conflicts: groupedConflicts,
    lifecycle: [
      ...audit.results.map((event) => ({
        ...event,
        timestamp: event.created_at,
        before: parseStoredJson(event.before_json),
        after: parseStoredJson(event.after_json),
        before_json: undefined,
        after_json: undefined,
      })),
      ...collectionLifecycle.results.map((event) => ({
        ...event,
        timestamp: event.occurred_at,
        details: parseStoredJson(event.details_json),
        details_json: undefined,
      })),
    ].sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp))),
    proposedMutation: mutation,
  });
});

importRoutes.post("/admin/import-records/:id/approve", loadAuthSession, requireAuth, requirePlatformRole("administrator"), async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, reviewSchema);
  const record = await loadReviewRecord(c.env.DB, c.req.param("id"));
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
      if (record.schema_version === "2.0") canonicalId = String(record.id);
      const prepared = await prepareCanonical(c.env.DB, recordType, parsed, {
        importRecordId: String(record.id),
        sourceId: String(record.source_id),
        sourceUrl: String(record.source_url ?? "") || null,
        userId,
        now,
        canonicalId,
        stableIds: record.schema_version === "2.0",
      });
      canonicalId = prepared.id;
      canonicalStatements = prepared.statements;
    }
  }
  const mutation = await proposedReviewMutation(record, body.decision, canonicalId);
  if (record.schema_version === "2.0" && !body.expectedDiffHash) {
    throw new AppError(422, "EXPECTED_DIFF_HASH_REQUIRED", "A v2 approval requires the displayed expectedDiffHash.");
  }
  if (record.schema_version === "2.0" && body.expectedDiffHash !== mutation.hash) {
    throw new AppError(409, "STALE_REVIEW_DIFF", "The proposed mutation changed after it was displayed. Refresh before approving.");
  }
  const stagingTable = stagingTableFor(recordType);
  const statements: D1PreparedStatement[] = [
    ...canonicalStatements,
    c.env.DB.prepare(`UPDATE import_records SET status = 'approved', canonical_entity_type = ?1,
      canonical_entity_id = ?2, updated_at = ?3 WHERE id = ?4`).bind(recordType, canonicalId, now, record.id),
    c.env.DB.prepare(`UPDATE canonical_match_candidates SET decision = CASE WHEN canonical_entity_id = ?1 THEN 'accepted' ELSE 'rejected' END,
      decided_by_user_id = ?2, decided_at = ?3 WHERE import_record_id = ?4`).bind(canonicalId, userId, now, record.id),
    c.env.DB.prepare(`INSERT INTO import_audit_events
      (id, import_job_id, import_record_id, actor_user_id, event_type, after_json, trace_id, created_at)
      VALUES (?1, ?2, ?3, ?4, 'record.approved', ?5, ?6, ?7)`)
      .bind(crypto.randomUUID(), record.import_job_id, record.id, userId,
        JSON.stringify({ decision: body.decision, canonicalId, diffHash: mutation.hash }), record.trace_id, now),
  ];
  if (stagingTable) statements.push(c.env.DB.prepare(`UPDATE ${stagingTable} SET review_status = ?1 WHERE import_record_id = ?2`).bind(body.decision === "merge" ? "merged" : "approved", record.id));
  await c.env.DB.batch(statements);
  await recordAuditEvent(c.env.DB, { actorUserId: userId, action: "import.record.approve", entityType: recordType, entityId: canonicalId, requestId: c.get("requestId"), after: { importRecordId: record.id, decision: body.decision } });
  return c.json({ importRecordId: record.id, canonicalEntityType: recordType, canonicalEntityId: canonicalId, decision: body.decision });
});

importRoutes.post("/admin/import-records/:id/reject", loadAuthSession, requireAuth, requirePlatformRole("administrator"), async (c) => {
  const userId = authenticatedUserId(c); const body = await parseJson(c, rejectSchema); const now = new Date().toISOString();
  const record = await loadReviewRecord(c.env.DB, c.req.param("id"));
  const stagingTable = stagingTableFor(String(record.record_type));
  const statements = [
    c.env.DB.prepare("UPDATE import_records SET status = 'rejected', updated_at = ?1 WHERE id = ?2").bind(now, record.id),
    c.env.DB.prepare(`INSERT INTO import_audit_events
      (id, import_job_id, import_record_id, actor_user_id, event_type, after_json, trace_id, created_at)
      VALUES (?1, ?2, ?3, ?4, 'record.rejected', ?5, ?6, ?7)`)
      .bind(crypto.randomUUID(), record.import_job_id, record.id, userId, JSON.stringify({ reason: body.reason }), record.trace_id, now),
  ];
  if (stagingTable) statements.push(c.env.DB.prepare(`UPDATE ${stagingTable} SET review_status = 'rejected' WHERE import_record_id = ?1`).bind(record.id));
  await c.env.DB.batch(statements);
  return c.json({ rejected: true });
});

importRoutes.post("/admin/import-records/:id/defer", loadAuthSession, requireAuth, requirePlatformRole("administrator"), async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, deferSchema);
  const record = await loadReviewRecord(c.env.DB, c.req.param("id"));
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE import_records SET status = 'review', updated_at = ?1
      WHERE id = ?2 AND status IN ('staged', 'review')
    `).bind(now, record.id),
    c.env.DB.prepare(`
      INSERT INTO import_audit_events
        (id, import_job_id, import_record_id, actor_user_id, event_type, after_json, trace_id, created_at)
      VALUES (?, ?, ?, ?, 'record.deferred', ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      record.import_job_id,
      record.id,
      userId,
      JSON.stringify({ reason: body.reason, reviewAfter: body.reviewAfter ?? null }),
      record.trace_id,
      now,
    ),
  ]);
  return c.json({ deferred: true, reviewAfter: body.reviewAfter ?? null });
});

importRoutes.post("/admin/import-records/:id/conflicts", loadAuthSession, requireAuth, requirePlatformRole("administrator"), async (c) => {
  const userId = authenticatedUserId(c);
  const body = await parseJson(c, conflictSchema);
  const record = await loadReviewRecord(c.env.DB, c.req.param("id"));
  const claimIds = [...new Set(body.claimIds)].sort();
  if (claimIds.length < 2) throw new AppError(422, "CONFLICT_CLAIMS_REQUIRED", "At least two distinct claims are required.");
  const placeholders = claimIds.map((_, index) => `?${index + 2}`).join(", ");
  const claims = await c.env.DB.prepare(`
    SELECT id, claim_key, normalized_value_json
    FROM field_claims
    WHERE import_record_id = ?1 AND id IN (${placeholders})
    ORDER BY id
  `).bind(record.id, ...claimIds).all<{ id: string; claim_key: string; normalized_value_json: string | null }>();
  if (claims.results.length !== claimIds.length) {
    throw new AppError(422, "CONFLICT_CLAIM_MISMATCH", "Every conflict claim must belong to this import record.");
  }
  const fieldKeys = new Set(claims.results.map((claim) => claim.claim_key));
  if (fieldKeys.size !== 1) throw new AppError(422, "CONFLICT_FIELD_MISMATCH", "Conflict claims must describe one field.");
  const values = new Set(claims.results.map((claim) => canonicalJson(parseStoredJson(claim.normalized_value_json))));
  if (values.size < 2) throw new AppError(422, "CONFLICT_VALUES_IDENTICAL", "Conflict claims must contain different normalized values.");
  const conflictId = await sha256(canonicalJson({
    schemaVersion: "claim-conflict/1",
    importRecordId: record.id,
    fieldKey: claims.results[0]!.claim_key,
    conflictType: body.conflictType,
    claimIds,
  }));
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT OR IGNORE INTO claim_conflict_sets
        (id, source_id, import_record_id, entity_type, entity_external_id, field_key, conflict_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
    `).bind(
      conflictId,
      record.source_id,
      record.id,
      record.record_type,
      record.external_record_id,
      claims.results[0]!.claim_key,
      body.conflictType,
      now,
    ),
    ...claimIds.map((claimId) => c.env.DB.prepare(`
      INSERT OR IGNORE INTO claim_conflict_members
        (conflict_set_id, field_claim_id, member_role, created_at)
      VALUES (?, ?, 'claim', ?)
    `).bind(conflictId, claimId, now)),
    c.env.DB.prepare(`
      UPDATE import_records SET status = 'review', updated_at = ?1
      WHERE id = ?2 AND status IN ('staged', 'review')
    `).bind(now, record.id),
    c.env.DB.prepare(`
      INSERT INTO import_audit_events
        (id, import_job_id, import_record_id, actor_user_id, event_type, after_json, trace_id, created_at)
      VALUES (?, ?, ?, ?, 'record.conflict_recorded', ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      record.import_job_id,
      record.id,
      userId,
      JSON.stringify({ conflictId, claimIds, conflictType: body.conflictType }),
      record.trace_id,
      now,
    ),
  ]);
  return c.json({ id: conflictId, status: "open" }, 201);
});

importRoutes.post("/admin/collection-jobs/:id/resume", loadAuthSession, requireAuth, requirePlatformRole("administrator"), async (c) => {
  if (!c.env.SCRAPE_INGEST_QUEUE) {
    throw new AppError(503, "SCRAPE_QUEUE_UNAVAILABLE", "The scrape-ingestion Queue binding is unavailable.");
  }
  try {
    const outcome = await resumeScrapeIngestionJob({
      db: c.env.DB,
      queue: c.env.SCRAPE_INGEST_QUEUE,
      jobId: c.req.param("id"),
      actorUserId: authenticatedUserId(c),
      actorRole: "administrator",
      now: new Date().toISOString(),
    });
    return c.json(outcome);
  } catch (error) {
    if (error instanceof PermanentScrapeIngestionError) {
      const missing = error.message.includes("not found");
      throw new AppError(
        missing ? 404 : 422,
        missing ? "COLLECTION_JOB_NOT_FOUND" : "COLLECTION_JOB_RESUME_REJECTED",
        error.message,
      );
    }
    throw error;
  }
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
    SELECT id FROM source_policy_revisions
    WHERE source_id = ? AND decision = 'unreviewed' AND approval_authority_reference = 'external-ingestion-untrusted'
    ORDER BY effective_at DESC, created_at DESC LIMIT 1
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
      null,
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
      "external_reference",
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

type ReviewRecord = {
  id: string;
  import_job_id: string;
  source_id: string;
  source_name: string;
  external_record_id: string;
  record_type: string;
  source_url: string | null;
  confidence: number;
  raw_payload_json: string;
  parsed_data_json: string;
  status: string;
  trace_id: string | null;
  schema_version: string;
  created_at: string;
  updated_at: string;
};

async function loadReviewRecord(db: D1Database, id: string): Promise<ReviewRecord> {
  const record = await db.prepare(`
    SELECT ir.*, ij.schema_version, source.name AS source_name
    FROM import_records AS ir
    JOIN import_jobs AS ij ON ij.id = ir.import_job_id
    JOIN import_sources AS source ON source.id = ir.source_id
    WHERE ir.id = ?1 AND ir.status IN ('staged', 'review')
  `).bind(id).first<ReviewRecord>();
  if (!record) throw new AppError(404, "IMPORT_RECORD_NOT_FOUND", "Pending import record not found.");
  return record;
}

async function proposedReviewMutation(
  record: ReviewRecord,
  decision: "create" | "merge",
  canonicalEntityId: string | null,
): Promise<{ diff: Record<string, unknown>; hash: string }> {
  const parsedData = JSON.parse(record.parsed_data_json) as Record<string, unknown>;
  const targetId = decision === "create" ? record.id : canonicalEntityId;
  const diff = {
    schemaVersion: "review-mutation/1",
    operation: decision,
    importRecordId: record.id,
    recordType: record.record_type,
    canonicalEntityId: targetId,
    sourceId: record.source_id,
    sourceUrl: record.source_url,
    parsedData,
    targets: [
      ...(decision === "create" ? reviewMutationTargets(record.record_type, targetId, parsedData) : []),
      { table: "import_records", keys: [record.id] },
      { table: "canonical_match_candidates", keys: [record.id] },
      { table: "import_audit_events", keys: [record.id] },
    ],
  };
  return { diff, hash: await sha256(canonicalJson(diff)) };
}

function reviewMutationTargets(
  type: string,
  canonicalId: string | null,
  parsed: Record<string, unknown>,
): Array<{ table: string; keys: string[] }> {
  if (!canonicalId) return [];
  if (type === "manufacturer") return [{ table: "manufacturers", keys: [canonicalId] }];
  if (type === "supplier") {
    const regions = [...new Set(Array.isArray(parsed.regions) ? parsed.regions.map(String) : [])].sort();
    return [
      { table: "suppliers", keys: [canonicalId] },
      ...regions.map((region) => ({ table: "supplier_regions", keys: [canonicalId, region] })),
    ];
  }
  if (type === "component") return [{ table: "components", keys: [canonicalId] }];
  if (type === "evidence") return [{ table: "evidence", keys: [canonicalId] }];
  if (type === "offer") {
    return [
      { table: "supplier_offers", keys: [canonicalId] },
      { table: "offer_price_history", keys: [`${canonicalId}:price`] },
    ];
  }
  if (type === "project") {
    return [
      { table: "projects", keys: [canonicalId] },
      { table: "project_versions", keys: [`${canonicalId}:version`] },
      { table: "project_maintainers", keys: [canonicalId] },
    ];
  }
  if (type === "bom") {
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return [
      { table: "boms", keys: [canonicalId] },
      { table: "bom_versions", keys: [`${canonicalId}:version`] },
      ...items.map((_, index) => ({ table: "bom_items", keys: [`${canonicalId}:item:${index}`] })),
    ];
  }
  if (type === "integration") {
    const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
    return [
      { table: "integrations", keys: [canonicalId] },
      ...entities.map((_, index) => ({ table: "integration_entities", keys: [canonicalId, String(index)] })),
    ];
  }
  return [{ table: "manual_review_link", keys: [canonicalId] }];
}

function boundedUtf8Preview(value: string, maxBytes: number): {
  text: string;
  byteSize: number;
  originalByteSize: number;
  truncated: boolean;
} {
  const encoded = new TextEncoder().encode(value);
  const truncated = encoded.byteLength > maxBytes;
  let text = value;
  if (truncated) {
    let boundary = maxBytes;
    while (boundary > 0) {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(encoded.slice(0, boundary));
        break;
      } catch {
        boundary -= 1;
      }
    }
  }
  const byteSize = new TextEncoder().encode(text).byteLength;
  return { text, byteSize, originalByteSize: encoded.byteLength, truncated };
}

function parseStoredJson(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function groupReviewConflicts(rows: Record<string, unknown>[]) {
  const grouped = new Map<string, Record<string, unknown> & { members: Array<Record<string, unknown>> }>();
  for (const row of rows) {
    const id = String(row.id);
    let conflict = grouped.get(id);
    if (!conflict) {
      conflict = {
        id,
        fieldKey: row.field_key,
        conflictType: row.conflict_type,
        status: row.status,
        resolutionNotes: row.resolution_notes,
        createdAt: row.created_at,
        members: [],
      };
      grouped.set(id, conflict);
    }
    if (row.field_claim_id) {
      conflict.members.push({ claimId: row.field_claim_id, role: row.member_role });
    }
  }
  return [...grouped.values()];
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

type CanonicalContext = {
  importRecordId: string;
  sourceId: string;
  sourceUrl: string | null;
  userId: string;
  now: string;
  canonicalId?: string | null;
  stableIds?: boolean;
};
type PreparedCanonical = { id: string; statements: D1PreparedStatement[] };

async function prepareCanonical(db: D1Database, type: string, parsed: Record<string, unknown>, context: CanonicalContext): Promise<PreparedCanonical> {
  const id = context.canonicalId ?? crypto.randomUUID();
  const derivedId = (suffix: string) => context.stableIds ? `${id}:${suffix}` : crypto.randomUUID();
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
      .bind(derivedId("price"), id, parsed.currency, parsed.unitPriceMinor, parsed.observedAt, context.importRecordId));
  } else if (type === "project") {
    const versionId = derivedId("version");
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
    const versionId = derivedId("version");
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
        .bind(derivedId(`item:${index}`), versionId, componentId, slot, item.name, item.quantity ?? item.qty, item.unit ?? "each", item.notes ?? null, index));
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
