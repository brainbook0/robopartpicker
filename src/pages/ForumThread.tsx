import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  getThread, getThreadPosts,
  type ForumThreadRow, type ForumPost, type ProfileMini,
  authorName, authorInitials, timeAgo,
  threadTypeLabel, resolveRelated, type ResolvedRelated,
  updateThreadStatus, setAcceptedAnswer, contributorStatsFor,
} from "@/lib/forum";
import { toast } from "@/hooks/use-toast";
import {
  Heart, MessageSquare, Eye, Lock, Pin, Reply, Trash2,
  CheckCircle2, Bookmark, BookmarkCheck, Link2, ClipboardCopy, Unlock, HelpCircle,
} from "lucide-react";

const EMOJIS = ["👍", "❤️", "🚀", "🧠", "👀", "🔥"];
const BOOKMARK_KEY = "rpp:forum:bookmarks";

function readBookmarks(): string[] {
  try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "[]"); } catch { return []; }
}
function writeBookmarks(ids: string[]) { localStorage.setItem(BOOKMARK_KEY, JSON.stringify(ids)); }

const replyGuidance: Record<string, string> = {
  question: "Answer the specific question. Cite measurements or documentation where possible.",
  build_log: "Constructive feedback, comparable measurements, or gotchas from your own build.",
  integration_report: "Corroborate or challenge with your own integration data; note different revisions.",
  substitution_report: "Confirm or challenge with your own substitution data on comparable revisions.",
  bom_correction: "Confirm or dispute the correction with evidence. Note affected versions.",
  supplier_report: "Share your own experience. Do not repeat unsupported accusations.",
  teardown: "Add observations, better evidence, or corrections to identifications.",
  project_update: "Note compatibility impact for downstream forks.",
  measured_test: "Corroborate with your own runs. Report method, instruments, and spread.",
  discussion: "Stay on topic. Prefer concrete detail over opinion.",
};

export default function ForumThreadPage() {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [thread, setThread] = useState<ForumThreadRow | null>(null);
  const [opAuthor, setOpAuthor] = useState<ProfileMini | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [acceptBusy, setAcceptBusy] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [category, setCategory] = useState<{ id: string; slug: string; name: string; color: string } | null>(null);
  const [myReactions, setMyReactions] = useState<Record<string, string[]>>({});
  const [counts, setCounts] = useState<Record<string, Record<string, number>>>({});
  const [related, setRelated] = useState<ResolvedRelated | null>(null);
  const [contribStats, setContribStats] = useState<Map<string, { threads: number; replies: number; reactions: number; accepted: number }>>(new Map());
  const [bookmarks, setBookmarks] = useState<string[]>([]);

  useEffect(() => { setBookmarks(readBookmarks()); }, []);

  const refresh = useCallback(async () => {
    if (!id) return;
    const t = await getThread(id);
    setThread(t);
    if (!t) return;
    // OP author explicitly
    const { data: opProfile } = await supabase
      .from("profiles").select("id, display_name, username, avatar_url")
      .eq("id", t.user_id).maybeSingle();
    setOpAuthor((opProfile as ProfileMini) ?? null);
    // Category
    const { data: catRow } = await supabase
      .from("forum_categories").select("id, slug, name, color")
      .eq("id", t.category_id).maybeSingle();
    setCategory((catRow as any) ?? null);
    // Related
    setRelated(await resolveRelated(t.related_entity_type, t.related_entity_id));
    // Posts
    const p = await getThreadPosts(t.id);
    setPosts(p);
    // Reactions
    const postIdsList = p.map(x => x.id);
    const orParts: string[] = [`thread_id.eq.${t.id}`];
    if (postIdsList.length) orParts.push(`post_id.in.(${postIdsList.join(",")})`);
    const { data: rx } = await supabase.from("forum_reactions").select("*").or(orParts.join(","));
    const c: Record<string, Record<string, number>> = {};
    const mine: Record<string, string[]> = {};
    (rx ?? []).forEach((r: any) => {
      const tid = r.post_id ?? r.thread_id;
      c[tid] = c[tid] || {};
      c[tid][r.emoji] = (c[tid][r.emoji] || 0) + 1;
      if (user && r.user_id === user.id) {
        mine[tid] = mine[tid] || [];
        mine[tid].push(r.emoji);
      }
    });
    setCounts(c);
    setMyReactions(mine);
    // Contributor stats for OP + reply authors
    const uids = [t.user_id, ...p.map(x => x.user_id)];
    setContribStats(await contributorStatsFor(uids));
  }, [id, user]);

  useEffect(() => { setLoading(true); refresh().finally(() => setLoading(false)); }, [refresh]);

  const isOP = !!(user && thread && user.id === thread.user_id);
  const isBookmarked = !!(thread && bookmarks.includes(thread.id));
  const canReply = !!thread && !thread.locked && thread.status !== "closed";

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { nav("/auth", { state: { from: `/community/t/${id}` } }); return; }
    if (!reply.trim() || !thread) return;
    setBusy(true);
    const { error } = await supabase.from("forum_posts").insert({ thread_id: thread.id, user_id: user.id, body: reply.trim() });
    setBusy(false);
    if (error) { toast({ title: "Could not post", description: error.message, variant: "destructive" }); return; }
    setReply("");
    refresh();
  };

  const toggleReaction = async (target: { thread_id?: string; post_id?: string; id: string }, emoji: string) => {
    if (!user) { nav("/auth", { state: { from: `/community/t/${id}` } }); return; }
    const has = (myReactions[target.id] ?? []).includes(emoji);
    if (has) {
      const q = supabase.from("forum_reactions").delete().eq("user_id", user.id).eq("emoji", emoji);
      const { error } = target.post_id ? await q.eq("post_id", target.post_id) : await q.eq("thread_id", target.thread_id!);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("forum_reactions").insert({ user_id: user.id, emoji, post_id: target.post_id ?? null, thread_id: target.thread_id ?? null });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    refresh();
  };

  const deletePost = async (postId: string) => {
    if (deleteBusy) return;
    if (!confirm("Delete this reply?")) return;
    setDeleteBusy(postId);
    const { error } = await supabase.from("forum_posts").delete().eq("id", postId);
    setDeleteBusy(null);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    refresh();
  };

  const acceptToggle = async (postId: string) => {
    if (!thread || !isOP || acceptBusy) return;
    if (thread.thread_type !== "question") return;
    const next = thread.accepted_post_id === postId ? null : postId;
    setAcceptBusy(postId);
    try {
      await setAcceptedAnswer(thread.id, next);
      toast({ title: next ? "Marked as accepted answer" : "Accepted answer cleared" });
      refresh();
    } catch (e: unknown) {
      toast({ title: "Could not update", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setAcceptBusy(null); }
  };

  const toggleClose = async () => {
    if (!thread || !isOP) return;
    const next = thread.status === "closed" ? (thread.accepted_post_id ? "solved" : "open") : "closed";
    try {
      await updateThreadStatus(thread.id, next);
      toast({ title: next === "closed" ? "Thread closed" : "Thread reopened" });
      refresh();
    } catch (e: unknown) {
      toast({ title: "Could not update", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const toggleBookmark = () => {
    if (!thread) return;
    const next = isBookmarked ? bookmarks.filter(b => b !== thread.id) : [...bookmarks, thread.id];
    writeBookmarks(next); setBookmarks(next);
    toast({ title: isBookmarked ? "Bookmark removed" : "Saved locally", description: "Bookmarks are stored only in this browser." });
  };

  const copyLink = async (url?: string) => {
    try { await navigator.clipboard.writeText(url ?? window.location.href); toast({ title: "Link copied" }); }
    catch (e: unknown) { toast({ title: "Copy failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
  };

  const copySummary = async () => {
    if (!thread) return;
    const canonical = `${window.location.origin}/community/t/${thread.id}`;
    const route = `/community/t/${thread.id}`;
    const linked = thread.linked_entity_path
      ? `Link: ${thread.linked_entity_label || thread.linked_entity_path} (${thread.linked_entity_path})`
      : null;
    const structured = thread.structured_data && Object.keys(thread.structured_data).length
      ? ["Fields:", ...Object.entries(thread.structured_data).map(([k, v]) =>
          `  - ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)]
      : [];
    const lines = [
      `# ${thread.title}`,
      `Category: ${category?.name ?? "—"}`,
      `Type: ${threadTypeLabel[thread.thread_type]} · Status: ${thread.status}`,
      related?.ok ? `Related: ${related.label}` : null,
      linked,
      thread.tags?.length ? `Tags: ${thread.tags.map(t => "#" + t).join(" ")}` : null,
      `Author: ${authorName(opAuthor)} · created ${new Date(thread.created_at).toISOString()} · updated ${new Date(thread.updated_at).toISOString()}`,
      `Replies: ${thread.reply_count} · Reactions: ${thread.reaction_count} · Views: ${thread.view_count}`,
      "",
      thread.body,
      "",
      ...structured,
      structured.length ? "" : null,
      `Route: ${route}`,
      `Source: ${canonical}`,
    ].filter(v => v !== null && v !== undefined).join("\n");
    try { await navigator.clipboard.writeText(lines); toast({ title: "Thread summary copied" }); }
    catch (e: unknown) { toast({ title: "Copy failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }); }
  };

  // Assign stable reply numbers in original chronological order; do NOT
  // renumber when an accepted post is pinned to the top.
  const numbered = useMemo(() => posts.map((p, i) => ({ post: p, num: i + 1 })), [posts]);
  // Only questions may have an accepted answer — ignore legacy malformed rows
  // on non-question threads so accepted-answer UI never appears there.
  const isQuestion = thread?.thread_type === "question";
  const acceptedPost = useMemo(
    () => (isQuestion ? posts.find(p => p.id === thread?.accepted_post_id) || null : null),
    [posts, thread, isQuestion],
  );
  const orderedNumbered = useMemo(() => {
    if (!acceptedPost) return numbered;
    return [
      ...numbered.filter(n => n.post.id === acceptedPost.id),
      ...numbered.filter(n => n.post.id !== acceptedPost.id),
    ];
  }, [numbered, acceptedPost]);

  if (loading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  if (!thread) return <div className="p-12 text-center text-muted-foreground">Thread not found. <Link to="/community" className="text-primary">Back to forum</Link></div>;

  const statusPill =
    thread.status === "solved" ? "pill-good" :
    thread.status === "closed" ? "" :
    thread.thread_type === "question" ? "pill-warn" : "pill-yellow";

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
      <div className="min-w-0">
        <div className="text-[12px] text-muted-foreground mb-1"><Link to="/community" className="hover:text-primary">Forum</Link> / thread</div>
        <header className="mb-3">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {thread.pinned && <span className="pill pill-yellow"><Pin className="h-3 w-3" /> pinned</span>}
            {thread.locked && <span className="pill"><Lock className="h-3 w-3" /> locked</span>}
            <span className={`pill ${statusPill}`}>
              {thread.status === "solved" && <CheckCircle2 className="h-3 w-3" />}
              {thread.status === "closed" && <Lock className="h-3 w-3" />}
              {thread.status === "open" && thread.thread_type === "question" && <HelpCircle className="h-3 w-3" />}
              {threadTypeLabel[thread.thread_type]}{thread.status !== "open" ? ` · ${thread.status}` : ""}
            </span>
            {thread.tags?.map(t => <span key={t} className="pill mono">#{t}</span>)}
          </div>
          <h1 className="text-[22px] font-bold tracking-tight leading-snug">{thread.title}</h1>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
            {category && (
              <Link to={`/community?category=${category.slug}`} className="pill"
                style={{ borderColor: category.color + "66", background: category.color + "22", color: category.color }}>
                {category.name}
              </Link>
            )}
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{thread.view_count} views</span>
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{thread.reply_count} replies</span>
            <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{thread.reaction_count} reactions</span>
            <span>· created <time dateTime={new Date(thread.created_at).toISOString()} title={new Date(thread.created_at).toISOString()}>{timeAgo(thread.created_at)}</time></span>
            <span>· updated <time dateTime={new Date(thread.updated_at).toISOString()} title={new Date(thread.updated_at).toISOString()}>{timeAgo(thread.updated_at)}</time></span>
            <span>· last activity <time dateTime={new Date(thread.last_activity_at).toISOString()} title={new Date(thread.last_activity_at).toISOString()}>{timeAgo(thread.last_activity_at)}</time></span>
          </div>
          {related && (
            <div className="mt-2 rounded border border-border/60 bg-muted/30 px-2 py-1 text-[11.5px] flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Related</span>
              {related.ok
                ? <Link to={related.href} className="text-primary hover:underline font-medium">{related.label}</Link>
                : <span className="text-muted-foreground italic">{related.label}</span>}
              {related.ok && related.sub && <span className="text-muted-foreground mono">· {related.sub}</span>}
            </div>
          )}
          {thread.linked_entity_path && (
            <div className="mt-2 rounded border border-border/60 bg-muted/30 px-2 py-1 text-[11.5px] flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Link</span>
              <Link to={thread.linked_entity_path} className="text-primary hover:underline font-medium">
                {thread.linked_entity_label || thread.linked_entity_path}
              </Link>
              <span className="mono text-muted-foreground">· {thread.linked_entity_path}</span>
            </div>
          )}
          {thread.structured_data && Object.keys(thread.structured_data).length > 0 && (
            <div className="mt-2 rounded border border-border/60 bg-muted/20 p-2">
              <div className="section-title mb-1">Report details</div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11.5px]">
                {Object.entries(thread.structured_data).map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2 min-w-0">
                    <dt className="mono text-muted-foreground shrink-0">{k}</dt>
                    <dd className="mono truncate" title={typeof v === "string" ? v : JSON.stringify(v)}>
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <button onClick={toggleBookmark} className="btn-ghost btn-sm" aria-pressed={isBookmarked}>
              {isBookmarked ? <><BookmarkCheck className="h-3 w-3" /> Saved</> : <><Bookmark className="h-3 w-3" /> Save</>}
            </button>
            <button onClick={() => copyLink()} className="btn-ghost btn-sm"><Link2 className="h-3 w-3" /> Copy link</button>
            <button onClick={copySummary} className="btn-ghost btn-sm"><ClipboardCopy className="h-3 w-3" /> Copy summary</button>
            {isOP && (
              <button onClick={toggleClose} className="btn-ghost btn-sm">
                {thread.status === "closed" ? <><Unlock className="h-3 w-3" /> Reopen</> : <><Lock className="h-3 w-3" /> Close thread</>}
              </button>
            )}
          </div>
        </header>

        <PostBlock
          body={thread.body} author={opAuthor} when={thread.created_at} isOP
          reactions={counts[thread.id] ?? {}}
          mine={myReactions[thread.id] ?? []}
          onReact={(e) => toggleReaction({ id: thread.id, thread_id: thread.id }, e)}
          stats={opAuthor ? contribStats.get(opAuthor.id) : undefined}
        />

        <div className="my-4 flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="section-title">{posts.length} replies</span>
          {acceptedPost && <span className="pill pill-good"><CheckCircle2 className="h-3 w-3" /> accepted answer pinned</span>}
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-3">
          {orderedNumbered.map(({ post: p, num }) => (
            <div key={p.id} id={`reply-${num}`}>
              <PostBlock
                body={p.body} author={p.author} when={p.created_at}
                accepted={isQuestion && p.id === thread.accepted_post_id}
                reactions={counts[p.id] ?? {}}
                mine={myReactions[p.id] ?? []}
                replyNumber={num}
                onCopyLink={() => copyLink(`${window.location.origin}/community/t/${thread.id}#reply-${num}`)}
                onReact={(e) => toggleReaction({ id: p.id, post_id: p.id }, e)}
                onDelete={user?.id === p.user_id ? () => deletePost(p.id) : undefined}
                deleteBusy={deleteBusy === p.id}
                onAccept={isOP && !thread.locked && isQuestion ? () => acceptToggle(p.id) : undefined}
                acceptBusy={acceptBusy === p.id}
                stats={p.author ? contribStats.get(p.author.id) : undefined}
              />
            </div>
          ))}
        </div>

        {canReply ? (
          <form onSubmit={submitReply} className="mt-6 surface-card p-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
              <Reply className="h-3 w-3" />
              {user ? <>Replying as <span className="font-medium text-foreground">{authorName(profile)}</span></> : <>You need to <Link to="/auth" state={{ from: `/community/t/${id}` }} className="text-primary hover:underline">sign in</Link> to reply.</>}
            </div>
            <div className="text-[10.5px] text-muted-foreground mb-1">{replyGuidance[thread.thread_type]}</div>
            <textarea
              value={reply} onChange={e => setReply(e.target.value)}
              placeholder={user ? "Add to the conversation. Plain text with line breaks." : "Sign in to post a reply."}
              disabled={!user || busy}
              className="w-full min-h-24 rounded border border-input bg-background p-2 text-[13px] outline-none focus:ring-1 focus:ring-ring/40 focus:border-ring"
            />
            <div className="mt-2 flex justify-end">
              <button type="submit" disabled={!user || busy || !reply.trim()} className="btn-primary disabled:opacity-50">{busy ? "Posting…" : "Post reply"}</button>
            </div>
          </form>
        ) : (
          <div className="mt-6 surface-card p-4 text-center text-[12px] text-muted-foreground">
            <Lock className="inline h-3 w-3 mr-1" /> This thread is {thread.status === "closed" ? "closed" : "locked"}. New replies are disabled.
          </div>
        )}
      </div>

      {/* Side rail: honest disclaimers */}
      <aside className="space-y-3">
        <div className="surface-card p-3 text-[11.5px]">
          <div className="section-title mb-1">About this thread</div>
          <ul className="text-muted-foreground space-y-1">
            {isQuestion
              ? <li>Author-controlled: only the original author can close, reopen, or accept an answer.</li>
              : <li>Author-controlled: only the original author can close or reopen this thread.</li>}
            <li>Contributor stats are activity summaries, not credentials or verification.</li>
            <li>Verify technical claims against primary documentation and test evidence.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

function PostBlock({
  body, author, when, isOP, accepted, reactions, mine, onReact, onDelete, onAccept, stats,
  replyNumber, onCopyLink, acceptBusy, deleteBusy,
}: {
  body: string;
  author: { display_name: string | null; username: string | null; avatar_url: string | null; id?: string } | null;
  when: string;
  isOP?: boolean;
  accepted?: boolean;
  reactions: Record<string, number>;
  mine: string[];
  onReact: (emoji: string) => void;
  onDelete?: () => void;
  onAccept?: () => void;
  stats?: { threads: number; replies: number; reactions: number; accepted: number };
  replyNumber?: number;
  onCopyLink?: () => void;
  acceptBusy?: boolean;
  deleteBusy?: boolean;
}) {
  return (
    <div className={`surface-card p-3 ${isOP ? "ring-1 ring-primary/30" : ""} ${accepted ? "ring-1 ring-[hsl(var(--positive))]/60 bg-[hsl(var(--positive)/0.05)]" : ""}`}>
      <div className="flex items-start gap-3">
        {author?.avatar_url
          ? <img src={author.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover border border-border shrink-0" />
          : <div className="h-8 w-8 shrink-0 rounded-full bg-primary/15 text-primary border border-primary/30 grid place-items-center text-[11px] font-semibold">{authorInitials(author as any)}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[12px] flex-wrap">
            <span className="font-semibold">{authorName(author as any)}</span>
            {isOP && <span className="pill pill-yellow">OP</span>}
            {replyNumber && (
              <a href={`#reply-${replyNumber}`} className="mono text-[10.5px] text-muted-foreground hover:text-primary">#reply-{replyNumber}</a>
            )}
            {accepted && <span className="pill pill-good"><CheckCircle2 className="h-3 w-3" /> accepted answer</span>}
            <span className="text-muted-foreground" title={new Date(when).toISOString()}>· {timeAgo(when)}</span>
            {stats && (
              <span className="text-muted-foreground mono text-[10.5px]" title="threads · replies · accepted answers">
                {stats.threads}t · {stats.replies}r · {stats.accepted}✓
              </span>
            )}
            <span className="ml-auto flex items-center gap-1">
              {onCopyLink && (
                <button onClick={onCopyLink} className="text-muted-foreground hover:text-primary" title="Copy link to this reply">
                  <Link2 className="h-3 w-3" />
                </button>
              )}
              {onAccept && (
                <button onClick={onAccept} disabled={!!acceptBusy} title={accepted ? "Unaccept answer" : "Accept as answer"}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${accepted ? "bg-[hsl(var(--positive)/0.15)] text-[hsl(var(--positive))]" : "text-muted-foreground hover:text-[hsl(var(--positive))]"}`}>
                  <CheckCircle2 className="h-3 w-3" /> {acceptBusy ? "…" : (accepted ? "Accepted" : "Accept")}
                </button>
              )}
              {onDelete && (
                <button onClick={onDelete} disabled={!!deleteBusy} className="text-muted-foreground hover:text-destructive disabled:opacity-50" title="Delete"><Trash2 className="h-3 w-3" /></button>
              )}
            </span>
          </div>
          <div className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed">{body}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {EMOJIS.map(e => {
              const count = reactions[e] ?? 0;
              const active = mine.includes(e);
              return (
                <button key={e} onClick={() => onReact(e)}
                  className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition ${active ? "border-primary/60 bg-primary/15" : "border-border bg-muted/30 hover:bg-muted"}`}>
                  <span>{e}</span>{count > 0 && <span className="mono text-muted-foreground">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
