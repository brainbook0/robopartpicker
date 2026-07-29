import { api } from "./client";

export type ReviewQueueItem = {
  id: string;
  import_job_id: string;
  external_record_id: string;
  record_type: string;
  source_name: string;
  confidence: number;
  status: string;
  trace_id: string | null;
  schema_version: string;
  created_at: string;
  parsedData: Record<string, unknown>;
};

export type ReviewDetail = {
  permissions: { canRead: true; canMutate: boolean };
  record: {
    id: string;
    importJobId: string;
    sourceId: string;
    sourceName: string;
    externalRecordId: string;
    recordType: string;
    sourceUrl: string | null;
    confidence: number;
    status: string;
    reviewState: string;
    traceId: string | null;
    schemaVersion: string;
    parsedData: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };
  claims: Array<{
    id: string;
    claimKey: string;
    originalValue: unknown;
    normalizedValue: unknown;
    unit: string | null;
    confidence: number;
    evidenceLocator: string;
    classification: string;
    aiInferred: boolean;
    applicableRevision: string | null;
  }>;
  evidence: Array<{
    id: string;
    sourceClass: string;
    sourceUrl: string;
    immutableExternalUrl: string | null;
    retrievedAt: string;
    applicableRevision: string | null;
    detectedMediaType: string | null;
    byteSize: number | null;
    contentSha256: string | null;
    authorizedContentUrl: string | null;
    retentionState: string;
    policy: {
      robotsStatus: string;
      termsStatus: string;
      reuseStatus: string;
      decision: string;
    };
  }>;
  previews: Array<{
    kind: string;
    text: string;
    byteSize: number;
    originalByteSize: number;
    truncated: boolean;
  }>;
  candidates: Array<Record<string, unknown>>;
  conflicts: Array<Record<string, unknown> & { id: string; members: Array<{ claimId: string; role: string }> }>;
  lifecycle: Array<Record<string, unknown> & { timestamp: string }>;
  proposedMutation: {
    diff: Record<string, unknown>;
    hash: string;
  };
};

export const dataReviewApi = {
  list: (status = "pending", signal?: AbortSignal) =>
    api.get<{ items: ReviewQueueItem[]; permissions: { canRead: true; canMutate: boolean } }>(
      `/api/v1/admin/import-records?status=${encodeURIComponent(status)}`,
      { signal, retry: false },
    ),
  detail: (
    id: string,
    options: { decision?: "create" | "merge"; canonicalEntityId?: string | null } = {},
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams();
    if (options.decision) query.set("decision", options.decision);
    if (options.canonicalEntityId) query.set("canonicalEntityId", options.canonicalEntityId);
    const suffix = query.size ? `?${query.toString()}` : "";
    return api.get<ReviewDetail>(`/api/v1/admin/import-records/${encodeURIComponent(id)}${suffix}`, {
      signal,
      retry: false,
    });
  },
  approve: (
    id: string,
    input: { decision: "create" | "merge"; canonicalEntityId?: string | null; expectedDiffHash: string },
  ) => api.post(`/api/v1/admin/import-records/${encodeURIComponent(id)}/approve`, input),
  reject: (id: string, reason: string) =>
    api.post(`/api/v1/admin/import-records/${encodeURIComponent(id)}/reject`, { reason }),
  defer: (id: string, reason: string, reviewAfter?: string | null) =>
    api.post(`/api/v1/admin/import-records/${encodeURIComponent(id)}/defer`, {
      reason,
      reviewAfter: reviewAfter || null,
    }),
  recordConflict: (id: string, claimIds: string[], conflictType: string) =>
    api.post(`/api/v1/admin/import-records/${encodeURIComponent(id)}/conflicts`, {
      claimIds,
      conflictType,
    }),
};
