import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, FileUp, Loader2, Plus, Trash2 } from "lucide-react";
import { buildsApi } from "@/lib/api/builds";
import { api } from "@/lib/api/client";
import { useComponents } from "@/lib/api/catalog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import type { CatalogPart } from "@/shared/catalog";
import type { BuildDetail, BuildItem } from "@/shared/builds";
import { attachFile, uploadFile, type FileKind } from "@/lib/api/files";

const money = (minor: number | null, currency = "USD") => minor == null
  ? "—"
  : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);

export default function Builder() {
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const selectedId = search.get("build");
  const addComponentId = search.get("add");
  const consumedAdds = useRef(new Set<string>());
  const [newName, setNewName] = useState("My robot build");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const builds = useQuery({
    queryKey: ["builds", "mine", user?.id],
    queryFn: ({ signal }) => buildsApi.list(true, signal),
    enabled: Boolean(user),
  });
  const detail = useQuery({
    queryKey: ["build", selectedId],
    queryFn: ({ signal }) => buildsApi.get(selectedId!, signal),
    enabled: Boolean(user && selectedId),
  });
  const catalog = useComponents({ q: catalogQuery, limit: 30 }, Boolean(catalogQuery.trim()));

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["build", selectedId] }),
      queryClient.invalidateQueries({ queryKey: ["builds"] }),
    ]);
  };

  const createBuild = async () => {
    setBusy(true);
    try {
      const result = await buildsApi.create({ name: newName, visibility: "private" });
      const next = new URLSearchParams(search);
      next.set("build", result.item.id);
      setSearch(next);
      toast({ title: "Persistent build created", description: "This build is stored in your local D1 database." });
      await queryClient.invalidateQueries({ queryKey: ["builds"] });
    } catch (error) {
      toast({ title: "Could not create build", description: message(error), variant: "destructive" });
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!user || !selectedId || !addComponentId || detail.isLoading) return;
    const key = `${selectedId}:${addComponentId}`;
    if (consumedAdds.current.has(key)) return;
    consumedAdds.current.add(key);
    void (async () => {
      try {
        const component = await api.get<{ item: CatalogPart }>(`/api/v1/components/${encodeURIComponent(addComponentId)}`);
        await buildsApi.addItem(selectedId, { componentId: component.item.id, description: component.item.name, quantity: 1 });
        const next = new URLSearchParams(search); next.delete("add"); setSearch(next, { replace: true });
        await refresh();
        toast({ title: "Component added", description: `${component.item.name} is now in the persistent build.` });
      } catch (error) {
        consumedAdds.current.delete(key);
        toast({ title: "Could not add component", description: message(error), variant: "destructive" });
      }
    })();
  // The URL pair is the operation identity; query state changes must not repeat it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedId, addComponentId, detail.isLoading]);

  if (authLoading) return <Centered><Loader2 className="h-5 w-5 animate-spin" /> Loading account…</Centered>;
  if (!user) return (
    <Centered>
      <div className="section-title">Persistent build workspace</div>
      <h1 className="text-xl font-bold">Sign in to create a D1-backed build</h1>
      <p className="max-w-xl text-sm text-muted-foreground">Build items, supplier selections, progress, and exports are private by default and authorized by the Worker.</p>
      <Link to={`/auth?next=${encodeURIComponent(`/builder?${search}`)}`} className="btn-primary">Sign in</Link>
    </Centered>
  );

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Tools · persistent build workspace</div>
          <h1 className="text-[22px] font-bold">{detail.data?.item.name ?? "Your builds"}</h1>
          <p className="text-xs text-muted-foreground">Worker-authorized · D1 persisted · private by default</p>
        </div>
        <div className="flex gap-2">
          <Link to="/boms" className="btn-ghost">BOM templates</Link>
          {detail.data && <>
            <a href={`/api/v1/builds/${encodeURIComponent(detail.data.item.id)}/export?format=csv`} className="btn-ghost inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" /> CSV</a>
            <button className="btn-ghost inline-flex items-center gap-1" onClick={() => void copySummary(detail.data.item)}><Copy className="h-3.5 w-3.5" /> Summary</button>
          </>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="surface-card p-3">
            <div className="section-title mb-2">Create build</div>
            <input className="input-bare h-9 w-full" value={newName} maxLength={120} onChange={(event) => setNewName(event.target.value)} />
            <button disabled={busy || newName.trim().length < 2} onClick={() => void createBuild()} className="btn-primary mt-2 w-full disabled:opacity-50">{busy ? "Creating…" : "Create private build"}</button>
          </div>
          <div className="surface-card overflow-hidden">
            <div className="border-b border-border p-3 section-title">My builds</div>
            {builds.isLoading && <div className="p-3 text-xs text-muted-foreground">Loading…</div>}
            {builds.data?.items.length === 0 && <div className="p-3 text-xs text-muted-foreground">No builds yet.</div>}
            {builds.data?.items.map((build) => (
              <button key={build.id} onClick={() => navigate(`/builder?build=${encodeURIComponent(build.id)}`)} className={`block w-full border-b border-border p-3 text-left last:border-0 ${build.id === selectedId ? "bg-primary/10" : "hover:bg-muted/50"}`}>
                <div className="text-sm font-medium">{build.name}</div>
                <div className="mt-1 flex justify-between text-[10px] uppercase text-muted-foreground"><span>{build.status}</span><span>{build.progress_percent}%</span></div>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          {!selectedId && <div className="surface-card p-8 text-center text-sm text-muted-foreground">Select a build or create one. A component passed from Part Detail will be added after you select a build.</div>}
          {detail.isLoading && <Centered><Loader2 className="h-5 w-5 animate-spin" /> Loading build…</Centered>}
          {detail.error && <div className="surface-card p-4 text-sm text-negative">{message(detail.error)}</div>}
          {detail.data && <BuildWorkspace build={detail.data.item} catalogQuery={catalogQuery} setCatalogQuery={setCatalogQuery} catalog={catalog.data?.items ?? []} catalogLoading={catalog.isLoading} onRefresh={refresh} />}
        </main>
      </div>
    </div>
  );
}

function BuildWorkspace({ build, catalogQuery, setCatalogQuery, catalog, catalogLoading, onRefresh }: { build: BuildDetail; catalogQuery: string; setCatalogQuery: (value: string) => void; catalog: CatalogPart[]; catalogLoading: boolean; onRefresh: () => Promise<void> }) {
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const total = useMemo(() => build.items.reduce((sum, item) => {
    const selected = item.availableOffers.find((offer) => offer.id === item.selectedSupplierOfferId);
    return sum + (item.unitCostMinor ?? selected?.unitPriceMinor ?? 0) * item.quantity;
  }, 0), [build.items]);

  const mutateItem = async (item: BuildItem, changes: Parameters<typeof buildsApi.updateItem>[2]) => {
    setBusyItem(item.id);
    try { await buildsApi.updateItem(build.id, item.id, changes); await onRefresh(); }
    catch (error) { toast({ title: "Build update failed", description: message(error), variant: "destructive" }); }
    finally { setBusyItem(null); }
  };

  const addPart = async (part: CatalogPart) => {
    setBusyItem(part.id);
    try { await buildsApi.addItem(build.id, { componentId: part.id, description: part.name, quantity: 1 }); setCatalogQuery(""); await onRefresh(); }
    catch (error) { toast({ title: "Could not add part", description: message(error), variant: "destructive" }); }
    finally { setBusyItem(null); }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const kind = inferFileKind(file);
      const result = await uploadFile(file, kind, "private");
      if (result.status !== "ready") {
        toast({ title: "File uploaded to quarantine", description: `Safety status: ${result.scanStatus}. It was not attached.` });
        return;
      }
      await attachFile(result.fileId, { entityType: "build", entityId: build.id, purpose: kind });
      await onRefresh();
      toast({ title: "File uploaded", description: `${file.name} is stored in R2 and attached to this build.` });
    } catch (error) { toast({ title: "Upload failed", description: message(error), variant: "destructive" }); }
    finally { setUploading(false); }
  };

  return <>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Kpi label="Known cost" value={money(total, build.currency)} />
      <Kpi label="BOM lines" value={String(build.items.length)} />
      <Kpi label="Progress" value={`${build.progress_percent}%`} />
      <Kpi label="Visibility" value={build.visibility} />
    </div>
    <div className="surface-card overflow-x-auto">
      <table className="data-table min-w-[980px]">
        <thead><tr><th>Component / line</th><th className="text-right">Qty</th><th>Supplier offer</th><th>Status</th><th className="text-right">Extended</th><th></th></tr></thead>
        <tbody>
          {build.items.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">No components yet. Search the catalog below.</td></tr>}
          {build.items.map((item) => {
            const selected = item.availableOffers.find((offer) => offer.id === item.selectedSupplierOfferId);
            const unit = item.unitCostMinor ?? selected?.unitPriceMinor ?? null;
            return <tr key={item.id}>
              <td>{item.componentSlug ? <Link to={`/parts/${item.componentCategory}/${item.componentSlug}`} className="font-medium hover:text-primary">{item.componentName ?? item.description}</Link> : <span className="font-medium">{item.description}</span>}<div className="text-[10px] text-muted-foreground">{item.componentCategory ?? "custom line"}</div></td>
              <td className="text-right"><input aria-label={`Quantity for ${item.description}`} type="number" min="0.001" step="1" defaultValue={item.quantity} onBlur={(event) => { const quantity = Number(event.target.value); if (quantity > 0 && quantity !== item.quantity) void mutateItem(item, { quantity }); }} className="input-bare h-8 w-20 text-right mono" /></td>
              <td><select aria-label={`Supplier offer for ${item.description}`} value={item.selectedSupplierOfferId ?? ""} onChange={(event) => { const offer = item.availableOffers.find((candidate) => candidate.id === event.target.value); void mutateItem(item, { selectedSupplierOfferId: offer?.id ?? null, unitCostMinor: offer?.unitPriceMinor ?? null }); }} className="input-bare h-8 max-w-[260px]">
                <option value="">No offer selected</option>
                {item.availableOffers.map((offer) => <option key={offer.id} value={offer.id}>{offer.supplierName} · {money(offer.unitPriceMinor, offer.currency)} · {offer.leadTimeDays}d{offer.isDemo ? " · demo" : ""}</option>)}
              </select></td>
              <td><select aria-label={`Status for ${item.description}`} value={item.status} onChange={(event) => void mutateItem(item, { status: event.target.value })} className="input-bare h-8"><option value="needed">Needed</option><option value="selected">Selected</option><option value="ordered">Ordered</option><option value="purchased">Purchased</option><option value="fabricated">Fabricated</option><option value="installed">Installed</option><option value="replaced">Replaced</option><option value="skipped">Skipped</option></select></td>
              <td className="text-right mono font-medium">{unit == null ? "—" : money(unit * item.quantity, selected?.currency ?? build.currency)}</td>
              <td className="text-right"><button disabled={busyItem === item.id} aria-label={`Delete ${item.description}`} className="btn-ghost btn-sm text-negative" onClick={() => void (async () => { setBusyItem(item.id); try { await buildsApi.deleteItem(build.id, item.id); await onRefresh(); } finally { setBusyItem(null); } })()}><Trash2 className="h-3.5 w-3.5" /></button></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <div className="surface-card p-3">
      <div className="section-title mb-2">Add catalog component</div>
      <input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search components by name, maker, or tag" className="input-bare h-9 w-full" />
      {catalogLoading && <div className="mt-2 text-xs text-muted-foreground">Searching D1…</div>}
      {catalogQuery.trim() && <div className="mt-2 max-h-64 overflow-y-auto border border-border">
        {catalog.map((part) => <div key={part.id} className="flex items-center justify-between gap-3 border-b border-border p-2 last:border-0"><div><div className="text-sm font-medium">{part.name}</div><div className="text-[10px] text-muted-foreground">{part.maker} · {part.category} · {part.isDemo ? "demo fixture" : "live"}</div></div><button disabled={busyItem === part.id} onClick={() => void addPart(part)} className="btn-primary btn-sm inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Add</button></div>)}
        {!catalogLoading && catalog.length === 0 && <div className="p-3 text-xs text-muted-foreground">No matching components.</div>}
      </div>}
    </div>
    <div className="surface-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="section-title">Build files · R2</div><p className="text-[11px] text-muted-foreground">CAD, URDF/MJCF, firmware, configurations, documents, images, and test evidence.</p></div><label className={`btn-primary btn-sm inline-flex cursor-pointer items-center gap-1 ${uploading ? "pointer-events-none opacity-50" : ""}`}><FileUp className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Upload file"}<input type="file" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></label></div>
      {build.files.length === 0 ? <div className="mt-3 text-xs text-muted-foreground">No attached files.</div> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{build.files.map((file) => <a key={file.id} href={`/api/v1/files/${encodeURIComponent(file.id)}/content`} className="rounded border border-border p-2 hover:border-primary/50"><div className="truncate text-sm font-medium">{file.originalName}</div><div className="mt-1 text-[10px] text-muted-foreground">{file.kind} · {formatBytes(file.sizeBytes)} · {file.visibility}</div></a>)}</div>}
    </div>
  </>;
}

function Kpi({ label, value }: { label: string; value: string }) { return <div className="surface-card p-3"><div className="section-title">{label}</div><div className="mono text-lg font-bold capitalize">{value}</div></div>; }
function Centered({ children }: { children: React.ReactNode }) { return <div className="mx-auto flex min-h-[45vh] max-w-3xl flex-col items-center justify-center gap-3 px-4 text-center">{children}</div>; }
function message(error: unknown): string { return error instanceof Error ? error.message : "Unexpected error."; }

async function copySummary(build: BuildDetail): Promise<void> {
  const lines = [`Build: ${build.name}`, `Status: ${build.status} · Progress: ${build.progress_percent}%`, `Visibility: ${build.visibility}`, "", ...build.items.map((item) => `- ${item.quantity} ${item.unit} · ${item.componentName ?? item.description} · ${item.status} · ${item.selectedSupplierName ?? "no supplier selected"}`)];
  try { await navigator.clipboard.writeText(lines.join("\n")); toast({ title: "Build summary copied" }); }
  catch { toast({ title: "Clipboard unavailable", variant: "destructive" }); }
}

function inferFileKind(file: File): FileKind {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (file.type.startsWith("image/")) return "image";
  if (["step", "stp", "iges", "igs", "stl", "obj", "3mf"].includes(extension ?? "")) return "cad";
  if (extension === "urdf") return "urdf";
  if (extension === "mjcf") return "mjcf";
  if (["csv", "xlsx"].includes(extension ?? "")) return "bom";
  if (["bin", "hex", "uf2", "zip"].includes(extension ?? "")) return "firmware";
  if (["yaml", "yml", "toml", "json", "xml"].includes(extension ?? "")) return "configuration";
  if (["pdf", "md", "txt"].includes(extension ?? "")) return "document";
  return "other";
}
function formatBytes(value: number): string { return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MiB` : `${Math.max(1, Math.round(value / 1024))} KiB`; }
