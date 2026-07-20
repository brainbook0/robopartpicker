import type { UIMessage } from "ai";
import { api } from "@/lib/api/client";

export type ChatThread = { id: string; title: string; updated_at?: string; created_at?: string; updatedAt?: string; createdAt?: string };

export async function listThreads(): Promise<ChatThread[]> { return (await api.get<{ items: ChatThread[] }>("/api/v1/ai/conversations", { retry: false })).items; }
export async function createThread(): Promise<ChatThread> { return (await api.post<{ item: ChatThread }>("/api/v1/ai/conversations", { title: "New chat" })).item; }
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
