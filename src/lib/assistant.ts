import { supabase } from "@/integrations/supabase/client";
import type { UIMessage } from "ai";

export type ChatThread = {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
};

export type StoredMessageRow = {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system";
  parts: UIMessage["parts"];
  created_at: string;
};

export async function listThreads(): Promise<ChatThread[]> {
  const { data, error } = await supabase
    .from("chat_threads")
    .select("id,title,updated_at,created_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChatThread[];
}

export async function createThread(): Promise<ChatThread> {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("chat_threads")
    .insert({ user_id: userRes.user.id, title: "New chat" })
    .select("id,title,updated_at,created_at")
    .single();
  if (error) throw error;
  return data as ChatThread;
}

export async function deleteThread(id: string): Promise<void> {
  const { error } = await supabase.from("chat_threads").delete().eq("id", id);
  if (error) throw error;
}

export async function renameThread(id: string, title: string): Promise<void> {
  await supabase.from("chat_threads").update({ title }).eq("id", id);
}

export async function loadMessages(threadId: string): Promise<UIMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id,role,parts,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    role: r.role,
    parts: (r.parts as any) ?? [],
  })) as UIMessage[];
}

export function chatEndpoint(): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
}