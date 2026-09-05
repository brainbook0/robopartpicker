import { useCallback, useEffect, useState } from "react";
import { Activity, BarChart3, Download, Loader2, RefreshCw, Search, ShieldAlert, ShieldCheck, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { PageMeta } from "@/components/PageMeta";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api/client";
import { adminAnalyticsApi, type AdminAnalyticsBundle, type MetricRow } from "@/lib/api/adminAnalytics";

export default function AdminAnalytics() {
  const { user, loading: authLoading } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AdminAnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setForbidden(false); setError(null);
    try { setData(await adminAnalyticsApi.load(days, signal)); }
    catch (cause) { if (cause instanceof DOMException) return; if (cause instanceof ApiError && cause.status === 403) setForbidden(true); else setError(cause instanceof Error ? cause.message : "Analytics unavailable."); }
    finally { setLoading(false); }
  }, [days, user]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  if (authLoading || loading) return <AdminState icon={<Loader2 className="h-5 w-5 animate-spin" />} title="Loading analytics" text="Checking platform role and aggregate metrics." />;
  if (!user) return <AdminState icon={<ShieldAlert className="h-5 w-5" />} title="Authentication required" text={<><Link to="/auth" className="text-primary hover:underline">Sign in</Link> with an administrator or moderator account.</>} />;
  if (forbidden) return <AdminState icon={<ShieldAlert className="h-5 w-5 text-warning" />} title="Administrator access required" text="The Worker denied access and returned no analytics data." />;
  if (error || !data) return <AdminState icon={<ShieldAlert className="h-5 w-5 text-destructive" />} title="Analytics unavailable" text={error ?? "No aggregate analytics response was returned."} />;

  const { summary, content, discovery, acquisition, catalog, operations } = data;
  return <main className="mx-auto max-w-[1400px] px-4 py-5">
    <PageMeta title="Admin analytics | RoboPartPicker" description="Private aggregate product and catalog analytics." path="/admin/analytics" noIndex />
    <header className="flex flex-wrap items-start justify-between gap-3"><div><div className="section-title">Administrator workspace</div><h1 className="text-xl font-bold">Platform analytics and catalog health</h1><p className="mt-1 max-w-3xl text-[11px] leading-5 text-muted-foreground">First-party daily aggregates only. No IPs, cookies, fingerprints, user identities, raw search text or per-person history.</p></div><div className="flex items-center gap-2"><select value={days} onChange={(event)=>setDays(Number(event.target.value))} aria-label="Analytics date range" className="h-9 border border-input bg-surface px-2 text-xs"><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select><button onClick={()=>void load()} className="btn-ghost btn-sm"><RefreshCw className="h-3.5 w-3.5" />Refresh</button><a href={adminAnalyticsApi.exportUrl(days)} className="btn-primary btn-sm"><Download className="h-3.5 w-3.5" />CSV</a></div></header>

    <nav aria-label="Analytics sections" className="mt-4 flex gap-1 overflow-x-auto border-b border-border pb-2 text-[10px]">{[["overview","Overview"],["engagement","Engagement"],["discovery","Discovery"],["acquisition","Acquisition"],["catalog","Catalog health"],["operations","Operations"]].map(([id,label])=><a key={id} href={`#${id}`} className="shrink-0 border border-border px-2 py-1 hover:border-primary">{label}</a>)}</nav>

    <section id="overview" className="scroll-mt-16 pt-4"><SectionTitle icon={<BarChart3 className="h-4 w-4" />} title="Overview" /><div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Kpi label="Page views" value={summary.totalViews} /><Kpi label="Interaction events" value={summary.totalEvents} /><Kpi label="Project opens" value={metric(content.funnel,"event","project_open")} /><Kpi label="Quote starts" value={metric(content.funnel,"event","quote_start")} /></div><div className="mt-3 grid gap-3 lg:grid-cols-2"><Bars title="Daily page views" rows={summary.daily} labelKey="day" valueKey="views" /><Bars title="Daily interactions" rows={summary.eventDaily} labelKey="day" valueKey="events" /></div></section>

    <section id="engagement" className="scroll-mt-16 pt-6"><SectionTitle icon={<Activity className="h-4 w-4" />} title="Content and engagement" /><div className="grid gap-3 xl:grid-cols-3"><DataTable title="Event mix" rows={summary.eventMix} /><DataTable title="Top project interactions" rows={content.projects} /><DataTable title="Featured controls" rows={content.featured} /></div></section>

    <section id="discovery" className="scroll-mt-16 pt-6"><SectionTitle icon={<Search className="h-4 w-4" />} title="Discovery" /><div className="grid gap-3 xl:grid-cols-4"><DataTable title="Filter usage" rows={discovery.filters} /><DataTable title="Sort usage" rows={discovery.sorts} /><DataTable title="Search length buckets" rows={discovery.searches} /><DataTable title="Zero-result days" rows={discovery.zeroResults} /></div></section>

    <section id="acquisition" className="scroll-mt-16 pt-6"><SectionTitle icon={<Activity className="h-4 w-4" />} title="Acquisition" /><div className="grid gap-3 xl:grid-cols-4"><DataTable title="Sources" rows={acquisition.sources} /><DataTable title="Campaigns" rows={acquisition.campaigns} /><DataTable title="Countries" rows={acquisition.countries} /><DataTable title="Devices" rows={acquisition.devices} /></div></section>

    <section id="catalog" className="scroll-mt-16 pt-6"><SectionTitle icon={<ShieldCheck className="h-4 w-4" />} title="Catalog health" /><div className="grid grid-cols-2 gap-2 md:grid-cols-5"><Kpi label="Published projects" value={num(catalog.projects.total)} /><Kpi label="With source" value={num(catalog.projects.withSource)} /><Kpi label="With media" value={num(catalog.projects.withMedia)} /><Kpi label="With CAD" value={num(catalog.projects.withCad)} /><Kpi label="Stale over 180d" value={num(catalog.projects.stale)} /></div><div className="mt-3 grid gap-3 lg:grid-cols-2"><DataTable title="Current BOM states" rows={catalog.bomStates} /><DataTable title="Price coverage" rows={[catalog.priceCoverage]} /></div></section>

    <section id="operations" className="scroll-mt-16 pt-6"><SectionTitle icon={<Wrench className="h-4 w-4" />} title="Operations" /><div className="grid gap-3 xl:grid-cols-4"><DataTable title="Import jobs" rows={operations.imports} /><DataTable title="BOM generation" rows={operations.bomRuns} /><DataTable title="Quote requests" rows={operations.quotes} /><DataTable title="Ownership claims" rows={operations.claims} /></div><p className="mt-2 text-[9px] text-muted-foreground">Generated {new Date(operations.generatedAt).toLocaleString()}</p></section>
  </main>;
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) { return <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">{icon}{title}</h2>; }
function Kpi({ label, value }: { label: string; value: number }) { return <div className="surface-card p-3"><div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 font-mono text-xl font-bold">{value.toLocaleString()}</div></div>; }
function Bars({ title, rows, labelKey, valueKey }: { title:string; rows:MetricRow[]; labelKey:string; valueKey:string }) { const max=Math.max(1,...rows.map(r=>num(r[valueKey]))); return <section className="surface-card p-3"><h3 className="text-[11px] font-semibold">{title}</h3><div className="mt-3 space-y-1.5">{rows.length===0?<Empty />:rows.map((row,index)=><div key={index} className="grid grid-cols-[90px_minmax(0,1fr)_60px] items-center gap-2 text-[9px]"><span className="truncate">{String(row[labelKey]??"")}</span><span className="h-2 bg-muted"><span className="block h-full bg-primary" style={{width:`${Math.max(2,(num(row[valueKey])/max)*100)}%`}} /></span><span className="text-right font-mono">{num(row[valueKey]).toLocaleString()}</span></div>)}</div></section>; }
function DataTable({ title, rows }: { title:string; rows:MetricRow[] }) { const columns=rows[0]?Object.keys(rows[0]):[]; return <section className="surface-card min-w-0 overflow-hidden"><h3 className="border-b border-border px-3 py-2 text-[11px] font-semibold">{title}</h3>{rows.length===0?<div className="p-3"><Empty /></div>:<div className="overflow-x-auto"><table className="w-full text-[9px]"><thead><tr className="bg-muted/35 text-left uppercase text-muted-foreground">{columns.map(c=><th key={c} className="px-2 py-1.5">{c}</th>)}</tr></thead><tbody>{rows.slice(0,100).map((row,index)=><tr key={index} className="border-t border-border/60">{columns.map(c=><td key={c} className="max-w-[220px] truncate px-2 py-1.5 font-mono">{String(row[c]??"")}</td>)}</tr>)}</tbody></table></div>}</section>; }
function Empty(){return <div className="border border-dashed border-border p-3 text-[10px] text-muted-foreground">No aggregate data for this range.</div>;}
function metric(rows:MetricRow[],key:string,value:string){return num(rows.find(r=>r[key]===value)?.events);}
function num(value:unknown){const n=Number(value??0);return Number.isFinite(n)?n:0;}
function AdminState({icon,title,text}:{icon:React.ReactNode;title:string;text:React.ReactNode}){return <main className="mx-auto max-w-[900px] px-4 py-10"><section className="surface-card flex items-start gap-3 p-5" role="status">{icon}<div><h1 className="font-semibold">{title}</h1><div className="mt-1 text-sm text-muted-foreground">{text}</div></div></section></main>;}
