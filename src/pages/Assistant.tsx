import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Bot, Loader2, Plus, Send, Sparkle, Trash2, Wrench, Cpu, Package, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputSubmit, PromptInputFooter } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  chatEndpoint,
  createThread,
  deleteThread,
  listThreads,
  loadMessages,
  renameThread,
  type ChatThread,
} from "@/lib/assistant";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  { icon: Cpu, label: "Recommend a 6-DOF arm control MCU under $30" },
  { icon: Package, label: "Compare NEMA-17 stepper motors in the catalog" },
  { icon: FolderKanban, label: "Show me open beginner-friendly projects" },
  { icon: Wrench, label: "Estimate BOM cost for the OpenTorque arm" },
];

export default function Assistant() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId?: string }>();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate("/auth?redirect=/assistant", { replace: true });
  }, [authLoading, user, navigate]);

  // Load thread list
  const refreshThreads = async () => {
    try {
      const list = await listThreads();
      setThreads(list);
      return list;
    } finally {
      setLoadingThreads(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    refreshThreads();
  }, [user]);

  // Bootstrap: if no threadId in URL, pick most recent or create one.
  useEffect(() => {
    if (!user || bootstrappedRef.current) return;
    if (threadId) { bootstrappedRef.current = true; return; }
    bootstrappedRef.current = true;
    (async () => {
      const list = await refreshThreads();
      if (list.length > 0) {
        navigate(`/assistant/${list[0].id}`, { replace: true });
      } else {
        const t = await createThread();
        setThreads([t]);
        navigate(`/assistant/${t.id}`, { replace: true });
      }
    })();
  }, [user, threadId, navigate]);

  // Load messages for the active thread
  useEffect(() => {
    if (!threadId) { setInitialMessages(null); return; }
    setInitialMessages(null);
    loadMessages(threadId).then(setInitialMessages).catch((e) => {
      console.error(e);
      setInitialMessages([]);
    });
  }, [threadId]);

  const handleNewThread = async () => {
    try {
      const t = await createThread();
      setThreads((prev) => [t, ...prev]);
      navigate(`/assistant/${t.id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not create chat");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteThread(id);
      const rest = threads.filter((t) => t.id !== id);
      setThreads(rest);
      if (threadId === id) {
        if (rest.length > 0) navigate(`/assistant/${rest[0].id}`, { replace: true });
        else handleNewThread();
      }
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-7xl gap-0 border-t bg-background">
      {/* Sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r bg-muted/30 md:flex">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <div className="text-sm font-semibold">Build Assistant</div>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={handleNewThread} title="New chat">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-0.5 p-2">
            {loadingThreads && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">Loading…</div>
            )}
            {!loadingThreads && threads.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">No conversations yet.</div>
            )}
            {threads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={t.id === threadId}
                onSelect={() => navigate(`/assistant/${t.id}`)}
                onDelete={() => handleDelete(t.id)}
              />
            ))}
          </div>
        </ScrollArea>
        <div className="border-t px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Grounded in the RoboPartPicker catalog. Responses may include tool calls to parts, projects, and BOMs.
        </div>
      </aside>

      {/* Chat pane */}
      <main className="flex min-w-0 flex-1 flex-col">
        {threadId && initialMessages !== null ? (
          <ChatWindow key={threadId} threadId={threadId} initialMessages={initialMessages} onFirstReply={refreshThreads} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </main>
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  onSelect,
  onDelete,
}: {
  thread: ChatThread;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
        active ? "bg-background shadow-sm" : "hover:bg-background/60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 truncate text-left"
        title={thread.title}
      >
        {thread.title}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (confirm("Delete this conversation?")) onDelete(); }}
        className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-destructive group-hover:opacity-100"
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ChatWindow({
  threadId,
  initialMessages,
  onFirstReply,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  onFirstReply: () => void;
}) {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: chatEndpoint(),
        prepareSendMessagesRequest: async ({ messages, id, body }) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          return {
            body: { messages, threadId: id, ...body },
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              "Content-Type": "application/json",
            },
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: (e) => {
      console.error(e);
      toast.error(e.message ?? "Assistant error");
    },
    onFinish: () => {
      onFirstReply();
      setTimeout(() => composerRef.current?.focus(), 0);
    },
  });

  // Focus composer on mount / thread change
  useEffect(() => { composerRef.current?.focus(); }, [threadId]);

  const isBusy = status === "submitted" || status === "streaming";

  const handleSubmit = async ({ text }: { text: string }) => {
    const t = text.trim();
    if (!t || isBusy) return;
    await sendMessage({ text: t });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-4 py-6">
          {messages.length === 0 && (
            <EmptyState onPick={(text) => sendMessage({ text })} disabled={isBusy} />
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {isBusy && messages[messages.length - 1]?.role !== "assistant" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Thinking…</Shimmer>
              </MessageContent>
            </Message>
          )}
          {error && (
            <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.message}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t bg-background px-4 py-3">
        <div className="mx-auto w-full max-w-3xl">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea
              ref={composerRef as any}
              placeholder="Ask about parts, projects, or BOM cost…"
              disabled={isBusy}
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status as any} disabled={isBusy} />
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            The assistant can look up parts, projects, and estimate BOM costs. Verify pricing before ordering.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  return (
    <ConversationEmptyState
      icon={
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Bot className="h-6 w-6" />
        </div>
      }
      title="Build Assistant"
      description="Grounded in the RoboPartPicker catalog of parts, suppliers, and standardized projects. Ask a question or start with one of these:"
    >
      <div className="mt-4 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.label}
              type="button"
              disabled={disabled}
              onClick={() => onPick(s.label)}
              className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5 text-left text-sm hover:border-primary/40 hover:bg-accent disabled:opacity-60"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>
    </ConversationEmptyState>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  return (
    <Message from={message.role}>
      <MessageContent>
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            if (message.role === "user") return <p key={i} className="whitespace-pre-wrap">{part.text}</p>;
            return (
              <div key={i} className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-pre:my-2 prose-headings:mt-3 prose-headings:mb-2 prose-a:text-primary">
                <ReactMarkdown
                  components={{
                    a: ({ href, children, ...p }) => {
                      const isInternal = typeof href === "string" && href.startsWith("/");
                      return (
                        <a href={href} target={isInternal ? undefined : "_blank"} rel="noreferrer" {...p}>
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {part.text}
                </ReactMarkdown>
              </div>
            );
          }
          if (part.type?.startsWith("tool-")) {
            const tp = part as any;
            const name = part.type.replace(/^tool-/, "");
            const state = tp.state as string | undefined;
            const output = tp.output;
            return (
              <details key={i} className="my-1 rounded-md border bg-muted/40 text-xs">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5">
                  <Sparkle className="h-3.5 w-3.5 text-primary" />
                  <span className="font-mono">{name}</span>
                  <span className="ml-auto text-muted-foreground">
                    {state === "output-available" ? "done" : state ?? "…"}
                  </span>
                </summary>
                <div className="max-h-64 overflow-auto border-t px-3 py-2">
                  {tp.input && (
                    <>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Input</div>
                      <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px]">{JSON.stringify(tp.input, null, 2)}</pre>
                    </>
                  )}
                  {output !== undefined && (
                    <>
                      <div className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">Output</div>
                      <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px]">{JSON.stringify(output, null, 2)}</pre>
                    </>
                  )}
                </div>
              </details>
            );
          }
          return null;
        })}
      </MessageContent>
    </Message>
  );
}