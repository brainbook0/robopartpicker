import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listThreads, timeAgo, threadTypeLabel, type ThreadWithMeta, type RelatedEntityType } from "@/lib/forum";
import { MessageSquare, CheckCircle2, HelpCircle, Lock, Plus } from "lucide-react";

export function RelatedDiscussionList({
  relatedType,
  relatedId,
  limit = 5,
  title = "Community discussions",
  compact = true,
}: {
  relatedType: RelatedEntityType;
  relatedId: string;
  limit?: number;
  title?: string;
  compact?: boolean;
}) {
  const [threads, setThreads] = useState<ThreadWithMeta[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listThreads({ relatedType, relatedId, limit, sort: "recent" })
      .then(t => { if (alive) setThreads(t); })
      .catch(e => { if (alive) setErr(e.message ?? "Load failed"); });
    return () => { alive = false; };
  }, [relatedType, relatedId, limit]);

  const newHref = `/community/new?relatedType=${relatedType}&relatedId=${encodeURIComponent(relatedId)}`;

  return (
    <section className="surface-card">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <div className="section-title flex items-center gap-2">
          <MessageSquare className="h-3 w-3" /> {title}
          {threads && <span className="pill mono text-[10px]">{threads.length}</span>}
        </div>
        <Link to={newHref} className="btn-ghost btn-sm" aria-label="Start a discussion about this">
          <Plus className="h-3 w-3" /> Start discussion
        </Link>
      </div>
      <div className={compact ? "p-2" : "p-3"}>
        {err && <div className="text-[11px] text-destructive px-1">Could not load discussions: {err}</div>}
        {!err && !threads && <div className="text-[11px] text-muted-foreground px-1 py-2">Loading…</div>}
        {threads && threads.length === 0 && (
          <div className="text-[11px] text-muted-foreground px-1 py-2">
            No discussions linked to this yet. <Link to={newHref} className="text-primary hover:underline">Start one →</Link>
          </div>
        )}
        <ul className="divide-y divide-border/60">
          {(threads ?? []).map(t => (
            <li key={t.id}>
              <Link to={`/community/t/${t.id}`} className="flex items-start gap-2 px-1 py-1.5 hover:bg-muted/40 rounded">
                <div className="mt-0.5 shrink-0 text-muted-foreground">
                  {t.status === "solved" ? <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--positive))]" /> :
                   t.status === "closed" ? <Lock className="h-3.5 w-3.5" /> :
                   t.thread_type === "question" ? <HelpCircle className="h-3.5 w-3.5" /> :
                   <MessageSquare className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium truncate">{t.title}</div>
                  <div className="text-[10.5px] text-muted-foreground truncate">
                    {threadTypeLabel[t.thread_type]} · {t.reply_count} replies · {timeAgo(t.last_activity_at)}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}