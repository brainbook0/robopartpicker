import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Download, GitFork } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { bomsApi } from "@/lib/api/builds";

import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { BomReviewEditor } from "@/components/boms/BomReviewEditor";
import { BomItemsDisplay } from "@/components/boms/BomItemsDisplay";
import { PageMeta } from "@/components/PageMeta";
import { GetQuoteForm } from "@/components/quotes/GetQuoteForm";

export default function BomDetail() {
  const { slug = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [forking, setForking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: ["bom", slug], queryFn: ({ signal }) => bomsApi.get(slug, signal), enabled: Boolean(slug) });
  const bom = query.data?.item;

  if (query.isLoading) return <div className="mx-auto max-w-[1400px] p-8 text-sm text-muted-foreground">Loading BOM…</div>;
  if (query.error || !bom) return <div className="mx-auto max-w-[1400px] p-8 text-negative">{query.error?.message ?? "BOM not found."}</div>;

  const fork = async () => {
    if (!user) { navigate(`/auth?redirect=${encodeURIComponent(`/boms/${slug}`)}`); return; }
    setForking(true);
    try {
      const result = await bomsApi.forkToBuild(bom.id, { name: `${bom.name} build`, visibility: "private" });
      toast({ title: "Persistent build created", description: `${bom.items.length} BOM lines copied to your private build.` });
      navigate(`/builder?build=${encodeURIComponent(result.item.id)}`);
    } catch (error) { showError("Could not create build", error); }
    finally { setForking(false); }
  };

  const confirmBom = async () => {
    if (!user) { navigate(`/auth?redirect=${encodeURIComponent(`/boms/${slug}`)}`); return; }
    if (!bom.version) return;
    setConfirming(true);
    try {
      await bomsApi.confirm(bom.id, bom.version.id);
      await query.refetch();
      toast({ title: "BOM confirmed", description: "The immutable BOM version is now available for human-reviewed quote requests." });
    } catch (error) { showError("Could not confirm BOM", error); }
    finally { setConfirming(false); }
  };

  const canEdit = Boolean(user && bom.owner_user_id === user.id);
  const canConfirm = Boolean(canEdit && bom.version && !bom.version.confirmedAt);

  return <div className="mx-auto max-w-[1400px] px-4 py-6">
    <PageMeta title={`${bom.name}: ${bom.totals.lines} line bill of materials | RoboPartPicker`} description={`${bom.name} contains ${bom.totals.lines} line items and ${bom.totals.units} total units. Inspect identities, quantities, evidence and observed pricing.`} path={`/boms/${bom.slug ?? bom.id}`} />
    <div className="mb-1 text-xs text-muted-foreground"><Link to="/boms" className="hover:text-primary">BOMs</Link> / {bom.name}</div>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><h1 className="text-[22px] font-bold">{bom.name}</h1><span className={`pill ${bom.version?.confirmedAt ? "pill-good" : "pill-yellow"}`}>{bom.version?.confirmedAt ? "confirmed" : "partial / unconfirmed"}</span></div><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{bom.version?.notes ?? "Generated BOM with line-level source evidence."}</p><div className="mt-1 text-[10px] uppercase text-muted-foreground">Version {bom.version?.label ?? "unknown"} · {bom.version?.currency ?? "USD"}</div></div>
      <div className="flex flex-wrap gap-2"><a className="btn-ghost inline-flex items-center gap-1" href={`/api/v1/boms/${encodeURIComponent(bom.id)}/export?format=csv`}><Download className="h-3.5 w-3.5" /> CSV</a><a className="btn-ghost inline-flex items-center gap-1" href={`/api/v1/boms/${encodeURIComponent(bom.id)}/export?format=json`}><Download className="h-3.5 w-3.5" /> RPPS JSON</a>{canEdit && <button onClick={() => setEditing((value) => !value)} className="btn-ghost">{editing ? "Close review" : "Review and edit"}</button>}{canConfirm && <button onClick={() => void confirmBom()} disabled={confirming} className="btn-primary inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {confirming ? "Confirming…" : "Confirm BOM"}</button>}<button onClick={() => void fork()} disabled={forking} className="btn-ghost inline-flex items-center gap-1"><GitFork className="h-3.5 w-3.5" /> {forking ? "Creating…" : "Fork to build"}</button></div>
    </div>

    {editing && <BomReviewEditor bom={bom} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); await query.refetch(); }} />}

    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4"><Kpi label="Known cost" value={money(bom.totals.knownCostMinor, bom.version?.currency)} /><Kpi label="Lines" value={String(bom.totals.lines)} /><Kpi label="Units" value={String(bom.totals.units)} /><Kpi label="Unpriced" value={String(bom.totals.unpricedLines)} /></div>

    <div className="mt-4"><GetQuoteForm bomId={bom.id} projectId={bom.project_id ?? undefined} signedIn={Boolean(user)} defaultEmail={user?.email ?? ""} /></div>

    <div className="mt-4"><BomItemsDisplay bom={bom} /></div>
  </div>;
}

function Kpi({ label, value }: { label: string; value: string }) { return <div className="surface-card p-3"><div className="section-title">{label}</div><div className="mono text-lg font-bold">{value}</div></div>; }
function money(minor: number | null, currency = "USD"): string { return minor == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: currency ?? "USD" }).format(minor / 100); }
function showError(title: string, error: unknown) { toast({ title, description: error instanceof Error ? error.message : "Unexpected error.", variant: "destructive" }); }
