import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search, FileJson, Package, SlidersHorizontal, X } from "lucide-react";
import { listProjectsPage, type ProjectCatalogFacets, type ProjectCatalogStats, type ProjectKind, type ProjectListOptions, type ProjectRow } from "@/lib/projects";
import { useAuth } from "@/contexts/AuthContext";
import type { RobotCategory } from "@/shared/robotCategory";
import { ProjectPreviewCard } from "@/components/projects/ProjectPreviewCard";
import { ProjectFacetFilters } from "@/components/projects/ProjectFacetFilters";
import { trackAnalyticsEvent } from "@/lib/analytics";

type SortKey = "completeness" | "popularity" | "trend" | "updated" | "cost_asc" | "repro_desc" | "name";

const median = (nums: number[]) => {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const previewCostUsd = (p: ProjectRow) => p.preview_cost_minor == null ? null : p.preview_cost_minor / 100;
const DISCOVERY_KEYS = ["q","kind","category","source","priceMin","priceMax","bomState","bomLinesMin","build","difficulty","ros","license","hasMedia","hasCad","hasAssembly","hasOfficialSource","verifiedWithinDays"];


export default function ProjectsIndex() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [catalogStats, setCatalogStats] = useState<ProjectCatalogStats | null>(null);
  const [facets, setFacets] = useState<ProjectCatalogFacets | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const q = params.get("q") ?? "";
  const deferredQ = useDeferredValue(q);
  const hasExplicitDiscovery = params.get("all") === "true" || DISCOVERY_KEYS.some((key) => params.has(key));
  const kind = (params.get("kind") as ProjectKind | null) ?? (hasExplicitDiscovery ? "" : "physical_design");
  const category = (params.get("category") as RobotCategory | null) ?? (hasExplicitDiscovery ? "" : "humanoid");
  const sort = (params.get("sort") as SortKey) || "completeness";
  const activeCount = DISCOVERY_KEYS.filter((key) => params.has(key)).length + (hasExplicitDiscovery ? 0 : 2);

  const queryOptions = useMemo<ProjectListOptions>(() => {
    const numberParam = (key: string) => { const value = params.get(key); return value && /^\d+$/u.test(value) ? Number(value) : null; };
    return {
      q: deferredQ, kind, category, sort,
      source: (params.get("source") as ProjectListOptions["source"]) ?? "",
      priceMin: numberParam("priceMin"), priceMax: numberParam("priceMax"),
      bomState: params.get("bomState") ?? "", bomLinesMin: numberParam("bomLinesMin"),
      build: (params.get("build") as ProjectListOptions["build"]) ?? "",
      difficulty: params.get("difficulty") ?? "", ros: (params.get("ros") as ProjectListOptions["ros"]) ?? "",
      license: params.get("license") ?? "", hasMedia: params.get("hasMedia") === "true", hasCad: params.get("hasCad") === "true",
      hasAssembly: params.get("hasAssembly") === "true", hasOfficialSource: params.get("hasOfficialSource") === "true",
      verifiedWithinDays: numberParam("verifiedWithinDays"), facets: true,
    };
  }, [deferredQ, kind, category, sort, params]);

  const setParam = (key: string, value: string | null, replace = false) => {
    const next = new URLSearchParams(params);
    if (!hasExplicitDiscovery && !["q", "kind", "category", "all"].includes(key)) {
      next.set("kind", "physical_design"); next.set("category", "humanoid");
    }
    next.delete("all");
    if (!value) next.delete(key); else next.set(key, value);
    if (key === "sort") trackAnalyticsEvent({ event: "project_sort_change", targetType: "filter", dimensionKey: "sort", dimensionValue: value ?? "completeness" });
    else if (key !== "q") trackAnalyticsEvent({ event: "project_filter_change", targetType: "filter", dimensionKey: "filter", dimensionValue: `${key}:${value ?? "clear"}` });
    setParams(next, { replace });
  };
  const resetDefault = () => setParams(new URLSearchParams({ kind: "physical_design", category: "humanoid" }));
  const browseAll = () => setParams(new URLSearchParams({ all: "true" }));
  const clearFilters = resetDefault;

  const pageSize = 60;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    listProjectsPage(1, pageSize, queryOptions).then(r => {
      if (cancelled) return;
      setRows(r.items); setTotal(r.total); setCatalogStats(r.stats ?? null); setFacets(r.facets ?? null); setPage(1); setLoading(false);
      if (deferredQ) {
        const queryBucket = deferredQ.length <= 3 ? "1-3" : deferredQ.length <= 10 ? "4-10" : "11+";
        trackAnalyticsEvent({ event: "project_search", targetType: "filter", dimensionKey: "query_length_bucket", dimensionValue: queryBucket });
        if (r.total === 0) trackAnalyticsEvent({ event: "project_zero_results", targetType: "filter", dimensionKey: "result_bucket", dimensionValue: "0" });
      }
    }).catch(e => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [queryOptions, deferredQ]);

  const loadMore = () => {
    if (loading) return;
    setLoadingMore(true);
    listProjectsPage(page + 1, pageSize, queryOptions).then(r => {
      setRows(prev => {
        const seen = new Set(prev.map(p => p.id));
        return [...prev, ...r.items.filter(p => !seen.has(p.id))];
      });
      setTotal(r.total); setCatalogStats(r.stats ?? catalogStats); setPage(pg => pg + 1); setLoadingMore(false);
    }).catch(() => setLoadingMore(false));
  };

  const filtered = rows;

  const stats = useMemo(() => {
    const costs = rows.map(previewCostUsd).filter((n): n is number => n != null);
    return {
      total: catalogStats?.totalProjects ?? total,
      loaded: rows.length,
      medianCost: catalogStats?.medianCostMinor != null ? catalogStats.medianCostMinor / 100 : median(costs),
      reproductions: catalogStats?.totalReproductions ?? rows.reduce((sum, project) => sum + project.reproduction_count, 0),
      successes: catalogStats?.successfulReproductions ?? rows.reduce((sum, project) => sum + project.successful_reproduction_count, 0),
      totalParts: catalogStats?.totalParts ?? null,
    };
  }, [catalogStats, rows, total]);

  const hasActiveFilters = activeCount > 0 || sort !== "completeness";
  const noProjectsExist = !loading && rows.length === 0 && !hasActiveFilters;
  const noMatches = !loading && rows.length === 0 && hasActiveFilters;
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
        <StatCell label="Parts" value={stats.totalParts != null ? stats.totalParts.toLocaleString() : "Not available"} />
        <StatCell label="Median cost" value={stats.medianCost != null ? `$${Math.round(stats.medianCost).toLocaleString()}` : "Not calculated"} />
        <StatCell label="Reproductions" value={`${stats.reproductions} · ${stats.successes} succeeded`} />
        <StatCell label="Loaded now" value={stats.loaded.toLocaleString()} />
      </div>
      {demoOnly && <div className="mb-3 border border-warning/30 bg-warning/5 p-2 text-[11px] text-muted-foreground">All projects shown are derived from downloaded demo BOM fixtures. They are example RPPS records, not validated build instructions or live community publications.</div>}

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-1.5 border border-input bg-surface px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={q} onChange={(event) => setParam("q", event.target.value || null, true)} placeholder="Search projects, maintainers, tags and summaries…" aria-label="Search projects" className="h-9 w-full bg-transparent text-[12px] outline-none" />
          {q && <button aria-label="Clear search" onClick={() => setParam("q", null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
        </label>
        <button type="button" onClick={() => setMobileFiltersOpen(true)} className="btn-ghost inline-flex lg:hidden"><SlidersHorizontal className="h-3.5 w-3.5" /> Filters ({activeCount})</button>
        <select value={sort} onChange={(event) => setParam("sort", event.target.value === "completeness" ? null : event.target.value)} aria-label="Sort projects" className="h-9 border border-input bg-surface px-2 text-[12px]">
          <option value="completeness">Most complete information</option><option value="popularity">Most popular</option><option value="trend">Trending now</option><option value="updated">Recently updated</option><option value="cost_asc">Lowest estimated cost</option><option value="repro_desc">Most independently verified</option><option value="name">Name (A–Z)</option>
        </select>
        <button type="button" onClick={browseAll} className="btn-ghost btn-sm">Browse all</button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[10px]">
        {!hasExplicitDiscovery && <span className="border border-primary/40 bg-primary/10 px-2 py-1">Default: Physical designs</span>}
        {!hasExplicitDiscovery && <span className="border border-primary/40 bg-primary/10 px-2 py-1">Humanoid</span>}
        {DISCOVERY_KEYS.filter((key) => params.has(key)).map((key) => <button type="button" key={key} onClick={() => setParam(key, null)} className="inline-flex items-center gap-1 border border-border bg-muted/35 px-2 py-1"><span className="text-muted-foreground">{filterLabel(key)}:</span>{params.get(key)}<X className="h-3 w-3" /></button>)}
        {hasActiveFilters && <button type="button" onClick={clearFilters} className="px-2 py-1 text-link hover:underline">Reset to physical humanoids</button>}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
        <ProjectFacetFilters params={params} facets={facets} activeCount={activeCount} mobileOpen={mobileFiltersOpen} setMobileOpen={setMobileFiltersOpen} setParam={(key, value) => setParam(key, value)} resetDefault={resetDefault} browseAll={browseAll} />
        <section aria-label="Project results" className="min-w-0">
      {/* States */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(p => <ProjectPreviewCard key={p.id} project={p} variant="catalog" />)}
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
        </section>
      </div>
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

function filterLabel(key: string): string {
  const labels: Record<string, string> = { q: "Search", kind: "Type", category: "Category", source: "Source", priceMin: "Min price", priceMax: "Max price", bomState: "BOM", bomLinesMin: "BOM lines", build: "Build evidence", difficulty: "Difficulty", ros: "ROS", license: "License", hasMedia: "Media", hasCad: "CAD", hasAssembly: "Assembly", hasOfficialSource: "Official source", verifiedWithinDays: "Verified within" };
  return labels[key] ?? key;
}

