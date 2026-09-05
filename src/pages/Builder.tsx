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
import type { BuildDetail, BuildItem, BuildStep } from "@/shared/builds";
import { attachFile, uploadFile, type FileKind } from "@/lib/api/files";
import { organizationsApi, type Organization } from "@/lib/api/organizations";
import { AiFormDraft } from "@/components/ai/AiFormDraft";
import { AiNarrativeComposer } from "@/components/ai/AiNarrativeComposer";
import { SubmissionQualityCard } from "@/components/ai/SubmissionQualityCard";
import { reviewSubmission, type SubmissionQualityReview } from "@/lib/assistant";
import { ProductStatusBadge } from "@/components/common/ProductStatusBadge";
import { PRODUCT_STATUSES } from "@/lib/product-status";

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
  const [newDescription, setNewDescription] = useState("");
  const [newOrganizationId, setNewOrganizationId] = useState("");
  const [newVisibility, setNewVisibility] = useState<BuildDetail["visibility"]>("private");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [qualityReview, setQualityReview] = useState<SubmissionQualityReview | null>(null);
  const [reviewedFingerprint, setReviewedFingerprint] = useState<string | null>(null);
  const [reviewUnavailable, setReviewUnavailable] = useState(false);

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
  const organizations = useQuery({
    queryKey: ["organizations", user?.id],
    queryFn: ({ signal }) => organizationsApi.list(signal),
    enabled: Boolean(user),
  });
  const buildOrganizations = (organizations.data?.items ?? []).filter((organization) =>
    ["owner", "admin", "engineer", "builder"].includes(organization.member_role),
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["build", selectedId] }),
      queryClient.invalidateQueries({ queryKey: ["builds"] }),
    ]);
  };

  const createFingerprint = JSON.stringify({ name: newName.trim(), description: newDescription.trim(), organizationId: newOrganizationId || null, visibility: newVisibility });
  const reviewIsCurrent = reviewedFingerprint === createFingerprint && (qualityReview !== null || reviewUnavailable);

  const applyBuildDraft = (draft: Record<string, unknown>) => {
    if (typeof draft.name === "string") setNewName(draft.name);
    if (typeof draft.description === "string") setNewDescription(draft.description);
  };

  const createBuild = async () => {
    setBusy(true);
    try {
      const result = await buildsApi.create({ name: newName, description: newDescription.trim() || null, organizationId: newOrganizationId || null, visibility: newVisibility });
      const next = new URLSearchParams(search);
      next.set("build", result.item.id);
      setSearch(next);
      toast({ title: "Persistent build created", description: "This build is stored for your account in this environment." });
      setQualityReview(null); setReviewedFingerprint(null); setReviewUnavailable(false); setNewDescription("");
      await queryClient.invalidateQueries({ queryKey: ["builds"] });
    } catch (error) {
      toast({ title: "Could not create build", description: message(error), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const reviewBuild = async () => {
    setBusy(true);
    setReviewUnavailable(false);
    try {
      const result = await reviewSubmission("build", newDescription.trim(), { name: newName.trim(), description: newDescription.trim(), visibility: newVisibility });
      setQualityReview(result);
      setReviewedFingerprint(createFingerprint);
      toast({ title: result.decision === "meets_standard" ? "Build description meets the quality standard" : "AI suggested improvements", description: "Review the report before creating your build passport." });
    } catch (error) {
      setQualityReview(null); setReviewUnavailable(true); setReviewedFingerprint(createFingerprint);
      toast({ title: "AI review unavailable", description: `${message(error)} You can still create the build without an AI review.`, variant: "destructive" });
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
      <div className="flex items-center gap-2"><div className="section-title">Persistent build workspace</div><ProductStatusBadge status={PRODUCT_STATUSES.buildWorkspace} /></div>
      <h1 className="text-xl font-bold">Sign in to create a persistent build</h1>
      <p className="max-w-xl text-sm text-muted-foreground">Build items, supplier selections, progress, and exports are private by default and authorized by the Worker.</p>
      <Link to={`/auth?redirect=${encodeURIComponent(`/builder?${search}`)}`} className="btn-primary">Sign in</Link>
    </Centered>
  );

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-title">Tools · persistent build workspace</div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-[22px] font-bold">{detail.data?.item.name ?? "Your builds"}</h1><ProductStatusBadge status={PRODUCT_STATUSES.buildWorkspace} /></div>
          {detail.data?.item.description && <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{detail.data.item.description}</p>}
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
            <div className="section-title mb-2">Create reproduction / build</div>
            <input className="input-bare h-9 w-full" value={newName} maxLength={120} onChange={(event) => setNewName(event.target.value)} />
            <div className="mt-2"><AiNarrativeComposer form="build" value={newDescription} onChange={setNewDescription} current={{ name: newName, description: newDescription }} onApply={applyBuildDraft} title="Describe it naturally" hint="Explain what you are reproducing or building, the intended outcome, known revisions, and current uncertainties." placeholder="I am reproducing release 0.4 with the stock drivetrain, but using a different compute module…" compact rows={5} /></div>
            <details className="mt-2 rounded border border-border p-2 text-[11px]"><summary className="cursor-pointer font-medium">Ownership and visibility</summary><div className="pt-2">
            <select aria-label="Build organization" value={newOrganizationId} onChange={(event) => {
              const next = event.target.value;
              setNewOrganizationId(next);
              if (!next && newVisibility === "organization") setNewVisibility("private");
            }} className="input-bare mt-2 h-9 w-full">
              <option value="">Personal build</option>
              {buildOrganizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name} · {organization.member_role}</option>)}
            </select>
            <select aria-label="Build visibility" value={newVisibility} onChange={(event) => setNewVisibility(event.target.value as BuildDetail["visibility"])} className="input-bare mt-2 h-9 w-full">
              <option value="private">Private</option>
              <option value="organization" disabled={!newOrganizationId}>Organization members</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
            </div></details>
            {qualityReview && reviewIsCurrent && <div className="mt-2"><SubmissionQualityCard review={qualityReview} /></div>}
            {reviewUnavailable && reviewIsCurrent && <p className="mt-2 text-[10.5px] text-muted-foreground">AI review unavailable. No quality claim will be attached.</p>}
            <button disabled={busy || newName.trim().length < 2 || newDescription.trim().length < 10} onClick={() => void (reviewIsCurrent ? createBuild() : reviewBuild())} className="btn-primary mt-2 w-full disabled:opacity-50">{busy ? (reviewIsCurrent ? "Creating…" : "Reviewing…") : !reviewIsCurrent ? "Review quality with AI" : qualityReview?.decision === "needs_changes" ? "Create with acknowledged changes" : "Create build passport"}</button>
            {reviewIsCurrent && <button type="button" className="btn-ghost btn-sm mt-1 w-full" onClick={() => { setQualityReview(null); setReviewedFingerprint(null); setReviewUnavailable(false); }}>Revise and review again</button>}
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
          {detail.data && <BuildWorkspace build={detail.data.item} organizations={organizations.data?.items ?? []} userId={user.id} catalogQuery={catalogQuery} setCatalogQuery={setCatalogQuery} catalog={catalog.data?.items ?? []} catalogLoading={catalog.isLoading} onRefresh={refresh} />}
        </main>
      </div>
    </div>
  );
}

function BuildWorkspace({ build, organizations, userId, catalogQuery, setCatalogQuery, catalog, catalogLoading, onRefresh }: { build: BuildDetail; organizations: Organization[]; userId: string; catalogQuery: string; setCatalogQuery: (value: string) => void; catalog: CatalogPart[]; catalogLoading: boolean; onRefresh: () => Promise<void> }) {
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

  const currentOrganization = organizations.find((organization) => organization.id === build.organization_id);
  const canEdit = build.owner_user_id === userId || ["owner", "admin", "engineer", "builder"].includes(currentOrganization?.member_role ?? "");
  const canManageScope = build.organization_id
    ? ["owner", "admin"].includes(currentOrganization?.member_role ?? "")
    : build.owner_user_id === userId;

  return <>
    {canEdit && <BuildSettings build={build} organizations={organizations} canManageScope={canManageScope} onRefresh={onRefresh} />}
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
    <EngineeringRecords build={build} onRefresh={onRefresh} />
    <div className="surface-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="section-title">Build files · R2</div><p className="text-[11px] text-muted-foreground">CAD, URDF/MJCF, firmware, configurations, documents, images, and test evidence.</p></div><label className={`btn-primary btn-sm inline-flex cursor-pointer items-center gap-1 ${uploading ? "pointer-events-none opacity-50" : ""}`}><FileUp className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Upload file"}<input type="file" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /></label></div>
      {build.files.length === 0 ? <div className="mt-3 text-xs text-muted-foreground">No attached files.</div> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{build.files.map((file) => <a key={file.id} href={file.contentUrl} className="rounded border border-border p-2 hover:border-primary/50"><div className="truncate text-sm font-medium">{file.originalName}</div><div className="mt-1 text-[10px] text-muted-foreground">{file.kind} · {formatBytes(file.sizeBytes)} · {file.visibility}</div></a>)}</div>}
    </div>
  </>;
}

function BuildSettings({ build, organizations, canManageScope, onRefresh }: {
  build: BuildDetail;
  organizations: Organization[];
  canManageScope: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [name, setName] = useState(build.name);
  const [status, setStatus] = useState<BuildDetail["status"]>(build.status);
  const [progress, setProgress] = useState(build.progress_percent);
  const [organizationId, setOrganizationId] = useState(build.organization_id ?? "");
  const [visibility, setVisibility] = useState<BuildDetail["visibility"]>(build.visibility);
  const [saving, setSaving] = useState(false);
  const currentOrganization = organizations.find((organization) => organization.id === build.organization_id);
  const transferOrganizations = organizations.filter((organization) => ["owner", "admin"].includes(organization.member_role));
  const organizationOptions = currentOrganization && !transferOrganizations.some((organization) => organization.id === currentOrganization.id)
    ? [currentOrganization, ...transferOrganizations]
    : transferOrganizations;

  useEffect(() => {
    setName(build.name);
    setStatus(build.status);
    setProgress(build.progress_percent);
    setOrganizationId(build.organization_id ?? "");
    setVisibility(build.visibility);
  }, [build.id, build.name, build.status, build.progress_percent, build.organization_id, build.visibility, build.version]);

  const save = async () => {
    setSaving(true);
    try {
      await buildsApi.update(build.id, {
        version: build.version,
        name: name.trim(),
        status,
        progressPercent: progress,
        ...(canManageScope ? { organizationId: organizationId || null, visibility } : {}),
      });
      await onRefresh();
      toast({ title: "Build settings saved", description: "The Worker authorized and persisted this build update in D1." });
    } catch (cause) {
      toast({ title: "Could not save build settings", description: message(cause), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-card p-3">
      <div className="section-title mb-2">Build settings</div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-[10px] uppercase text-muted-foreground">Name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} className="input-bare mt-1 h-9 w-full normal-case" /></label>
        <label className="text-[10px] uppercase text-muted-foreground">Status<select value={status} onChange={(event) => setStatus(event.target.value as BuildDetail["status"])} className="input-bare mt-1 h-9 w-full normal-case"><option value="planning">Planning</option><option value="sourcing">Sourcing</option><option value="building">Building</option><option value="testing">Testing</option><option value="complete">Complete</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>
        <label className="text-[10px] uppercase text-muted-foreground">Progress<input type="number" min={0} max={100} value={progress} onChange={(event) => setProgress(Math.max(0, Math.min(100, Number(event.target.value))))} className="input-bare mt-1 h-9 w-full normal-case" /></label>
        <label className="text-[10px] uppercase text-muted-foreground">Owner scope<select disabled={!canManageScope} value={organizationId} onChange={(event) => { const next = event.target.value; setOrganizationId(next); if (!next && visibility === "organization") setVisibility("private"); }} className="input-bare mt-1 h-9 w-full normal-case disabled:opacity-60"><option value="">Personal</option>{organizationOptions.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
        <label className="text-[10px] uppercase text-muted-foreground">Visibility<select disabled={!canManageScope} value={visibility} onChange={(event) => setVisibility(event.target.value as BuildDetail["visibility"])} className="input-bare mt-1 h-9 w-full normal-case disabled:opacity-60"><option value="private">Private</option><option value="organization" disabled={!organizationId}>Organization</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3"><p className="text-[10px] text-muted-foreground">Scope transfers require organization admin access; engineering fields follow the build role policy.</p><button disabled={saving || name.trim().length < 2} onClick={() => void save()} className="btn-primary btn-sm shrink-0 disabled:opacity-50">{saving ? "Saving…" : "Save settings"}</button></div>
    </div>
  );
}

function EngineeringRecords({ build, onRefresh }: { build: BuildDetail; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState({ title: "", body: "" });
  const [configuration, setConfiguration] = useState({ name: "", format: "yaml", contentText: "" });
  const [firmware, setFirmware] = useState({ name: "", repositoryUrl: "", revision: "", licenseSpdx: "", notes: "" });
  const [calibration, setCalibration] = useState({ name: "", procedureText: "", resultNotes: "", status: "pending" as "pending" | "passed" | "failed" | "superseded" });
  const [test, setTest] = useState({ name: "", methodText: "", expectedText: "", observedText: "", result: "pending" as "pending" | "passed" | "failed" | "inconclusive", evidenceFileId: "" });

  const run = async (key: string, operation: () => Promise<unknown>, success: string, reset?: () => void) => {
    setBusy(key);
    try {
      await operation();
      reset?.();
      await onRefresh();
      toast({ title: success, description: "Saved to this persistent build." });
    } catch (error) {
      toast({ title: "Technical record update failed", description: message(error), variant: "destructive" });
    } finally { setBusy(null); }
  };

  const remove = async (kind: "configuration" | "firmware" | "calibration" | "test", id: string, name: string) => {
    if (!window.confirm(`Delete ${name}? This removes the record from this build.`)) return;
    const operations = {
      configuration: () => buildsApi.deleteConfiguration(build.id, id),
      firmware: () => buildsApi.deleteFirmware(build.id, id),
      calibration: () => buildsApi.deleteCalibration(build.id, id),
      test: () => buildsApi.deleteTest(build.id, id),
    };
    await run(`delete-${id}`, operations[kind], `${name} deleted`);
  };

  const saveStep = async () => {
    if (!step.title.trim()) return;
    await run("step", () => buildsApi.addStep(build.id, { title: step.title.trim(), body: step.body.trim() || null }), "Step saved", () => setStep({ title: "", body: "" }));
  };

  const updateStep = async (stepId: string, changes: { title?: string; body?: string | null; status?: BuildStep["status"] }) => {
    await run(`step-${stepId}`, () => buildsApi.updateStep(build.id, stepId, changes), "Step updated");
  };

  const applyAiDraft = (draft: Record<string, unknown>) => {
    const text = (key: string) => typeof draft[key] === "string" ? draft[key] as string : undefined;
    const kind = text("recordType");
    if (kind === "configuration" || (!kind && text("contentText"))) setConfiguration((current) => ({ ...current, name: text("name") ?? current.name, format: text("format") ?? current.format, contentText: text("contentText") ?? current.contentText }));
    if (kind === "firmware" || (!kind && text("repositoryUrl"))) setFirmware((current) => ({ ...current, name: text("name") ?? current.name, repositoryUrl: text("repositoryUrl") ?? current.repositoryUrl, revision: text("revision") ?? current.revision, licenseSpdx: text("licenseSpdx") ?? current.licenseSpdx, notes: text("notes") ?? current.notes }));
    if (kind === "calibration" || (!kind && text("procedureText"))) setCalibration((current) => ({ ...current, name: text("name") ?? current.name, procedureText: text("procedureText") ?? current.procedureText, resultNotes: text("resultNotes") ?? current.resultNotes }));
    if (kind === "test" || (!kind && text("methodText"))) setTest((current) => ({ ...current, name: text("name") ?? current.name, methodText: text("methodText") ?? current.methodText, expectedText: text("expectedText") ?? current.expectedText, observedText: text("observedText") ?? current.observedText }));
  };

  return <div className="surface-card p-3">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div><div className="section-title">Engineering records</div><p className="text-[11px] text-muted-foreground">Versioned configuration plus traceable firmware, calibration, and verification results.</p></div>
      <AiFormDraft form="build_record" current={{ configuration, firmware, calibration, test }} onApply={applyAiDraft} hint="Describe one configuration, firmware reference, calibration procedure, or verification test. State the record type and include only known values." />
    </div>
    <div className="grid gap-3 xl:grid-cols-2">
      <section className="rounded border border-border p-3 xl:col-span-2">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Build steps</h3><span className="badge-neutral mono">{build.steps.length}</span></div>
        <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void saveStep(); }}>
          <input aria-label="Step title" required maxLength={300} value={step.title} onChange={(event) => setStep({ ...step, title: event.target.value })} placeholder="Install drivetrain" className="input-bare h-9" />
          <textarea aria-label="Step notes" maxLength={20000} rows={3} value={step.body} onChange={(event) => setStep({ ...step, body: event.target.value })} placeholder="What needs to happen, what files or evidence are needed, and any risks." className="input-bare resize-y p-2 text-xs" />
          <button disabled={busy !== null || !step.title.trim()} className="btn-primary btn-sm justify-self-start disabled:opacity-50">Add step</button>
        </form>
        <div className="mt-3 space-y-2">{build.steps.map((item) => <EditableStepRow key={item.id} item={item} updateStep={updateStep} />)}</div>
      </section>
      <section className="rounded border border-border p-3">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Configurations</h3><span className="badge-neutral mono">{build.configurations.length}</span></div>
        <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void run("configuration", () => buildsApi.addConfiguration(build.id, configuration), "Configuration saved", () => setConfiguration({ name: "", format: "yaml", contentText: "" })); }}>
          <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2"><input aria-label="Configuration name" required maxLength={200} value={configuration.name} onChange={(event) => setConfiguration({ ...configuration, name: event.target.value })} placeholder="Motor controller" className="input-bare h-9" /><select aria-label="Configuration format" value={configuration.format} onChange={(event) => setConfiguration({ ...configuration, format: event.target.value })} className="input-bare h-9"><option>yaml</option><option>json</option><option>toml</option><option>xml</option><option>text</option></select></div>
          <textarea aria-label="Configuration content" required maxLength={200000} rows={4} value={configuration.contentText} onChange={(event) => setConfiguration({ ...configuration, contentText: event.target.value })} placeholder="motor:\n  current_limit: 12" className="input-bare resize-y p-2 mono text-xs" />
          <button disabled={busy !== null} className="btn-primary btn-sm justify-self-start disabled:opacity-50">Save configuration</button>
        </form>
        <div className="mt-3 space-y-2">{build.configurations.map((item) => <RecordRow key={item.id} title={item.name} meta={`${item.format} · v${item.version}`} detail={item.contentText ?? "Attached file"} busy={busy === `delete-${item.id}`} onDelete={() => void remove("configuration", item.id, item.name)} />)}</div>
      </section>

      <section className="rounded border border-border p-3">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Firmware</h3><span className="badge-neutral mono">{build.firmware.length}</span></div>
        <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void run("firmware", () => buildsApi.addFirmware(build.id, { ...firmware, repositoryUrl: firmware.repositoryUrl || null, revision: firmware.revision || null, licenseSpdx: firmware.licenseSpdx || null, notes: firmware.notes || null }), "Firmware reference saved", () => setFirmware({ name: "", repositoryUrl: "", revision: "", licenseSpdx: "", notes: "" })); }}>
          <input aria-label="Firmware name" required maxLength={200} value={firmware.name} onChange={(event) => setFirmware({ ...firmware, name: event.target.value })} placeholder="Drive firmware" className="input-bare h-9" />
          <input aria-label="Firmware repository URL" required type="url" maxLength={2048} value={firmware.repositoryUrl} onChange={(event) => setFirmware({ ...firmware, repositoryUrl: event.target.value })} placeholder="https://github.com/org/firmware" className="input-bare h-9" />
          <div className="grid grid-cols-2 gap-2"><input aria-label="Firmware revision" maxLength={200} value={firmware.revision} onChange={(event) => setFirmware({ ...firmware, revision: event.target.value })} placeholder="Revision / tag" className="input-bare h-9" /><input aria-label="Firmware license" maxLength={100} value={firmware.licenseSpdx} onChange={(event) => setFirmware({ ...firmware, licenseSpdx: event.target.value })} placeholder="SPDX license" className="input-bare h-9" /></div>
          <input aria-label="Firmware notes" maxLength={10000} value={firmware.notes} onChange={(event) => setFirmware({ ...firmware, notes: event.target.value })} placeholder="Reproducibility notes" className="input-bare h-9" />
          <button disabled={busy !== null} className="btn-primary btn-sm justify-self-start disabled:opacity-50">Save firmware</button>
        </form>
        <div className="mt-3 space-y-2">{build.firmware.map((item) => <RecordRow key={item.id} title={item.name} meta={[item.revision, item.licenseSpdx].filter(Boolean).join(" · ") || "Unpinned"} detail={item.repositoryUrl ?? item.notes ?? "Attached file"} href={item.repositoryUrl} busy={busy === `delete-${item.id}`} onDelete={() => void remove("firmware", item.id, item.name)} />)}</div>
      </section>

      <section className="rounded border border-border p-3">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Calibrations</h3><span className="badge-neutral mono">{build.calibrations.length}</span></div>
        <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void run("calibration", () => buildsApi.addCalibration(build.id, { name: calibration.name, procedureText: calibration.procedureText || null, resultData: calibration.resultNotes ? { notes: calibration.resultNotes } : {}, status: calibration.status }), "Calibration recorded", () => setCalibration({ name: "", procedureText: "", resultNotes: "", status: "pending" })); }}>
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2"><input aria-label="Calibration name" required maxLength={200} value={calibration.name} onChange={(event) => setCalibration({ ...calibration, name: event.target.value })} placeholder="Encoder zero" className="input-bare h-9" /><select aria-label="Calibration status" value={calibration.status} onChange={(event) => setCalibration({ ...calibration, status: event.target.value as typeof calibration.status })} className="input-bare h-9"><option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="superseded">Superseded</option></select></div>
          <textarea aria-label="Calibration procedure" maxLength={20000} rows={2} value={calibration.procedureText} onChange={(event) => setCalibration({ ...calibration, procedureText: event.target.value })} placeholder="Procedure" className="input-bare resize-y p-2 text-xs" />
          <input aria-label="Calibration result notes" maxLength={10000} value={calibration.resultNotes} onChange={(event) => setCalibration({ ...calibration, resultNotes: event.target.value })} placeholder="Result measurements / notes" className="input-bare h-9" />
          <button disabled={busy !== null} className="btn-primary btn-sm justify-self-start disabled:opacity-50">Record calibration</button>
        </form>
        <div className="mt-3 space-y-2">{build.calibrations.map((item) => <RecordRow key={item.id} title={item.name} meta={item.status} detail={item.procedureText ?? JSON.stringify(item.resultData)} busy={busy === `delete-${item.id}`} onDelete={() => void remove("calibration", item.id, item.name)} />)}</div>
      </section>

      <section className="rounded border border-border p-3">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Verification tests</h3><span className="badge-neutral mono">{build.tests.length}</span></div>
        <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void run("test", () => buildsApi.addTest(build.id, { ...test, expectedText: test.expectedText || null, observedText: test.observedText || null, evidenceFileId: test.evidenceFileId || null }), "Test result recorded", () => setTest({ name: "", methodText: "", expectedText: "", observedText: "", result: "pending", evidenceFileId: "" })); }}>
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2"><input aria-label="Test name" required maxLength={200} value={test.name} onChange={(event) => setTest({ ...test, name: event.target.value })} placeholder="No-load spin" className="input-bare h-9" /><select aria-label="Test result" value={test.result} onChange={(event) => setTest({ ...test, result: event.target.value as typeof test.result })} className="input-bare h-9"><option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option><option value="inconclusive">Inconclusive</option></select></div>
          <textarea aria-label="Test method" required maxLength={20000} rows={2} value={test.methodText} onChange={(event) => setTest({ ...test, methodText: event.target.value })} placeholder="Method and conditions" className="input-bare resize-y p-2 text-xs" />
          <div className="grid grid-cols-2 gap-2"><input aria-label="Expected test result" maxLength={20000} value={test.expectedText} onChange={(event) => setTest({ ...test, expectedText: event.target.value })} placeholder="Expected" className="input-bare h-9" /><input aria-label="Observed test result" maxLength={20000} value={test.observedText} onChange={(event) => setTest({ ...test, observedText: event.target.value })} placeholder="Observed" className="input-bare h-9" /></div>
          <select aria-label="Test evidence file" value={test.evidenceFileId} onChange={(event) => setTest({ ...test, evidenceFileId: event.target.value })} className="input-bare h-9"><option value="">No evidence file</option>{build.files.map((file) => <option key={file.id} value={file.id}>{file.originalName}</option>)}</select>
          <button disabled={busy !== null} className="btn-primary btn-sm justify-self-start disabled:opacity-50">Record test</button>
        </form>
        <div className="mt-3 space-y-2">{build.tests.map((item) => <RecordRow key={item.id} title={item.name} meta={item.result} detail={item.observedText ?? item.methodText} busy={busy === `delete-${item.id}`} onDelete={() => void remove("test", item.id, item.name)} />)}</div>
      </section>
    </div>
  </div>;
}

function EditableStepRow({ item, updateStep }: { item: BuildStep; updateStep: (stepId: string, changes: { title?: string; body?: string | null; status?: BuildStep["status"] }) => Promise<void> }) {
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(item.title);
    setBody(item.body ?? "");
  }, [item.id, item.title, item.body]);

  const dirty = title !== item.title || body !== (item.body ?? "");

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await updateStep(item.id, { title: title.trim(), body: body.trim() || null });
    } finally {
      setSaving(false);
    }
  };

  return <div className="rounded border border-border bg-muted/20 p-2">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="badge-neutral mono text-[9px]">#{item.sortOrder + 1}</span><span className="badge-neutral text-[9px] uppercase">{item.status}</span>{item.status === "complete" && <span className="badge-neutral text-[9px] uppercase">Completed</span>}</div>
        <div className="mt-2 grid gap-2">
          <input aria-label={`Title for ${item.title}`} value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => void save()} className="input-bare h-8" />
          <textarea aria-label={`Notes for ${item.title}`} value={body} onChange={(event) => setBody(event.target.value)} onBlur={() => void save()} rows={2} className="input-bare resize-y p-2 text-xs" placeholder="Notes, evidence, parts, or risks." />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">{item.completedByUserId ? `Completed by ${item.completedByUserId}` : "Not completed yet."}</p>
      </div>
      <div className="flex items-center gap-2">
        <select aria-label={`Status for ${item.title}`} value={item.status} onChange={(event) => void updateStep(item.id, { status: event.target.value as BuildStep["status"] })} className="input-bare h-8">
          <option value="pending">Pending</option>
          <option value="blocked">Blocked</option>
          <option value="in_progress">In progress</option>
          <option value="complete">Complete</option>
          <option value="skipped">Skipped</option>
        </select>
        <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="btn-ghost btn-sm disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  </div>;
}

function RecordRow({ title, meta, detail, href, busy, onDelete }: { title: string; meta: string; detail: string; href?: string | null; busy: boolean; onDelete: () => void }) {
  return <div className="flex items-start justify-between gap-2 rounded border border-border bg-muted/20 p-2">
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium">{title}</span><span className="badge-neutral text-[9px] uppercase">{meta}</span></div>{href ? <a href={href} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[10px] text-primary hover:underline">{detail}</a> : <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[10px] text-muted-foreground">{detail}</p>}</div>
    <button type="button" disabled={busy} aria-label={`Delete ${title}`} onClick={onDelete} className="btn-ghost btn-sm shrink-0 text-negative disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
  </div>;
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
