import type { UIMessage } from "ai";
import { api } from "@/lib/api/client";

export type ChatThread = { id: string; title: string; updated_at?: string; created_at?: string; updatedAt?: string; createdAt?: string };

export async function listThreads(): Promise<ChatThread[]> { return (await api.get<{ items: ChatThread[] }>("/api/v1/ai/conversations", { retry: false })).items; }
export async function createThread(): Promise<ChatThread> { return (await api.post<{ item: ChatThread }>("/api/v1/ai/conversations", { title: "New chat" })).item; }
export async function deleteThread(id: string): Promise<void> { await api.delete(`/api/v1/ai/conversations/${encodeURIComponent(id)}`); }
export async function renameThread(id: string, title: string): Promise<void> { await api.patch(`/api/v1/ai/conversations/${encodeURIComponent(id)}`, { title }); }
export async function loadMessages(threadId: string): Promise<UIMessage[]> { return (await api.get<{ items: UIMessage[] }>(`/api/v1/ai/conversations/${encodeURIComponent(threadId)}/messages`, { retry: false })).items; }
export function chatEndpoint(): string { return "/api/v1/ai/chat"; }
