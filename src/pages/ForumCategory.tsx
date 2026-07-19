import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  listCategories, listThreads, type ForumCategory, type ThreadWithMeta,
  threadTypeLabel, THREAD_TYPES, THREAD_STATUSES,
  type ThreadType, type ThreadStatus,
} from "@/lib/forum";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Search, X, Link2, RefreshCw, Filter } from "lucide-react";
import { ThreadRow } from "@/components/community/ThreadRow";
import { filterThreads, sortThreads, THREAD_SORTS, type ThreadSort } from "@/components/community/threadFilters";

export default function ForumCategoryPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [cat, setCat] = useState<ForumCategory | null>(null);
  const [base, setBase] = useState<ThreadWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const q = sp.get("q") ?? "";
  const sort = (sp.get("sort") as ThreadSort) || "recent";
  const type = (sp.get("type") as ThreadType | null) || null;
  const status = (sp.get("status") as ThreadStatus | null) || null;
  const tag = sp.get("tag") || null;
  const linkedOnly = sp.get("linked") === "1";
  const unansweredOnly = sp.get("unanswered") === "1";
  const [qInput, setQInput] = useState(q);
  useEffect(() => { setQInput(q); }, [q]);

  const patchParam = (patch: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    setSp(next, { replace });
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const cats = await listCategories();
        const c = cats.find(x => x.slug === slug) ?? null;
        if (!alive) return;
        setCat(c);
        if (c) {
          const rows = await listThreads({ categoryId: c.id, limit: 200, sort: "recent" });
          if (alive) setBase(rows);
        }
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug, refreshKey]);

  const filtered = useMemo(() => sortThreads(
    filterThreads(base, { q, type, status, tag, linkedOnly, unansweredOnly }),
    sort
  ), [base, q, type, status, tag, linkedOnly, unansweredOnly, sort]);

  const dist = useMemo(() => {
    const m: Record<string, number> = {};
    base.forEach(t => { m[t.thread_type] = (m[t.thread_type] ?? 0) + 1; });
    return m;
  }, [base]);

  // Only show "not found" when there is no loading error — a DB error must be
  // surfaced in the existing Retry state below rather than masked as missing.
  if (!loading && !err && !cat) {
    return <div className="p-12 text-center text-muted-foreground">Category not found. <Link to="/community" className="text-primary">Back to forum</Link></div>;
  }

  const hasFilter = !!(q || type || status || tag || linkedOnly || unansweredOnly);
  const newHref = user ? `/community/new?category=${cat?.id ?? ""}` : "/auth";
  const clearFilters = () => setSp(new URLSearchParams());

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5">
      <div className="text-[12px] text-muted-foreground mb-1"><Link to="/community" className="hover:text-primary">Forum</Link> / {cat?.name}</div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight flex items-center gap-2">
            {cat && <span className="h-2.5 w-2.5 rounded-full" style={{ background: cat.color }} />}
            {cat?.name}
          </h1>
          {cat?.description && <p className="text-[13px] text-muted-foreground mt-0.5 max-w-[720px]">{cat.description}</p>}
          <div className="mt-1 text-[11px] text-muted-foreground mono">
            {base.length} total · {filtered.length} in view
            {Object.entries(dist).slice(0, 5).map(([k, v]) => ` · ${threadTypeLabel[k as ThreadType] ?? k}: ${v}`).join("")}
          </div>
        </div>
        <button
          onClick={() => nav(newHref, user ? undefined : { state: { from: `/community/new?category=${cat?.id ?? ""}` } })}
          className="btn-primary"><Plus className="h-3.5 w-3.5" /> New thread</button>
      </div>

      <div className="surface-card p-2 flex flex-wrap items-center gap-2 mb-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <input aria-label="Search threads in category" value={qInput}
            onChange={e => { setQInput(e.target.value); patchParam({ q: e.target.value || null }, true); }}
            placeholder="Search title, body, tag, author…" className="input-bare pl-7" />
        </div>
        <select value={type ?? ""} onChange={e => patchParam({ type: e.target.value || null })}
          aria-label="Thread type"
          className="h-7 rounded border border-input bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring/40">
          <option value="">Any type</option>
          {THREAD_TYPES.map(t => <option key={t} value={t}>{threadTypeLabel[t]}</option>)}
        </select>
        <select value={status ?? ""} onChange={e => patchParam({ status: e.target.value || null })}
          aria-label="Thread status"
          className="h-7 rounded border border-input bg-background px-1.5 text-[12px] outline-none focus:ring-1 focus:ring-ring/40">
          <option value="">Any status</option>
          {THREAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={linkedOnly} onChange={e => patchParam({ linked: e.target.checked ? "1" : null })} />
          <Link2 className="h-3 w-3" /> Linked only
        </label>
        <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <input type="checkbox" checked={unansweredOnly} onChange={e => patchParam({ unanswered: e.target.checked ? "1" : null })} />
          Unanswered
        </label>
        {tag && (
          <button onClick={() => patchParam({ tag: null })} className="pill pill-yellow">#{tag} <X className="h-3 w-3" /></button>
        )}
        <div className="flex rounded border border-border bg-muted/30 p-0.5 text-[11px]">
          {THREAD_SORTS.map(s => (
            <button key={s.key} onClick={() => patchParam({ sort: s.key === "recent" ? null : s.key })}
              className={`px-2 py-0.5 rounded ${sort === s.key ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              {s.label}
            </button>
          ))}
        </div>
        {hasFilter && (
          <button onClick={clearFilters} className="btn-ghost btn-sm"><X className="h-3 w-3" /> Reset</button>
        )}
      </div>

      <section className="surface-card divide-y divide-border/60">
        {loading && <div className="p-8 text-center text-[12px] text-muted-foreground">Loading…</div>}
        {err && !loading && (
          <div className="p-8 text-center text-[12px] text-destructive">
            Error: {err}
            <button onClick={() => setRefreshKey(k => k + 1)} className="ml-2 btn-ghost btn-sm inline-flex"><RefreshCw className="h-3 w-3" /> Retry</button>
          </div>
        )}
        {!loading && !err && filtered.length === 0 && (
          <div className="p-12 text-center text-[13px] text-muted-foreground">
            <Filter className="h-4 w-4 inline mr-1" /> No threads match these filters.{" "}
            <button onClick={clearFilters} className="text-primary hover:underline">Clear filters</button>
          </div>
        )}
        {filtered.map(t => <ThreadRow key={t.id} t={t} onTag={tg => patchParam({ tag: tg })} />)}
      </section>
    </div>
  );
}
