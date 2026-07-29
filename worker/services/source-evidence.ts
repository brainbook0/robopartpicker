import { z } from "zod";
import type { Env } from "../env";
import { AppError } from "../http";

export const evidenceClasses = ["structured_text", "document", "image", "archive_or_cad", "media_or_other"] as const;
export type EvidenceClass = (typeof evidenceClasses)[number];

export const EVIDENCE_CLASS_LIMITS: Record<EvidenceClass, number | null> = {
  structured_text: 8 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  archive_or_cad: 50 * 1024 * 1024,
  media_or_other: null,
};

export const EVIDENCE_MIME_BY_CLASS: Record<Exclude<EvidenceClass, "media_or_other">, ReadonlySet<string>> = {
  structured_text: new Set([
    "application/json", "application/ld+json", "application/xml", "application/yaml",
    "text/csv", "text/html", "text/markdown", "text/plain", "text/tab-separated-values", "text/xml", "text/yaml",
  ]),
  document: new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  image: new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]),
  archive_or_cad: new Set([
    "application/gzip", "application/octet-stream", "application/zip",
    "model/gltf+json", "model/gltf-binary", "model/iges", "model/step", "model/stl",
  ]),
};

const httpsUrl = z.string().url().max(2_048).transform((value, ctx) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    ctx.addIssue({ code: "custom", message: "Evidence URLs must use HTTPS without embedded credentials." });
    return z.NEVER;
  }
  url.hash = "";
  return url.toString();
});

export const evidenceRegistrationSchema = z.object({
  schemaVersion: z.literal("1.0"),
  externalRegistrationId: z.string().trim().min(1).max(300),
  mode: z.enum(["retained_bytes", "external_reference", "metadata_only", "rejected"]),
  sourceId: z.string().trim().min(1).max(200),
  importRecordId: z.string().trim().min(1).max(200).nullable().optional(),
  sourcePolicyRevisionId: z.string().trim().min(1).max(200),
  sourceClass: z.enum(["official", "reported", "measured", "calculated", "estimated", "ai_inferred"]),
  evidenceClass: z.enum(evidenceClasses),
  sourceUrl: httpsUrl,
  immutableExternalUrl: httpsUrl.optional(),
  originalPublishedAt: z.string().datetime().nullable().optional(),
  retrievedAt: z.string().datetime(),
  language: z.string().trim().max(35).nullable().optional(),
  countryOrRegion: z.string().trim().max(80).nullable().optional(),
  applicableRevision: z.string().trim().min(1).max(200),
  declaredMediaType: z.string().trim().min(1).max(200),
  detectedMediaType: z.string().trim().min(1).max(200),
  byteSize: z.number().int().nonnegative().max(2_147_483_647),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  retrievalMetadata: z.record(z.string(), z.unknown()),
  copyrightReuseStatus: z.string().trim().min(1).max(200),
  rejectionCode: z.string().trim().min(1).max(100).optional(),
  rejectionReason: z.string().trim().min(1).max(2_000).optional(),
  supersedesSnapshotId: z.string().trim().min(1).max(200).nullable().optional(),
  traceId: z.string().regex(/^[0-9a-f]{32}$/u).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.mode === "external_reference" && !value.immutableExternalUrl) {
    ctx.addIssue({ code: "custom", path: ["immutableExternalUrl"], message: "External references require an immutable HTTPS URL." });
  }
  if (value.mode !== "external_reference" && value.immutableExternalUrl) {
    ctx.addIssue({ code: "custom", path: ["immutableExternalUrl"], message: "Only external-reference registrations may provide an immutable URL." });
  }
  if (value.mode === "rejected" && (!value.rejectionCode || !value.rejectionReason)) {
    ctx.addIssue({ code: "custom", path: ["rejectionReason"], message: "Rejected evidence requires a bounded code and reason." });
  }
});

export type EvidenceRegistration = z.output<typeof evidenceRegistrationSchema>;

export function contentAddress(contentSha256: string): string {
  return `source-evidence/sha256/${contentSha256.slice(0, 2)}/${contentSha256}`;
}

export function normalizeMediaType(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

export function validateRetainedEvidence(
  evidenceClass: EvidenceClass,
  declaredMediaType: string,
  detectedMediaType: string,
  byteSize: number,
): { mediaType: string; limit: number } {
  if (evidenceClass === "media_or_other") {
    throw new AppError(422, "EVIDENCE_EXTERNAL_REFERENCE_ONLY", "Media and unclassified evidence may only be external-reference or metadata-only.");
  }
  const limit = EVIDENCE_CLASS_LIMITS[evidenceClass];
  if (limit === null) throw new AppError(500, "EVIDENCE_CLASS_CONFIGURATION_INVALID", "The evidence retention limit is unavailable.");
  if (byteSize > limit) {
    throw new AppError(413, "EVIDENCE_TOO_LARGE", `${evidenceClass} evidence exceeds its ${Math.floor(limit / 1024 / 1024)} MiB retention cap.`);
  }
  const declared = normalizeMediaType(declaredMediaType);
  const detected = normalizeMediaType(detectedMediaType);
  if (declared !== detected) {
    throw new AppError(422, "EVIDENCE_MIME_MISMATCH", "Declared and detected media types must match.");
  }
  if (!EVIDENCE_MIME_BY_CLASS[evidenceClass].has(declared)) {
    throw new AppError(422, "EVIDENCE_MIME_NOT_ALLOWED", `The ${declared} media type is not allowed for ${evidenceClass} evidence.`);
  }
  return { mediaType: declared, limit };
}

type PolicyRow = {
  id: string;
  source_id: string;
  robots_status: string;
  terms_status: string;
  reuse_status: string;
  decision: string;
  superseded_at: string | null;
  policy_state: string | null;
  enabled: number | null;
  has_successor: number;
  base_url: string | null;
};

export async function requireEvidencePolicy(
  db: D1Database,
  appEnv: Env["APP_ENV"],
  policyRevisionId: string,
  expectedSourceId?: string,
  retentionRequired = true,
): Promise<PolicyRow> {
  const policy = await db.prepare(`
    SELECT p.*, scp.policy_state, scp.enabled, source.base_url,
      EXISTS(SELECT 1 FROM source_policy_revisions next WHERE next.supersedes_policy_revision_id = p.id) AS has_successor
    FROM source_policy_revisions p
    JOIN import_sources source ON source.id = p.source_id
    LEFT JOIN source_collection_profiles scp ON scp.source_id = p.source_id
    WHERE p.id = ?
  `).bind(policyRevisionId).first<PolicyRow>();
  if (!policy || (expectedSourceId && policy.source_id !== expectedSourceId)) {
    throw new AppError(404, "EVIDENCE_POLICY_NOT_FOUND", "The source policy revision was not found.");
  }
  const fixtureEnvironment = appEnv === "test" || appEnv === "development";
  const approvedDecision = policy.decision === "approved_live"
    || (fixtureEnvironment && policy.decision === "approved_fixture_only");
  const liveProfile = fixtureEnvironment
    || (policy.policy_state === "approved_live" && policy.enabled === 1);
  const sourceAccessAllowed = ["allowed", "not_applicable"].includes(policy.robots_status)
    && ["approved", "not_applicable"].includes(policy.terms_status);
  const reuseAllowed = retentionRequired
    ? policy.reuse_status === "retention_approved"
    : !["denied", "unknown"].includes(policy.reuse_status);
  if (!approvedDecision || !liveProfile || !sourceAccessAllowed || !reuseAllowed || policy.superseded_at || policy.has_successor) {
    throw new AppError(403, "EVIDENCE_POLICY_DENIED", "The current source policy does not authorize this evidence operation.");
  }
  return policy;
}

export function requirePolicySourceUrl(policy: Pick<PolicyRow, "base_url">, sourceUrl: string): string {
  let candidate: URL;
  let approvedBase: URL;
  try {
    candidate = new URL(sourceUrl);
    approvedBase = new URL(policy.base_url ?? "");
  } catch {
    throw new AppError(422, "EVIDENCE_SOURCE_URL_INVALID", "Evidence requires a valid approved source URL.");
  }
  if (candidate.protocol !== "https:" || candidate.username || candidate.password) {
    throw new AppError(422, "EVIDENCE_SOURCE_URL_INVALID", "Evidence URLs must use HTTPS without embedded credentials.");
  }
  if (!["http:", "https:"].includes(approvedBase.protocol) || candidate.origin !== approvedBase.origin) {
    throw new AppError(403, "EVIDENCE_SOURCE_URL_DENIED", "The evidence URL origin is not covered by this source policy.");
  }
  candidate.hash = "";
  return candidate.toString();
}

export async function registerEvidenceSnapshot(
  db: D1Database,
  bucket: R2Bucket,
  appEnv: Env["APP_ENV"],
  registration: EvidenceRegistration,
): Promise<{ duplicate: boolean; row: Record<string, unknown> }> {
  const retentionRequired = registration.mode === "retained_bytes";
  if (registration.mode !== "rejected") {
    const policy = await requireEvidencePolicy(db, appEnv, registration.sourcePolicyRevisionId, registration.sourceId, retentionRequired);
    requirePolicySourceUrl(policy, registration.sourceUrl);
    if (registration.immutableExternalUrl) requirePolicySourceUrl(policy, registration.immutableExternalUrl);
  } else {
    const policy = await db.prepare("SELECT source_id FROM source_policy_revisions WHERE id = ?")
      .bind(registration.sourcePolicyRevisionId).first<{ source_id: string }>();
    if (!policy || policy.source_id !== registration.sourceId) {
      throw new AppError(404, "EVIDENCE_POLICY_NOT_FOUND", "The source policy revision was not found.");
    }
  }
  if (registration.importRecordId) {
    const record = await db.prepare("SELECT source_id FROM import_records WHERE id = ?")
      .bind(registration.importRecordId).first<{ source_id: string }>();
    if (!record || record.source_id !== registration.sourceId) {
      throw new AppError(422, "EVIDENCE_IMPORT_RECORD_MISMATCH", "The import record does not belong to this source.");
    }
  }
  if (registration.supersedesSnapshotId) {
    const parent = await db.prepare("SELECT source_id FROM source_snapshots WHERE id = ?")
      .bind(registration.supersedesSnapshotId).first<{ source_id: string }>();
    if (!parent || parent.source_id !== registration.sourceId) {
      throw new AppError(422, "EVIDENCE_SNAPSHOT_MISMATCH", "The superseded snapshot does not belong to this source.");
    }
  }

  let retainedObjectKey: string | null = null;
  if (registration.mode === "retained_bytes") {
    validateRetainedEvidence(
      registration.evidenceClass,
      registration.declaredMediaType,
      registration.detectedMediaType,
      registration.byteSize,
    );
    retainedObjectKey = contentAddress(registration.contentSha256);
    const object = await bucket.head(retainedObjectKey);
    if (!object
      || object.size !== registration.byteSize
      || object.customMetadata?.sha256 !== registration.contentSha256) {
      throw new AppError(422, "EVIDENCE_OBJECT_NOT_REGISTERED", "Checksum-verified evidence bytes must be uploaded before registration.");
    }
  }

  const id = await digestText(`${registration.sourceId}\n${registration.externalRegistrationId}`);
  const registrationHash = await digestText(canonicalJson(registration));
  const existing = await db.prepare(`
    SELECT s.*, NOT EXISTS(SELECT 1 FROM source_snapshots child WHERE child.supersedes_snapshot_id = s.id) AS is_current
    FROM source_snapshots s WHERE s.id = ?
  `).bind(id).first<Record<string, unknown>>();
  if (existing) {
    const metadata = JSON.parse(String(existing.retrieval_metadata_json)) as Record<string, unknown>;
    if (metadata.registrationHash !== registrationHash) {
      throw new AppError(409, "EVIDENCE_REGISTRATION_CONFLICT", "The external registration ID was already used with different metadata.");
    }
    return { duplicate: true, row: existing };
  }

  const retentionState = ({
    retained_bytes: "retained",
    external_reference: "external_reference",
    metadata_only: "metadata_only",
    rejected: "rejected",
  } as const)[registration.mode];
  const retrievalMetadata = canonicalJson({
    ...registration.retrievalMetadata,
    evidenceClass: registration.evidenceClass,
    externalRegistrationId: registration.externalRegistrationId,
    registrationHash,
    rejectionCode: registration.rejectionCode ?? null,
    rejectionReason: registration.rejectionReason ?? null,
    traceId: registration.traceId ?? null,
  });
  if (new TextEncoder().encode(retrievalMetadata).byteLength > 131_072) {
    throw new AppError(422, "EVIDENCE_METADATA_TOO_LARGE", "Evidence retrieval metadata is limited to 128 KiB.");
  }
  const now = new Date().toISOString();
  try {
    await db.prepare(`
      INSERT INTO source_snapshots
        (id, source_id, import_record_id, source_policy_revision_id, source_class, source_url, original_published_at,
         retrieved_at, language, region_code, applicable_revision, declared_media_type, detected_media_type, byte_size,
         content_sha256, retained_object_key, immutable_external_url, retrieval_metadata_json, copyright_reuse_status,
         retention_state, supersedes_snapshot_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      registration.sourceId,
      registration.importRecordId ?? null,
      registration.sourcePolicyRevisionId,
      registration.sourceClass,
      registration.sourceUrl,
      registration.originalPublishedAt ?? null,
      registration.retrievedAt,
      registration.language ?? null,
      registration.countryOrRegion ?? null,
      registration.applicableRevision,
      normalizeMediaType(registration.declaredMediaType),
      normalizeMediaType(registration.detectedMediaType),
      registration.byteSize,
      registration.contentSha256,
      retainedObjectKey,
      registration.immutableExternalUrl ?? null,
      retrievalMetadata,
      registration.copyrightReuseStatus,
      retentionState,
      registration.supersedesSnapshotId ?? null,
      now,
    ).run();
  } catch (error) {
    const raced = await db.prepare("SELECT * FROM source_snapshots WHERE id = ?").bind(id).first<Record<string, unknown>>();
    if (!raced) throw error;
    const racedMetadata = JSON.parse(String(raced.retrieval_metadata_json)) as Record<string, unknown>;
    if (racedMetadata.registrationHash !== registrationHash) {
      throw new AppError(409, "EVIDENCE_REGISTRATION_CONFLICT", "The external registration ID was already used with different metadata.");
    }
    return { duplicate: true, row: raced };
  }
  const row = await db.prepare("SELECT * FROM source_snapshots WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!row) throw new AppError(500, "EVIDENCE_REGISTRATION_FAILED", "The evidence snapshot could not be registered.");
  return { duplicate: false, row };
}

export function evidenceSnapshotResponse(row: Record<string, unknown>) {
  const retained = row.retention_state === "retained"
    && (row.is_current === undefined || Number(row.is_current) === 1);
  return {
    id: row.id,
    sourceId: row.source_id,
    importRecordId: row.import_record_id,
    sourceClass: row.source_class,
    sourceUrl: row.source_url,
    retrievedAt: row.retrieved_at,
    applicableRevision: row.applicable_revision,
    declaredMediaType: row.declared_media_type,
    detectedMediaType: row.detected_media_type,
    byteSize: row.byte_size,
    contentSha256: row.content_sha256,
    immutableExternalUrl: row.immutable_external_url,
    retentionState: row.retention_state,
    copyrightReuseStatus: row.copyright_reuse_status,
    retrievalMetadata: JSON.parse(String(row.retrieval_metadata_json)),
    contentUrl: retained ? `/api/v1/admin/source-evidence/${row.id}/content` : null,
    createdAt: row.created_at,
  };
}

function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (!item || typeof item !== "object") return item;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(item as Record<string, unknown>).sort()) {
      const child = (item as Record<string, unknown>)[key];
      if (child !== undefined) result[key] = normalize(child);
    }
    return result;
  };
  return JSON.stringify(normalize(value));
}

async function digestText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
