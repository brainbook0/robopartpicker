import { api } from "./client";

export type ImportJob = {
  id: string;
  status: string;
  progress_percent: number;
  current_stage: string | null;
  processor_kind: string | null;
  result_summary?: Record<string, unknown>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancellation_requested?: number;
};

export type ImportJobFile = {
  id: string;
  source_path: string;
  media_type: string;
  format_key: string;
  processor_kind: string;
  status: string;
  progress_percent: number;
  warnings?: unknown[];
  missing_dependencies?: unknown[];
  result?: Record<string, unknown>;
  last_error: string | null;
};

export type RobotStructure = {
  snapshot: Record<string, unknown>;
  links: Array<Record<string, unknown> & { id: string; name: string; parent_link_name?: string | null; mass_kg?: number | null }>;
  joints: Array<Record<string, unknown> & { id: string; name: string; joint_type: string; parent_link_name?: string | null; child_link_name?: string | null }>;
  candidates: Array<Record<string, unknown> & { id: string; candidate_name: string; classification: string; review_status: string; confidence: number; notes?: string | null }>;
};

export const importJobsApi = {
  list: (signal?: AbortSignal) => api.get<{ items: ImportJob[]; total: number }>("/api/v1/imports/project-jobs", { signal, retry: false }),
  get: (id: string, signal?: AbortSignal) => api.get<{ item: ImportJob; files: ImportJobFile[]; events: Array<Record<string, unknown>> }>(`/api/v1/imports/project-jobs/${encodeURIComponent(id)}`, { signal, retry: false }),
  create: (fileIds: string[], projectId?: string | null) => api.post<{ item: ImportJob }>("/api/v1/imports/project-jobs", { fileIds, projectId: projectId ?? null, idempotencyKey: crypto.randomUUID() }),
  cancel: (id: string) => api.post(`/api/v1/imports/project-jobs/${encodeURIComponent(id)}/cancel`),
  retry: (id: string) => api.post(`/api/v1/imports/project-jobs/${encodeURIComponent(id)}/retry`),
  structure: (id: string, signal?: AbortSignal) => api.get<RobotStructure>(`/api/v1/imports/project-jobs/${encodeURIComponent(id)}/robot-structure`, { signal, retry: false }),
  reviewCandidate: (jobId: string, candidateId: string, input: { decision: "confirmed" | "rejected" | "merged" | "split" | "annotated"; classification?: "purchasable" | "fabricated" | "assembly" | "unresolved"; notes?: string }) => api.patch(`/api/v1/imports/project-jobs/${encodeURIComponent(jobId)}/robot-candidates/${encodeURIComponent(candidateId)}`, { ...input, payload: {} }),
};

export type ConversationSummary = {
  id: string;
  context_type: "marketplace" | "project" | "build" | "general";
  context_id: string | null;
  status: string;
  my_request_status: string;
  other_user_id: string;
  other_username: string | null;
  other_name: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
};

export type ConversationDetail = {
  item: Record<string, unknown> & { id: string; status: string; context_type: string; context_id: string | null };
  membership: { role: string; request_status: string };
  participants: Array<{ user_id: string; role: string; request_status: string; username: string | null; name: string; avatar_url: string | null }>;
  messages: Array<{ id: string; sender_user_id: string; sender_name: string; body_markdown: string; attachment_file_id: string | null; status: string; created_at: string }>;
};

export const messagesApi = {
  list: (signal?: AbortSignal) => api.get<{ items: ConversationSummary[] }>("/api/v1/messages/conversations", { signal, retry: false }),
  get: (id: string, signal?: AbortSignal) => api.get<ConversationDetail>(`/api/v1/messages/conversations/${encodeURIComponent(id)}`, { signal, retry: false }),
  create: (input: { recipientUserId: string; contextType?: "marketplace" | "project" | "build" | "general"; contextId?: string; message?: string }) => api.post<{ id: string; status: string }>("/api/v1/messages/conversations", input),
  respond: (id: string, accept: boolean) => api.post(`/api/v1/messages/conversations/${encodeURIComponent(id)}/respond`, { accept }),
  send: (id: string, bodyMarkdown: string, attachmentFileId?: string) => api.post(`/api/v1/messages/conversations/${encodeURIComponent(id)}/messages`, { bodyMarkdown, attachmentFileId }),
  block: (blockedUserId: string, reason?: string) => api.post("/api/v1/messages/block", { blockedUserId, reason }),
  report: (id: string, reason: string, details?: string, messageId?: string) => api.post(`/api/v1/messages/conversations/${encodeURIComponent(id)}/report`, { reason, details, messageId }),
};

export type TechnicalRecord = Record<string, unknown> & { id: string; record_type: string; title: string; result_text: string; confidence: number; verification_state: string; created_at: string };
export type MissingInformation = Record<string, unknown> & { id: string; question: string; reliability_reason: string; status: string; missing_fields?: string[]; suggested_sources?: string[]; response_count: number; created_at: string };
export type ProjectReproduction = {
  id: string;
  release_version: string;
  created_at: string;
  outcome: "succeeded" | "partially_succeeded" | "failed" | "abandoned" | null;
  independence: "maintainer" | "independent" | null;
  submitted_at: string | null;
  outcome_summary: string | null;
  builder_username: string | null;
  builder_name: string | null;
  builder_avatar_url: string | null;
  attribution_public: 0 | 1;
  evidence_count: number;
};

export const projectSystemsApi = {
  technicalRecords: (projectId: string, signal?: AbortSignal) => api.get<{ items: TechnicalRecord[] }>(`/api/v1/technical-records?projectId=${encodeURIComponent(projectId)}`, { signal, retry: false }),
  createTechnicalRecord: (input: Record<string, unknown>) => api.post<{ id: string }>("/api/v1/technical-records", input),
  missingInformation: (projectId: string, signal?: AbortSignal) => api.get<{ items: MissingInformation[] }>(`/api/v1/projects/${encodeURIComponent(projectId)}/missing-information`, { signal, retry: false }),
  reproductions: (projectId: string, signal?: AbortSignal) => api.get<{ items: ProjectReproduction[]; publicAttributionCount: number; privateAttributionCount: number }>(`/api/v1/projects/${encodeURIComponent(projectId)}/reproductions`, { signal, retry: false }),
  informationGap: (id: string, signal?: AbortSignal) => api.get<{ item: MissingInformation & { project_id: string }; responses: Array<Record<string, unknown> & { id: string; response_text: string; status: string; responder_name?: string; responder_username?: string; sources?: Array<Record<string, unknown>>; created_at: string }> }>(`/api/v1/missing-information/${encodeURIComponent(id)}`, { signal, retry: false }),
  createMissingInformation: (projectId: string, input: Record<string, unknown>) => api.post<{ id: string }>(`/api/v1/projects/${encodeURIComponent(projectId)}/missing-information`, input),
  respondToInformationGap: (id: string, input: { responseText: string; sources: Array<Record<string, unknown>>; fileIds: string[] }) => api.post<{ id: string }>(`/api/v1/missing-information/${encodeURIComponent(id)}/responses`, input),
  reviewInformationResponse: (id: string, decision: "approve" | "reject", notes?: string) => api.post(`/api/v1/missing-information/responses/${encodeURIComponent(id)}/review`, { decision, notes }),
  subscribeToInformationGap: (id: string) => api.post(`/api/v1/missing-information/${encodeURIComponent(id)}/subscribe`),
  collaborators: (projectId: string, signal?: AbortSignal) => api.get<{ items: Array<Record<string, unknown>> }>(`/api/v1/projects/${encodeURIComponent(projectId)}/collaborators`, { signal, retry: false }),
  inviteCollaborator: (projectId: string, username: string, role: string) => api.post(`/api/v1/projects/${encodeURIComponent(projectId)}/collaborators`, { username, role }),
  respondToProjectInvitation: (projectId: string, accept: boolean) => api.post(`/api/v1/projects/${encodeURIComponent(projectId)}/collaborators/respond`, { accept }),
  analytics: (projectId: string, days = 30, signal?: AbortSignal) => api.get<Record<string, unknown> & { privateMetrics: Record<string, number>; series: Array<Record<string, unknown>> }>(`/api/v1/projects/${encodeURIComponent(projectId)}/analytics?days=${days}`, { signal, retry: false }),
  recordAnalytics: (projectId: string, eventType: string, sessionId: string) => api.post(`/api/v1/projects/${encodeURIComponent(projectId)}/analytics/events`, { eventType, sessionId, metadata: {} }),
};

export type AiFrictionRecord = Record<string, unknown> & { id: string; feature: string; category: string; resolution_status: string; created_at: string };
export const improvementApi = {
  list: (signal?: AbortSignal) => api.get<{ items: AiFrictionRecord[] }>("/api/v1/ai/friction", { signal, retry: false }),
  remove: (id: string) => api.delete(`/api/v1/ai/friction/${encodeURIComponent(id)}`),
};

export const operationsApi = {
  overview: (signal?: AbortSignal) => api.get<Record<string, number | boolean>>("/api/v1/admin/operations/overview", { signal, retry: false }),
  queues: (signal?: AbortSignal) => api.get<Record<string, Array<Record<string, unknown>>>>("/api/v1/admin/operations/queues", { signal, retry: false }),
  cases: (signal?: AbortSignal) => api.get<{ items: Array<Record<string, unknown> & { id: string; title: string; case_type: string; status: string; priority: string; created_at: string }> }>("/api/v1/admin/operations/cases", { signal, retry: false }),
  updateCase: (id: string, input: Record<string, unknown>) => api.patch(`/api/v1/admin/operations/cases/${encodeURIComponent(id)}`, input),
};

export type PartOut = Record<string, unknown> & { id: string; status: string; currency: string };
export const partOutApi = {
  list: (signal?: AbortSignal) => api.get<{ items: PartOut[] }>("/api/v1/marketplace/part-outs", { signal, retry: false }),
  get: (id: string, signal?: AbortSignal) => api.get<{ item: PartOut; items: Array<Record<string, unknown> & { id: string; description: string; presence_status: string; condition_grade: string | null; draft_listing_id: string | null }>; bundles: Array<Record<string, unknown>>; estimates: Array<Record<string, unknown>> }>(`/api/v1/marketplace/part-outs/${encodeURIComponent(id)}`, { signal, retry: false }),
  create: (input: Record<string, unknown>) => api.post<{ id: string }>("/api/v1/marketplace/part-outs", input),
  updateItem: (id: string, itemId: string, input: Record<string, unknown>) => api.patch(`/api/v1/marketplace/part-outs/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, input),
  estimate: (id: string, input: Record<string, unknown>) => api.post<{ estimates: Array<Record<string, unknown>> }>(`/api/v1/marketplace/part-outs/${encodeURIComponent(id)}/estimates`, input),
  createDrafts: (id: string, itemIds: string[], bundleIds: string[] = []) => api.post<{ items: Array<{ listingId: string }> }>(`/api/v1/marketplace/part-outs/${encodeURIComponent(id)}/draft-listings`, { itemIds, bundleIds }),
};

export type BomVerificationDetail = {
  item: Record<string, unknown> & { id: string; status: string; current_version_id: string; source_type: string; project_id: string | null };
  versions: Array<Record<string, unknown> & { id: string; version_number: number; snapshot?: Record<string, unknown>; change_description: string; created_at: string }>;
  lines: Array<Record<string, unknown> & { id: string; version_id: string; line_key: string; raw_text: string; quantity: number | null; status: string; confidence: number; identity?: Record<string, unknown>; component_id: string | null; notes: string | null }>;
  reviews: Array<Record<string, unknown> & { id: string; decision: string; notes: string; created_at: string }>;
};
export const bomVerificationApi = {
  get: (id: string, signal?: AbortSignal) => api.get<BomVerificationDetail>(`/api/v1/bom-verifications/${encodeURIComponent(id)}`, { signal, retry: false }),
  correct: (id: string, snapshot: Record<string, unknown>, lines: Array<Record<string, unknown>>, changeDescription: string) => api.post(`/api/v1/bom-verifications/${encodeURIComponent(id)}/versions`, { snapshot, lines, changeDescription }),
  submit: (id: string) => api.post(`/api/v1/bom-verifications/${encodeURIComponent(id)}/submit`),
  review: (id: string, decision: "request_changes" | "verify" | "dispute" | "reject", notes: string) => api.post(`/api/v1/bom-verifications/${encodeURIComponent(id)}/reviews`, { decision, notes }),
};
