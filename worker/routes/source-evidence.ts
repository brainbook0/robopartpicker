import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { AppError } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { authenticatedUserId, requirePlatformRole } from "../middleware/authorization";
import { parseJson } from "../validation";
import { recordAuditEvent } from "../services/audit";
import {
  contentAddress,
  evidenceClasses,
  evidenceRegistrationSchema,
  evidenceSnapshotResponse,
  normalizeMediaType,
  registerEvidenceSnapshot,
  requireEvidencePolicy,
  requirePolicySourceUrl,
  validateRetainedEvidence,
} from "../services/source-evidence";

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const policyIdSchema = z.string().trim().min(1).max(200);
const evidenceClassSchema = z.enum(evidenceClasses);
const retentionTransitionSchema = z.object({
  toState: z.enum(["takedown_pending", "takedown_complete"]),
  reason: z.string().trim().min(2).max(2_000),
}).strict();

export const sourceEvidenceRoutes = new Hono<AppBindings>();

sourceEvidenceRoutes.put("/source-evidence/objects/:sha256", async (c) => {
  await requireIngestionCredential(c.req.raw.headers, c.env.INGESTION_SECRET);
  const contentSha256 = hashSchema.safeParse(c.req.param("sha256"));
  if (!contentSha256.success) throw new AppError(422, "EVIDENCE_HASH_INVALID", "The content address must be a lowercase SHA-256 digest.");
  const sourcePolicyRevisionId = policyIdSchema.safeParse(c.req.header("x-source-policy-revision-id"));
  if (!sourcePolicyRevisionId.success) throw new AppError(422, "EVIDENCE_POLICY_REQUIRED", "A source policy revision is required.");
  const evidenceClass = evidenceClassSchema.safeParse(c.req.header("x-evidence-class"));
  if (!evidenceClass.success) throw new AppError(422, "EVIDENCE_CLASS_INVALID", "A supported evidence class is required.");
  const lengthHeader = c.req.header("content-length");
  const byteSize = lengthHeader && /^\d+$/u.test(lengthHeader) ? Number(lengthHeader) : Number.NaN;
  if (!Number.isSafeInteger(byteSize) || byteSize < 0) {
    throw new AppError(411, "EVIDENCE_LENGTH_REQUIRED", "A valid Content-Length is required for retained evidence.");
  }
  const declaredMediaType = c.req.header("content-type") ?? "";
  const detectedMediaType = c.req.header("x-detected-media-type") ?? "";
  const validated = validateRetainedEvidence(evidenceClass.data, declaredMediaType, detectedMediaType, byteSize);
  const policy = await requireEvidencePolicy(c.env.DB, c.env.APP_ENV, sourcePolicyRevisionId.data, undefined, true);
  const sourceUrl = c.req.header("x-source-url");
  if (!sourceUrl) throw new AppError(422, "EVIDENCE_SOURCE_URL_REQUIRED", "An approved source URL is required.");
  const normalizedSourceUrl = requirePolicySourceUrl(policy, sourceUrl);
  const key = contentAddress(contentSha256.data);
  const existing = await c.env.FILES.head(key);
  if (existing) {
    assertStoredObject(existing, byteSize, contentSha256.data);
    return c.json({
      deduplicated: true,
      object: {
        contentSha256: contentSha256.data,
        byteSize: existing.size,
        declaredMediaType: validated.mediaType,
        detectedMediaType: validated.mediaType,
        retainedObjectKey: key,
      },
    });
  }
  if (!c.req.raw.body) throw new AppError(422, "EVIDENCE_BODY_REQUIRED", "Evidence bytes are required.");

  let stored: R2Object | null;
  try {
    stored = await c.env.FILES.put(key, c.req.raw.body, {
      onlyIf: { etagDoesNotMatch: "*" },
      sha256: contentSha256.data,
      httpMetadata: {
        contentType: validated.mediaType,
        contentDisposition: "attachment",
        cacheControl: "private, no-store",
      },
      customMetadata: {
        kind: "source-evidence",
        sha256: contentSha256.data,
        sourceId: policy.source_id,
        sourcePolicyRevisionId: sourcePolicyRevisionId.data,
        sourceOrigin: new URL(normalizedSourceUrl).origin,
      },
    });
  } catch {
    throw new AppError(422, "EVIDENCE_CHECKSUM_MISMATCH", "The uploaded bytes did not match the declared SHA-256 digest.");
  }
  if (!stored) {
    const raced = await c.env.FILES.head(key);
    if (!raced) throw new AppError(409, "EVIDENCE_OBJECT_RACE", "The content-addressed evidence object could not be claimed.");
    assertStoredObject(raced, byteSize, contentSha256.data);
    return c.json({
      deduplicated: true,
      object: {
        contentSha256: contentSha256.data,
        byteSize: raced.size,
        declaredMediaType: validated.mediaType,
        detectedMediaType: validated.mediaType,
        retainedObjectKey: key,
      },
    });
  }
  if (stored.size !== byteSize) {
    await c.env.FILES.delete(key);
    throw new AppError(422, "EVIDENCE_SIZE_MISMATCH", "The stored evidence size did not match Content-Length.");
  }
  assertStoredObject(stored, byteSize, contentSha256.data);
  return c.json({
    deduplicated: false,
    object: {
      contentSha256: contentSha256.data,
      byteSize: stored.size,
      declaredMediaType: validated.mediaType,
      detectedMediaType: validated.mediaType,
      retainedObjectKey: key,
    },
  }, 201);
});

sourceEvidenceRoutes.post("/source-evidence/registrations", async (c) => {
  await requireIngestionCredential(c.req.raw.headers, c.env.INGESTION_SECRET);
  const registration = await parseJson(c, evidenceRegistrationSchema);
  const result = await registerEvidenceSnapshot(c.env.DB, c.env.FILES, c.env.APP_ENV, registration);
  return c.json({
    duplicate: result.duplicate,
    snapshot: evidenceSnapshotResponse(result.row),
  }, result.duplicate ? 200 : 201);
});

sourceEvidenceRoutes.get(
  "/admin/source-evidence/:id",
  loadAuthSession,
  requireAuth,
  requirePlatformRole("moderator", "administrator"),
  async (c) => {
    const row = await c.env.DB.prepare(`
      SELECT s.*, NOT EXISTS(SELECT 1 FROM source_snapshots child WHERE child.supersedes_snapshot_id = s.id) AS is_current
      FROM source_snapshots s WHERE s.id = ?
    `)
      .bind(c.req.param("id")).first<Record<string, unknown>>();
    if (!row) throw new AppError(404, "EVIDENCE_SNAPSHOT_NOT_FOUND", "Evidence snapshot not found.");
    return c.json({ snapshot: evidenceSnapshotResponse(row) });
  },
);

sourceEvidenceRoutes.get(
  "/admin/source-evidence/:id/content",
  loadAuthSession,
  requireAuth,
  requirePlatformRole("moderator", "administrator"),
  async (c) => {
    const row = await c.env.DB.prepare(`
      SELECT s.id, s.content_sha256, s.retained_object_key, s.declared_media_type, s.retention_state,
        NOT EXISTS(SELECT 1 FROM source_snapshots child WHERE child.supersedes_snapshot_id = s.id) AS is_current
      FROM source_snapshots s
      WHERE s.id = ?
    `).bind(c.req.param("id")).first<Record<string, unknown>>();
    if (!row) throw new AppError(404, "EVIDENCE_SNAPSHOT_NOT_FOUND", "Evidence snapshot not found.");
    if (Number(row.is_current) !== 1 || row.retention_state !== "retained"
      || typeof row.content_sha256 !== "string" || typeof row.retained_object_key !== "string") {
      throw new AppError(423, "EVIDENCE_CONTENT_NOT_RETAINED", "This evidence snapshot does not have accessible retained bytes.");
    }
    const key = contentAddress(row.content_sha256);
    if (row.retained_object_key !== key) {
      throw new AppError(409, "EVIDENCE_CONTENT_ADDRESS_INVALID", "The evidence metadata does not match its content address.");
    }
    const object = await c.env.FILES.get(key);
    if (!object) throw new AppError(404, "EVIDENCE_OBJECT_NOT_FOUND", "The retained evidence object is missing.");
    const headers = new Headers({
      "cache-control": "private, no-store",
      "content-disposition": "attachment",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-type": normalizeMediaType(String(row.declared_media_type)),
      "etag": object.httpEtag,
      "x-content-type-options": "nosniff",
    });
    return new Response(object.body, { status: 200, headers });
  },
);

sourceEvidenceRoutes.post(
  "/admin/source-evidence/:id/retention",
  loadAuthSession,
  requireAuth,
  requirePlatformRole("administrator"),
  async (c) => {
    const actorUserId = authenticatedUserId(c);
    const transition = await parseJson(c, retentionTransitionSchema);
    const prior = await c.env.DB.prepare("SELECT * FROM source_snapshots WHERE id = ?")
      .bind(c.req.param("id")).first<Record<string, unknown>>();
    if (!prior) throw new AppError(404, "EVIDENCE_SNAPSHOT_NOT_FOUND", "Evidence snapshot not found.");
    const successor = await c.env.DB.prepare(`
      SELECT * FROM source_snapshots WHERE supersedes_snapshot_id = ? AND retention_state = ? LIMIT 1
    `).bind(prior.id, transition.toState).first<Record<string, unknown>>();
    if (successor) return c.json({ duplicate: true, snapshot: evidenceSnapshotResponse(successor) });
    const allowed = transition.toState === "takedown_pending"
      ? ["active", "retained", "external_reference", "metadata_only"].includes(String(prior.retention_state))
      : prior.retention_state === "takedown_pending";
    if (!allowed) {
      throw new AppError(409, "EVIDENCE_RETENTION_TRANSITION_INVALID", `Cannot transition ${String(prior.retention_state)} to ${transition.toState}.`);
    }
    const current = await c.env.DB.prepare(`
      SELECT 1 AS value FROM source_snapshots child WHERE child.supersedes_snapshot_id = ? LIMIT 1
    `).bind(prior.id).first<{ value: number }>();
    if (current) throw new AppError(409, "EVIDENCE_SNAPSHOT_SUPERSEDED", "Retention can change only from the current snapshot revision.");

    const now = new Date().toISOString();
    const snapshotId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const traceId = randomTraceId();
    const dedupKey = `evidence-retention:${String(prior.id)}:${transition.toState}`;
    const metadata = JSON.parse(String(prior.retrieval_metadata_json)) as Record<string, unknown>;
    const nextMetadata = JSON.stringify({
      ...metadata,
      retentionTransition: {
        actorUserId,
        fromState: prior.retention_state,
        reason: transition.reason,
        transitionedAt: now,
      },
    });
    if (new TextEncoder().encode(nextMetadata).byteLength > 131_072) {
      throw new AppError(422, "EVIDENCE_METADATA_TOO_LARGE", "The retention transition would exceed the 128 KiB metadata limit.");
    }
    const completed = transition.toState === "takedown_complete";
    const statements = [
      c.env.DB.prepare(`
        INSERT INTO collection_jobs
          (id, source_id, source_policy_revision_id, job_type, status, requested_url, payload_hash, dedup_key,
           scheduled_for, started_at, completed_at, attempt_count, max_attempts, trace_id, created_at, updated_at)
        VALUES (?, ?, ?, 'maintenance', 'complete', ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)
      `).bind(
        jobId,
        prior.source_id,
        prior.source_policy_revision_id,
        prior.source_url,
        await digest(`${String(prior.id)}\n${transition.toState}\n${transition.reason}`),
        dedupKey,
        now,
        now,
        now,
        traceId,
        now,
        now,
      ),
      c.env.DB.prepare(`
        INSERT INTO source_snapshots
          (id, source_id, import_record_id, source_policy_revision_id, source_class, source_url, original_published_at,
           retrieved_at, language, region_code, applicable_revision, declared_media_type, detected_media_type, byte_size,
           content_sha256, retained_object_key, immutable_external_url, retrieval_metadata_json, copyright_reuse_status,
           retention_state, supersedes_snapshot_id, withdrawn_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        snapshotId,
        prior.source_id,
        prior.import_record_id,
        prior.source_policy_revision_id,
        prior.source_class,
        prior.source_url,
        prior.original_published_at,
        prior.retrieved_at,
        prior.language,
        prior.region_code,
        prior.applicable_revision,
        prior.declared_media_type,
        prior.detected_media_type,
        prior.byte_size,
        prior.content_sha256,
        completed ? null : prior.retained_object_key,
        completed ? null : prior.immutable_external_url,
        nextMetadata,
        prior.copyright_reuse_status,
        transition.toState,
        prior.id,
        now,
        now,
      ),
      c.env.DB.prepare(`
        INSERT INTO collection_lifecycle_events
          (id, collection_job_id, source_id, import_record_id, event_type, from_status, to_status, reason,
           details_json, trace_id, occurred_at, created_at)
        VALUES (?, ?, ?, ?, 'evidence.retention.transition', ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        jobId,
        prior.source_id,
        prior.import_record_id,
        prior.retention_state,
        transition.toState,
        transition.reason,
        JSON.stringify({ actorUserId, snapshotId, supersedesSnapshotId: prior.id }),
        traceId,
        now,
        now,
      ),
    ];
    try {
      await c.env.DB.batch(statements);
    } catch (error) {
      const raced = await c.env.DB.prepare(`
        SELECT * FROM source_snapshots WHERE supersedes_snapshot_id = ? AND retention_state = ? LIMIT 1
      `).bind(prior.id, transition.toState).first<Record<string, unknown>>();
      if (!raced) throw error;
      return c.json({ duplicate: true, snapshot: evidenceSnapshotResponse(raced) });
    }
    await recordAuditEvent(c.env.DB, {
      actorUserId,
      action: "source_evidence.retention_transition",
      entityType: "source_snapshot",
      entityId: snapshotId,
      requestId: c.get("requestId"),
      before: { snapshotId: prior.id, retentionState: prior.retention_state },
      after: { retentionState: transition.toState, reason: transition.reason },
    });
    const row = await c.env.DB.prepare("SELECT * FROM source_snapshots WHERE id = ?")
      .bind(snapshotId).first<Record<string, unknown>>();
    return c.json({ duplicate: false, snapshot: evidenceSnapshotResponse(row!) }, 201);
  },
);

function assertStoredObject(object: R2Object, expectedSize: number, expectedSha256: string): void {
  if (object.size !== expectedSize || object.customMetadata?.sha256 !== expectedSha256) {
    throw new AppError(409, "EVIDENCE_OBJECT_CONFLICT", "Existing content-addressed evidence metadata does not match the registration.");
  }
}

async function requireIngestionCredential(headers: Headers, configured: string): Promise<void> {
  const authorization = headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : headers.get("x-ingestion-secret") ?? "";
  if (!configured || configured.startsWith("replace-with") || !provided
    || !constantTime(await digest(provided), await digest(configured))) {
    throw new AppError(401, "INGESTION_AUTHENTICATION_FAILED", "A valid ingestion service credential is required.");
  }
}

async function digest(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function constantTime(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function randomTraceId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
