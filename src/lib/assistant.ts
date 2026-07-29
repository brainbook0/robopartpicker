import type { UIMessage } from "ai";
import { api } from "@/lib/api/client";

export type ChatThread = { id: string; title: string; projectId?: string | null; buildId?: string | null; updated_at?: string; created_at?: string; updatedAt?: string; createdAt?: string };

export async function listThreads(): Promise<ChatThread[]> { return (await api.get<{ items: ChatThread[] }>("/api/v1/ai/conversations", { retry: false })).items; }
export async function createThread(input: { title?: string; projectId?: string; buildId?: string } = {}): Promise<ChatThread> { return (await api.post<{ item: ChatThread }>("/api/v1/ai/conversations", { title: input.title ?? "New chat", projectId: input.projectId ?? null, buildId: input.buildId ?? null })).item; }
export async function deleteThread(id: string): Promise<void> { await api.delete(`/api/v1/ai/conversations/${encodeURIComponent(id)}`); }
export async function renameThread(id: string, title: string): Promise<void> { await api.patch(`/api/v1/ai/conversations/${encodeURIComponent(id)}`, { title }); }
export async function loadMessages(threadId: string): Promise<UIMessage[]> { return (await api.get<{ items: UIMessage[] }>(`/api/v1/ai/conversations/${encodeURIComponent(threadId)}/messages`, { retry: false })).items; }
export function chatEndpoint(): string { return "/api/v1/ai/chat"; }

export type AiFormKind = "project" | "build" | "community_thread" | "marketplace_listing" | "marketplace_wanted" | "build_record" | "release_proposal";
export type AiFormDraft = Record<string, unknown>;

export async function createFormDraft(form: AiFormKind, prompt: string, current: Record<string, unknown>): Promise<AiFormDraft> {
  return (await api.post<{ draft: AiFormDraft }>("/api/v1/ai/form-drafts", { form, prompt, current })).draft;
}

export type SubmissionKind = "project" | "build" | "community_thread" | "marketplace_listing" | "marketplace_wanted";
export type SubmissionQualityReview = {
  decision: "meets_standard" | "needs_changes";
  summary: string;
  strengths: string[];
  issues: Array<{ severity: "blocker" | "warning" | "suggestion"; field?: string; message: string; suggestedChange: string }>;
  missingEvidence: string[];
};

export async function reviewSubmission(
  submissionType: SubmissionKind,
  narrative: string,
  submission: Record<string, unknown>,
): Promise<SubmissionQualityReview> {
  return (await api.post<{ review: SubmissionQualityReview }>("/api/v1/ai/quality-reviews", { submissionType, narrative, submission })).review;
}

export async function confirmProposal(id: string): Promise<unknown> {
  return api.post(`/api/v1/ai/tool-calls/${encodeURIComponent(id)}/confirm`, { confirm: true });
}

export async function rejectProposal(id: string): Promise<void> {
  await api.post(`/api/v1/ai/tool-calls/${encodeURIComponent(id)}/reject`, {});
}

export type AiProposalStatus = { id: string; toolName: string; status: "proposed" | "confirmed" | "running" | "succeeded" | "failed" | "rejected"; requiresConfirmation: boolean; output: unknown };
export async function getProposalStatus(id: string): Promise<AiProposalStatus> {
  return (await api.get<{ item: AiProposalStatus }>(`/api/v1/ai/tool-calls/${encodeURIComponent(id)}`, { retry: false })).item;
}

export type ContextualAiActionType =
  | "generate_draft" | "fill_from_files" | "extract_structured_information" | "explain_field"
  | "recommend_missing_information" | "improve_writing" | "check_consistency" | "compare_options"
  | "suggest_substitutions" | "refine_search" | "summarize_evidence" | "structure_record"
  | "replace_bom" | "canonical_publication" | "marketplace_pricing" | "compatibility_claim";

export type ContextualAiAction = {
  id: string;
  status: "preview" | "edited" | "applied" | "rejected" | "undone" | "expired";
  actionType: ContextualAiActionType;
  surface: string;
  highImpact: boolean;
  explicitConfirmationRequired: boolean;
  currentValues: Record<string, unknown>;
  proposedValues: Record<string, unknown>;
  fieldsChanged: string[];
  sources: Array<{ id: string; type: string; label: string; internalPath?: string; sourceUrl?: string; revision?: string }>;
  contextUsed: Array<Record<string, unknown>>;
  factInference: Array<{ field: string; kind: "fact" | "inference"; confidence: number; sourceIds: string[]; rationale: string }>;
  missingInformation: Array<{ field: string; reason: string; suggestedSources: string[] }>;
  confidence: number;
  summary?: string | null;
  execution?: { provider?: string; model?: string; promptVersionId?: string | null; taskRunId?: string; latencyMs?: number; costMicrounits?: number; cacheHit?: boolean; toolCalls?: unknown[] };
  createdAt: string;
  updatedAt: string;
};

export async function previewContextualAction(input: {
  actionType: ContextualAiActionType; form: AiFormKind; surface: string; instruction: string; current: Record<string, unknown>;
  projectId?: string; buildId?: string; conversationId?: string; fileIds?: string[]; targetEntityType?: string; targetEntityId?: string;
  sensitivity?: "public" | "private" | "restricted";
}): Promise<ContextualAiAction> {
  return (await api.post<{ action: ContextualAiAction }>("/api/v1/ai/actions/preview", { fileIds: [], sensitivity: "private", ...input })).action;
}

export async function editContextualAction(id: string, proposedValues: Record<string, unknown>, correction?: string): Promise<ContextualAiAction> {
  return (await api.patch<{ action: ContextualAiAction }>(`/api/v1/ai/actions/${encodeURIComponent(id)}`, { proposedValues, correction })).action;
}

export async function applyContextualAction(id: string, confirm: boolean): Promise<{ proposedValues: Record<string, unknown>; undoValues: Record<string, unknown>; persisted: false }> {
  return api.post(`/api/v1/ai/actions/${encodeURIComponent(id)}/apply`, { confirm });
}

export async function rejectContextualAction(id: string, reason?: string): Promise<void> {
  await api.post(`/api/v1/ai/actions/${encodeURIComponent(id)}/reject`, { reason });
}

export async function undoContextualAction(id: string): Promise<{ restoreValues: Record<string, unknown>; persisted: false }> {
  return api.post(`/api/v1/ai/actions/${encodeURIComponent(id)}/undo`, {});
}

export async function recordAiFriction(input: {
  category: "repeated_request" | "user_correction" | "action_failed" | "tool_failed" | "scope_misunderstanding" | "false_action_claim" | "immediate_undo" | "abandoned_form" | "information_unavailable" | "unnecessary_clarification" | "wrong_answer" | "other";
  feature: string; context?: Record<string, unknown>; userCorrection?: string; projectId?: string; buildId?: string; conversationId?: string;
  actionId?: string; resultDisposition?: "accepted" | "edited" | "rejected" | "undone" | "abandoned"; privacyState?: "public" | "private" | "restricted";
}): Promise<void> {
  await api.post("/api/v1/ai/friction", { context: {}, privacyState: "private", ...input });
}
