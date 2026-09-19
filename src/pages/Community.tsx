import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  listCategories, listThreads, contributorStatsFor,
  type ForumCategory, type ThreadWithMeta,
  THREAD_TYPES, THREAD_STATUSES, threadTypeLabel,
  authorName, authorInitials,
  type ThreadType, type ThreadStatus,
} from "@/lib/forum";
import {
  Plus, Search, X, Filter, RefreshCw, Link2,
  BookOpen, FileCheck2, Wrench, MessageCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ThreadRow } from "@/components/community/ThreadRow";
import {
  filterThreads, sortThreads, hasStructured, hasLinked,
  THREAD_SORTS, type ThreadSort,
} from "@/components/community/threadFilters";
import { COMMUNITY_URL } from "@/lib/site-config";

export default function Community() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [cats, setCats] = useState<ForumCategory[]>([]);
  const [baseThreads, setBaseThreads] = useState<ThreadWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [catErr, setCatErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [contribStats, setContribStats] = useState<Map<string, { threads: number; replies: number; reactions: number; accepted: number }>>(new Map());

  const q = sp.get("q") ?? "";
  const sort = (sp.get("sort") as ThreadSort) || "recent";
  const type = (sp.get("type") as ThreadType | null) || null;
  const status = (sp.get("status") as ThreadStatus | null) || null;
  const tag = sp.get("tag") || null;
  const categorySlug = sp.get("category") || null;
  const linkedOnly = sp.get("linked") === "1";
  const unansweredOnly = sp.get("unanswered") === "1";

  const [qInput, setQInput] = useState(q);
  useEffect(() => { setQInput(q); }, [q]);

  const patchParam = (patch: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k); else next.set(k, v);
    }
    setSp(next, { replace });
  };

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null); setCatErr(null);
    // Load categories and the broad base thread set together, but track their
    // errors independently so a categories failure isn't erased by a later
    // successful thread load (and vice-versa). Retry re-runs both.
    const cP = listCategories()
      .then(c => { if (alive) setCats(c); })
      .catch(e => { if (alive) setCatErr(e?.message ?? String(e)); });
    const tP = listThreads({ limit: 200, sort: "recent" })
      .then(async t => {
        if (!alive) return;
        setBaseThreads(t);
        const stats = await contributorStatsFor(Array.from(new Set(t.map(x => x.user_id))));
        if (alive) setContribStats(stats);
      })
      .catch(e => { if (alive) setErr(e?.message ?? String(e)); });
    Promise.allSettled([cP, tP]).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refreshKey]);

  const catId = useMemo(() => cats.find(c => c.slug === categorySlug)?.id ?? null, [cats, categorySlug]);

  const filtered = useMemo(() => sortThreads(
    filterThreads(baseThreads, { q, type, status, tag, categoryId: catId, linkedOnly, unansweredOnly }),
    sort
  ), [baseThreads, q, type, status, tag, catId, linkedOnly, unansweredOnly, sort]);

  const countsByCat = useMemo(() => {
    const m = new Map<string, number>();
    baseThreads.forEach(t => m.set(t.category_id, (m.get(t.category_id) ?? 0) + 1));
    return m;
  }, [baseThreads]);

  const overview = useMemo(() => {
    const openQ = baseThreads.filter(t => t.thread_type === "question" && t.status === "open").length;
    const solvedQ = baseThreads.filter(t => t.thread_type === "question" && t.status === "solved").length;
    const structured = baseThreads.filter(hasStructured).length;
    const linked = baseThreads.filter(hasLinked).length;
    const contributors = new Set(baseThreads.map(t => t.user_id)).size;
    return { total: baseThreads.length, openQ, solvedQ, structured, linked, contributors };
  }, [baseThreads]);

  const topContributors = useMemo(() => {
    const rows = filtered.map(t => ({
      user_id: t.user_id, author: t.author,
      stats: contribStats.get(t.user_id) ?? { threads: 0, replies: 0, reactions: 0, accepted: 0 },
    }));
    const seen = new Map<string, typeof rows[0]>();
    rows.forEach(r => { if (!seen.has(r.user_id)) seen.set(r.user_id, r); });
    return Array.from(seen.values())
      .sort((a, b) => (b.stats.accepted - a.stats.accepted) || (b.stats.replies - a.stats.replies))
      .slice(0, 6);
  }, [filtered, contribStats]);

  const hasFilter = !!(q || type || status || tag || categorySlug || linkedOnly || unansweredOnly);
  const clearFilters = () => setSp(new URLSearchParams());

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="section-title">Forum</div>
          <h1 className="text-[22px] font-bold tracking-tight">Robotics community</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Structured build logs, integration reports, teardowns, and questions — linked to real components and projects.</p>
        </div>
        <Link to={user ? "/community/new" : "/auth"} state={!user ? { from: "/community/new" } : undefined} className="btn-primary">
          <Plus className="h-3.5 w-3.5" /> New thread
        </Link>
      </div>

      {/* Overview strip */}
      <div className="mt-4 surface-card grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total discussions" v={overview.total} />
        <Stat label="Open questions" v={overview.openQ} />
        <Stat label="Solved questions" v={overview.solvedQ} />
        <Stat label="Structured reports" v={overview.structured} />
        <Stat label="Linked-object threads" v={overview.linked} />
        <Stat label="Active contributors" v={overview.contributors} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr_260px]">
        {/* Category rail */}
        <aside className="space-y-2">
          <div className="section-title px-2">Categories</div>
          <button onClick={() => patchParam({ category: null })} className={`w-full text-left px-2 py-1.5 rounded text-[12.5px] hover:bg-muted ${!categorySlug ? "bg-muted" : ""}`}>All categories</button>
          {cats.map(c => (
            <button key={c.id} onClick={() => patchParam({ category: c.slug })}
              className={`w-full text-left rounded px-2 py-1.5 text-[12.5px] hover:bg-muted ${categorySlug === c.slug ? "bg-muted" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: c.color }} />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="mono text-[10px] text-muted-foreground">{countsByCat.get(c.id) ?? 0}</span>
              </div>
              {c.description && <div className="text-[10.5px] text-muted-foreground mt-0.5 line-clamp-2 pl-4">{c.description}</div>}
            </button>
          ))}
        </aside>

        {/* Main column */}
        <section className="min-w-0">
          {/* Filters */}
          <div className="surface-card p-2 flex flex-wrap items-center gap-2 mb-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <input
                aria-label="Search threads"
                value={qInput}
                onChange={e => { setQInput(e.target.value); patchParam({ q: e.target.value || null }, true); }}
                placeholder="Search title, body, tag, category, author…"
                className="input-bare pl-7"
              />
            </div>
            <FilterSelect label="Type" value={type ?? ""} onChange={v => patchParam({ type: v || null })}
              options={[{ value: "", label: "Any type" }, ...THREAD_TYPES.map(t => ({ value: t, label: threadTypeLabel[t] }))]} />
            <FilterSelect label="Status" value={status ?? ""} onChange={v => patchParam({ status: v || null })}
              options={[{ value: "", label: "Any status" }, ...THREAD_STATUSES.map(s => ({ value: s, label: s }))]} />
            <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={linkedOnly} onChange={e => patchParam({ linked: e.target.checked ? "1" : null })} />
              <Link2 className="h-3 w-3" /> Linked only
            </label>
            <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={unansweredOnly} onChange={e => patchParam({ unanswered: e.target.checked ? "1" : null })} />
              Unanswered
            </label>
            {tag && (
              <button onClick={() => patchParam({ tag: null })} className="pill pill-yellow" aria-label={`Remove tag filter ${tag}`}>
                #{tag} <X className="h-3 w-3" />
              </button>
            )}
            <div className="flex rounded border border-border bg-muted/30 p-0.5 text-[11px]">
              {THREAD_SORTS.map(s => (
                <button key={s.key} onClick={() => patchParam({ sort: s.key === "recent" ? null : s.key })}
                  className={`px-2 py-0.5 rounded inline-flex items-center gap-1 ${sort === s.key ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                  {s.label}
                </button>
              ))}
            </div>
            {hasFilter && (
              <button onClick={clearFilters} className="btn-ghost btn-sm">
                <X className="h-3 w-3" /> Reset
              </button>
            )}
          </div>

          <section className="surface-card divide-y divide-border/60">
            {loading && <div className="p-8 text-center text-[12px] text-muted-foreground">Loading threads…</div>}
            {(err || catErr) && !loading && (
              <div className="p-8 text-center text-[12px] text-destructive">
                Error: {err ?? catErr}
                <button onClick={() => setRefreshKey(k => k + 1)} className="ml-2 btn-ghost btn-sm inline-flex"><RefreshCw className="h-3 w-3" /> Retry</button>
              </div>
            )}
            {!loading && !err && !catErr && baseThreads.length === 0 && !hasFilter && <CommunityBetaGuide />}
            {!loading && !err && !catErr && filtered.length === 0 && (baseThreads.length > 0 || hasFilter) && (
              <div className="p-12 text-center text-[13px] text-muted-foreground">
                <Filter className="h-4 w-4 inline mr-1" /> No threads match these filters.{" "}
                <button onClick={clearFilters} className="text-primary hover:underline">Clear filters</button>
              </div>
            )}
            {filtered.map(t => <ThreadRow key={t.id} t={t} onTag={tg => patchParam({ tag: tg })} />)}
          </section>
        </section>

        {/* Contribution snapshot */}
        <aside className="space-y-3">
          <div className="surface-card p-3">
            <div className="section-title mb-2">Contribution snapshot</div>
            <div className="text-[11px] text-muted-foreground mb-2">
              Top contributors in the current view, by accepted answers and replies. This is a summary of activity, not proof of expertise — verify technical claims against primary documentation.
            </div>
            {topContributors.length === 0 && <div className="text-[12px] text-muted-foreground">No contributor data in this view.</div>}
            <ul className="space-y-1.5">
              {topContributors.map(r => (
                <li key={r.user_id} className="flex items-center gap-2">
                  {r.author?.avatar_url
                    ? <img src={r.author.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover border border-border" />
                    : <div className="h-6 w-6 shrink-0 rounded-full bg-primary/15 text-primary border border-primary/30 grid place-items-center text-[9.5px] font-semibold">{authorInitials(r.author)}</div>}
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium truncate">{authorName(r.author)}</div>
                    <div className="text-[10.5px] text-muted-foreground mono">
                      {r.stats.threads}t · {r.stats.replies}r · {r.stats.accepted}✓
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="surface-card p-3 text-[11px] text-muted-foreground">
            Community reports (supplier experiences, teardowns, integration notes) are individual accounts. Not verified or adjudicated by RoboPartPicker.
          </div>
        </aside>
      </div>
    </div>
  );
}

function CommunityBetaGuide() {
  const cards = [
    { icon: FileCheck2, title: "Build report", text: "Pin the project revision, list BOM substitutions, record test results, and attach source evidence." },
    { icon: Wrench, title: "Integration note", text: "Document the exact components, interfaces, firmware revision, failure mode, and verified workaround." },
    { icon: BookOpen, title: "BOM correction", text: "Link the source row or CAD object, explain the incorrect line, and propose a quantity or identity correction." },
  ];
  return <div className="p-5"><div className="flex items-center gap-2"><span className="pill pill-yellow">beta</span><h2 className="font-semibold">No authentic discussions have been published yet</h2></div><p className="mt-2 text-xs leading-5 text-muted-foreground">The community is reserved for source-linked engineering evidence. RoboPartPicker will not seed fake posts or contributor counts.</p><div className="mt-4 grid gap-2 md:grid-cols-3">{cards.map(({ icon: Icon, title, text }) => <div key={title} className="rounded border border-border bg-background p-3"><Icon className="h-4 w-4 text-primary" /><div className="mt-2 text-xs font-semibold">{title}</div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{text}</p></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><Link to="/community/new" className="btn-primary inline-flex"><Plus className="h-3.5 w-3.5" /> Publish the first evidence-backed thread</Link><a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="btn-ghost inline-flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> Report a correction</a></div></div>;
}

function Stat({ label, v, sub }: { label: string; v: number; sub?: string }) {
  return (
    <div className="stat-tile">
      <div className="v mono">{v}</div>
      <div className="min-w-0">
        <div className="k truncate">{label}</div>
        {sub && <div className="text-[9.5px] text-muted-foreground truncate">{sub}</div>}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className="uppercase tracking-wider text-[10px]">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="h-7 rounded border border-input bg-background px-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring/40">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
