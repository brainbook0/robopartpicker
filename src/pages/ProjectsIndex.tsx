import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search, FileJson, GitBranch, Package, X, Cpu, Boxes, Clock, Star, ShieldCheck, AlertTriangle } from "lucide-react";
import { listProjectsPage, type ProjectCatalogStats, type ProjectKind, type ProjectRow } from "@/lib/projects";
import { useAuth } from "@/contexts/AuthContext";
import { ROBOT_CATEGORIES, ROBOT_CATEGORY_LABELS, type RobotCategory } from "@/shared/robotCategory";

type SortKey = "popularity" | "updated" | "cost_asc" | "repro_desc" | "name";

const median = (nums: number[]) => {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const bomLineCount = (p: ProjectRow) => p.bom_line_count ?? p.rpps?.bom?.length ?? 0;
const rosSupport = (p: ProjectRow) => p.rpps?.software?.ros_support;
const hasRos = (p: ProjectRow) => {
  const r = rosSupport(p);
  return r === "native" || r === "community";
};

const fmtStars = (n: number | null | undefined) => {
  if (n == null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${n}`;
};

const kindLabels: Record<ProjectKind, string> = {
  physical_design: "Physical design",
  robotics_software: "Robotics software",
  commercial_showcase: "Commercial showcase",
  unknown: "Unclassified",
};

const relTime = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}d ago`;
  if (d < 86400 * 365) return `${Math.floor(d / 86400 / 30)}mo ago`;
  return `${Math.floor(d / 86400 / 365)}y ago`;
};

export default function ProjectsIndex() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [catalogStats, setCatalogStats] = useState<ProjectCatalogStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const q = params.get("q") ?? "";
  const tag = params.get("tag");
  const difficulty = params.get("difficulty") ?? "";
  const kind = (params.get("kind") as ProjectKind | null) ?? "";
  const category = (params.get("category") as RobotCategory | null) ?? "";
  const sort = (params.get("sort") as SortKey) || "popularity";
  const quickParam = params.get("f") ?? "";
  const quick = useMemo(() => new Set(quickParam.split(",").filter(Boolean)), [quickParam]);

  const setParam = (key: string, value: string | null, replace = false) => {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key); else next.set(key, value);
    setParams(next, { replace });
  };
  const toggleQuick = (key: string) => {
    const nq = new Set(quick);
    if (nq.has(key)) nq.delete(key); else nq.add(key);
    setParam("f", nq.size ? Array.from(nq).join(",") : null);
  };
  const clearFilters = () => setParams(new URLSearchParams(), { replace: false });

  const pageSize = 60;

  useEffect(() => {
    setLoading(true);
    listProjectsPage(1, pageSize, { kind, category }).then(r => {
      setRows(r.items); setTotal(r.total); setCatalogStats(r.stats ?? null); setPage(1); setLoading(false);
    }).catch(e => { setErr(e.message); setLoading(false); });
  }, [kind, category]);

  const loadMore = () => {
    if (loading) return;
    setLoadingMore(true);
    listProjectsPage(page + 1, pageSize, { kind, category }).then(r => {
      setRows(prev => {
        const seen = new Set(prev.map(p => p.id));
        return [...prev, ...r.items.filter(p => !seen.has(p.id))];
      });
      setTotal(r.total); setCatalogStats(r.stats ?? catalogStats); setPage(pg => pg + 1); setLoadingMore(false);
    }).catch(() => setLoadingMore(false));
  };

  const allTags = useMemo(() => Array.from(new Set(rows.flatMap(r => r.tags))).sort(), [rows]);

  const filtered = useMemo(() => {
    let list = rows.filter(r => {
      if (q && !(`${r.name} ${r.summary ?? ""} ${r.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()))) return false;
      if (tag && !r.tags.includes(tag)) return false;
      if (difficulty && r.difficulty !== difficulty) return false;
      if (quick.has("bom") && bomLineCount(r) === 0) return false;
      if (quick.has("repo") && !r.repo_url) return false;
      if (quick.has("under1k") && !(r.estimated_cost_usd != null && r.estimated_cost_usd < 1000)) return false;
      if (quick.has("ros") && !hasRos(r)) return false;
      if (quick.has("reproduced") && r.successful_reproduction_count < 1) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "popularity": return (b.githubStars ?? -1) - (a.githubStars ?? -1) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case "cost_asc": return (a.estimated_cost_usd ?? Infinity) - (b.estimated_cost_usd ?? Infinity);
        case "repro_desc": return b.successful_reproduction_count - a.successful_reproduction_count || b.reproduction_count - a.reproduction_count;
        case "name": return a.name.localeCompare(b.name);
        default: return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });
    return list;
  }, [rows, q, tag, difficulty, sort, quick]);

  const stats = useMemo(() => {
    const costs = rows.map(r => r.estimated_cost_usd).filter((n): n is number => n != null);
    const weekAgo = Date.now() - 7 * 86400_000;
    return {
      total: catalogStats?.totalProjects ?? total,
      loaded: rows.length,
      medianCost: catalogStats?.medianCostMinor != null ? catalogStats.medianCostMinor / 100 : median(costs),
      reproductions: rows.reduce((sum, project) => sum + project.reproduction_count, 0),
      successes: rows.reduce((sum, project) => sum + project.successful_reproduction_count, 0),
      totalParts: catalogStats?.totalParts ?? null,
      withBom: rows.filter(r => bomLineCount(r) > 0).length,
      recent: rows.filter(r => new Date(r.updated_at).getTime() > weekAgo).length,
    };
  }, [catalogStats, rows, total]);

  const hasActiveFilters = !!(q || tag || difficulty || kind || category || quick.size || sort !== "updated");
  const noProjectsExist = !loading && rows.length === 0;
  const noMatches = !loading && rows.length > 0 && filtered.length === 0;
  const demoOnly = rows.length > 0 && rows.every((project) => project.is_demo);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="section-title mb-1">Discover</div>
          <h1 className="text-[20px] font-bold tracking-tight flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Discover robotics projects
          </h1>
          <p className="text-[12px] text-muted-foreground max-w-[720px] mt-0.5">
            The broad robotics design catalog. Source, revision, license, BOM, pricing, and reproducibility are shown as separate evidence states rather than assumed complete.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/rpps" className="btn-ghost btn-sm"><FileJson className="h-3.5 w-3.5" /> RPPS spec</Link>
          {user
            ? <><Link to="/builder" className="btn-ghost btn-sm">My reproductions</Link><Link to="/projects/new" className="btn-primary btn-sm"><Plus className="h-3.5 w-3.5" /> New project</Link></>
            : <Link to="/auth" className="btn-primary btn-sm">Sign in to create</Link>}
        </div>
      </div>

      {/* Overview strip */}
      <div className="surface-card mb-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-border">
        <StatCell label="Projects" value={stats.total.toLocaleString()} />
        <StatCell label="Parts" value={stats.totalParts != null ? stats.totalParts.toLocaleString() : "—"} />
        <StatCell label="Median cost" value={stats.medianCost != null ? `$${Math.round(stats.medianCost).toLocaleString()}` : "—"} />
        <StatCell label="Reproductions" value={`${stats.reproductions} · ${stats.successes} succeeded`} />
        <StatCell label="Loaded now" value={stats.loaded.toLocaleString()} />
      </div>
      {demoOnly && <div className="mb-3 border border-warning/30 bg-warning/5 p-2 text-[11px] text-muted-foreground">All projects shown are derived from downloaded demo BOM fixtures. They are example RPPS records, not validated build instructions or live community publications.</div>}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <label className="flex items-center gap-1.5 rounded border border-input bg-surface px-2 flex-1 min-w-[220px]">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={e => setParam("q", e.target.value || null, true)}
            placeholder="Search projects, tags, summaries…"
            aria-label="Search projects"
            className="h-7 w-full bg-transparent text-[12px] outline-none"
          />
          {q && (
            <button aria-label="Clear search" onClick={() => setParam("q", null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <select value={difficulty} onChange={e => setParam("difficulty", e.target.value || null)}
          aria-label="Filter by difficulty"
          className="h-7 rounded border border-input bg-surface px-2 text-[12px]">
          <option value="">Any difficulty</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
          <option value="expert">Expert</option>
        </select>
        <select value={kind} onChange={e => setParam("kind", e.target.value || null)}
          aria-label="Filter by project type"
          className="h-7 rounded border border-input bg-surface px-2 text-[12px]">
          <option value="">Any project type</option>
          <option value="physical_design">Physical designs</option>
          <option value="robotics_software">Robotics software</option>
          <option value="commercial_showcase">Commercial showcases</option>
          <option value="unknown">Unclassified</option>
        </select>
        <select value={category} onChange={e => setParam("category", e.target.value || null)}
          aria-label="Filter by robot category"
          className="h-7 rounded border border-input bg-surface px-2 text-[12px]">
          <option value="">Any robot type</option>
          {ROBOT_CATEGORIES.map(c => (
            <option key={c} value={c}>{ROBOT_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <select value={sort} onChange={e => setParam("sort", e.target.value === "updated" ? null : e.target.value)}
          aria-label="Sort projects"
          className="h-7 rounded border border-input bg-surface px-2 text-[12px]">
          <option value="popularity">Most popular</option>
          <option value="updated">Recently updated</option>
          <option value="cost_asc">Lowest cost</option>
          <option value="repro_desc">Highest reproducibility</option>
          <option value="name">Name (A–Z)</option>
        </select>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="btn-ghost btn-sm">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Quick + tag filters */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <Chip active={kind === "physical_design"} onClick={() => setParam("kind", kind === "physical_design" ? null : "physical_design")}>Physical designs</Chip>
        {(Object.keys(ROBOT_CATEGORY_LABELS) as RobotCategory[]).slice(0, 9).map(c => (
          <Chip key={c} active={category === c} onClick={() => setParam("category", category === c ? null : c)}>{ROBOT_CATEGORY_LABELS[c]}</Chip>
        ))}
        <span className="mx-1 text-[11px] text-muted-foreground">·</span>
        <Chip active={quick.has("bom")} onClick={() => toggleQuick("bom")}>Has BOM</Chip>
        <Chip active={quick.has("repo")} onClick={() => toggleQuick("repo")}>Has repo</Chip>
        <Chip active={quick.has("under1k")} onClick={() => toggleQuick("under1k")}>Under $1k</Chip>
        <Chip active={quick.has("ros")} onClick={() => toggleQuick("ros")}>ROS</Chip>
        <Chip active={quick.has("reproduced")} onClick={() => toggleQuick("reproduced")}>Independently reproduced</Chip>
        {allTags.length > 0 && <span className="mx-1 text-[11px] text-muted-foreground">·</span>}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
          {allTags.slice(0, 20).map(t => (
            <Chip key={t} active={tag === t} onClick={() => setParam("tag", tag === t ? null : t)}>{t}</Chip>
          ))}
        </div>
      </div>

      {/* States */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="surface-card p-3 h-[180px] animate-pulse bg-muted/30" />
          ))}
        </div>
      )}
      {err && <div className="text-[12px] text-destructive py-4">Error: {err}</div>}

      {noProjectsExist && (
        <div className="surface-card p-6 text-center">
          <div className="text-[13px] font-medium mb-1">No projects have been published yet</div>
          <p className="text-[12px] text-muted-foreground mb-3">Be the first to publish a standardized robotics project.</p>
          {user
            ? <Link to="/projects/new" className="btn-primary btn-sm inline-flex"><Plus className="h-3.5 w-3.5" /> Create the first project</Link>
            : <Link to="/auth" className="btn-primary btn-sm inline-flex">Sign in to create</Link>}
        </div>
      )}

      {noMatches && (
        <div className="surface-card p-6 text-center">
          <div className="text-[13px] font-medium mb-1">No projects match these filters</div>
          <p className="text-[12px] text-muted-foreground mb-3">Try broadening your search or removing filters.</p>
          <button onClick={clearFilters} className="btn-ghost btn-sm inline-flex"><X className="h-3.5 w-3.5" /> Clear filters</button>
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(p => <ProjectCard key={p.id} p={p} />)}
        </div>
      )}

      {!loading && rows.length > 0 && rows.length < total && !noMatches && (
        <div className="mt-4 flex justify-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {filtered.length < rows.length && <span className="text-[11px] text-muted-foreground">{filtered.length} loaded records match these filters.</span>}
            <button onClick={loadMore} disabled={loadingMore} className="btn-ghost btn-sm">
              {loadingMore ? "Loading…" : `Load more (${rows.length.toLocaleString()} of ${total.toLocaleString()})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[14px] font-semibold mono mt-0.5">{value}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded px-2 py-0.5 text-[11px] border transition-colors ${
        active
          ? "bg-primary/15 border-primary/40 text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >{children}</button>
  );
}

function ProjectCard({ p }: { p: ProjectRow }) {
  const bomCount = bomLineCount(p);
  const dof = p.rpps?.hardware?.dof;
  const compute = p.rpps?.hardware?.compute;
  const middleware = p.rpps?.software?.middleware;
  const ros = rosSupport(p);
  const sourceLabel = p.license ? "licensed source" : p.repo_url ? "license unclear" : "showcase";
  const kindLabel = kindLabels[p.project_kind ?? "unknown"];
  const categoryLabel = p.robot_category ? ROBOT_CATEGORY_LABELS[p.robot_category] : null;
  const media = [
    ...(p.cover_image_url ? [p.cover_image_url] : []),
    ...(p.rpps.files ?? []).filter((file) => file.kind === "image" && Boolean(file.url)).map((file) => file.url as string),
  ].filter((url, index, all) => all.indexOf(url) === index).slice(0, 4);
  return (
    <Link to={`/projects/${p.slug}`} className="surface-card overflow-hidden hover:border-primary/50 transition-colors flex flex-col group">
      <div className="relative aspect-[16/8] bg-muted border-b border-border overflow-hidden">
        {media.length > 0 ? (
          <div className="grid h-full grid-cols-4 gap-0.5">
            {media.map((url, index) => <img key={url} src={url} alt="" loading="lazy"
              className={`${index === 0 && media.length > 1 ? "col-span-3" : media.length === 1 ? "col-span-4" : ""} h-full w-full object-cover group-hover:scale-[1.02] transition-transform`} />)}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <Package className="h-8 w-8" />
          </div>
        )}
        {p.difficulty && (
          <span className="absolute top-1.5 right-1.5 rounded border border-border bg-background/85 backdrop-blur px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
            {p.difficulty}
          </span>
        )}
        <span className={`absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded border bg-background/90 px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${p.license ? "border-positive/40 text-positive" : "border-warning/40 text-warning"}`}>
          {p.license ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />} {p.is_demo ? "demo fixture" : sourceLabel}
        </span>
        <span className="absolute left-1.5 bottom-1.5 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground backdrop-blur">
          {categoryLabel ?? kindLabel}
        </span>
      </div>
      <div className="p-3 flex flex-col flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold truncate">{p.name}</div>
            <div className="text-[11px] text-muted-foreground mono truncate">v{p.version} · {p.status}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {p.githubStars != null && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" aria-label={`${p.githubStars} GitHub stars`}>
                <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" /> {fmtStars(p.githubStars)}
              </span>
            )}
            {p.repo_url && <GitBranch className="h-3.5 w-3.5 text-muted-foreground" aria-label="Has repository" />}
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground line-clamp-2 mt-1.5">{p.summary ?? (p.repo_url ? "Source-available robotics project. Summary enrichment is pending." : "Commercial or closed-source project showcase.")}</p>

        <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
          <MetaCell label="Cost" value={p.estimated_cost_usd != null ? `$${p.estimated_cost_usd.toLocaleString()}` : "—"} />
          <MetaCell label="Builds" value={`${p.reproduction_count} · ${p.successful_reproduction_count} ok`} />
          <MetaCell label="BOM" value={bomCount ? `${bomCount} line${bomCount === 1 ? "" : "s"}` : "—"} />
        </div>

        {(dof != null || compute || middleware || ros) && (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
            {dof != null && <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"><Boxes className="h-3 w-3" /> {dof} DoF</span>}
            {compute && <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 truncate max-w-[140px]"><Cpu className="h-3 w-3" /> {compute}</span>}
            {middleware && <span className="rounded bg-muted px-1.5 py-0.5 truncate max-w-[100px]">{middleware}</span>}
            {ros && ros !== "none" && <span className="rounded bg-muted px-1.5 py-0.5">ROS: {ros}</span>}
          </div>
        )}

        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {p.tags.slice(0, 4).map(t => (
            <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t}</span>
          ))}
          {p.tags.length > 4 && <span className="text-[10px] text-muted-foreground">+{p.tags.length - 4}</span>}
        </div>

        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground mono">
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {relTime(p.updated_at)}</span>
          <span className="truncate max-w-[45%]">{p.slug}</span>
        </div>
      </div>
    </Link>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-surface px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[11px] font-medium mono truncate">{value}</div>
    </div>
  );
}
