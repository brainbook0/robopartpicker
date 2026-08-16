import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  Download, ExternalLink, Github, FileJson, Trash2, Lock, Link2, Cpu, FileUp,
  Clock, DollarSign, Package, ListChecks, ShieldCheck, BookOpen, AlertTriangle,
  Play, Users, Code2, GitFork, Truck,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cloneProject, deleteProject, downloadRpps, getProjectBySlug, getProjectEstimate, updateProjectRpps, updateProjectScope, type ProjectRow, type SourcingEstimate } from "@/lib/projects";
import { ProjectLineage } from "@/pages/ProjectLineage";
import { organizationsApi, type Organization } from "@/lib/api/organizations";
import { attachFile, detachProjectFile, listProjectFiles, uploadFile, type FileKind, type ProjectFile } from "@/lib/api/files";
import { RelatedDiscussionList } from "@/components/community/RelatedDiscussionList";
import { createReleaseBuildPassport, listPortableReleases, type PortableRppsReleaseSummary } from "@/lib/rpps/client";
import { ReleaseCollaborationPanel } from "@/components/projects/ReleaseCollaborationPanel";
import { rfqApi } from "@/lib/api/rfq";
import { bomsApi } from "@/lib/api/builds";
import type { BomDetail } from "@/shared/builds";

const UrdfModelViewer = lazy(() => import("@/components/projects/UrdfModelViewer"));
const StlModelViewer = lazy(() => import("@/components/projects/StlModelViewer"));

export default function ProjectDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const nav = useNavigate();
  const [p, setP] = useState<ProjectRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [managedFiles, setManagedFiles] = useState<ProjectFile[]>([]);
  const [managedFilesLoading, setManagedFilesLoading] = useState(false);
  const [fileBusy, setFileBusy] = useState<string | null>(null);
  const [portableReleases, setPortableReleases] = useState<PortableRppsReleaseSummary[]>([]);
  const [estimate, setEstimate] = useState<SourcingEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState(false);
  const [normalizedBom, setNormalizedBom] = useState<BomDetail | null>(null);
  const [normalizedBomLoading, setNormalizedBomLoading] = useState(false);
  const [reproducing, setReproducing] = useState(false);
  const [forking, setForking] = useState(false);
  const [creatingRfq, setCreatingRfq] = useState(false);
  const projectId = p?.id;

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    getProjectBySlug(slug).then(r => { setP(r); setLoading(false); }).catch(e => { setErr(e.message); setLoading(false); });
  }, [slug]);

  useEffect(() => {
    if (!user) { setOrganizations([]); return; }
    const controller = new AbortController();
    organizationsApi.list(controller.signal).then((result) => setOrganizations(result.items)).catch(() => undefined);
    return () => controller.abort();
  }, [user]);

  useEffect(() => {
    if (!projectId) { setManagedFiles([]); return; }
    let cancelled = false;
    setManagedFilesLoading(true);
    listProjectFiles(projectId)
      .then((items) => { if (!cancelled) setManagedFiles(items); })
      .catch((error) => { if (!cancelled) toast({ title: "Project files unavailable", description: errorMessage(error), variant: "destructive" }); })
      .finally(() => { if (!cancelled) setManagedFilesLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!p?.bom_id) { setNormalizedBom(null); return; }
    const controller = new AbortController();
    setNormalizedBomLoading(true);
    bomsApi.get(p.bom_id, controller.signal)
      .then((result) => setNormalizedBom(result.item))
      .catch(() => setNormalizedBom(null))
      .finally(() => setNormalizedBomLoading(false));
    return () => controller.abort();
  }, [p?.bom_id]);

  useEffect(() => {
    if (!projectId) { setPortableReleases([]); return; }
    let cancelled = false;
    listPortableReleases(projectId).then((items) => { if (!cancelled) setPortableReleases(items); }).catch(() => { if (!cancelled) setPortableReleases([]); });
    return () => { cancelled = true; };
  }, [projectId, user?.id]);

  useEffect(() => {
    if (!projectId || p?.project_kind === "commercial_showcase") {
      setEstimate(null);
      setEstimateError(false);
      setEstimateLoading(false);
      return;
    }
    let cancelled = false;
    setEstimateLoading(true);
    setEstimateError(false);
    getProjectEstimate(projectId)
      .then((value) => { if (!cancelled) setEstimate(value); })
      .catch(() => { if (!cancelled) setEstimateError(true); })
      .finally(() => { if (!cancelled) setEstimateLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, p?.project_kind]);

  if (loading) return <div className="mx-auto max-w-[1200px] px-4 py-8 text-[12px] text-muted-foreground">Loading…</div>;
  if (err) return <div className="mx-auto max-w-[1200px] px-4 py-8 text-[12px] text-destructive">Error: {err}</div>;
  if (!p) return <div className="mx-auto max-w-[1200px] px-4 py-8 text-[13px]">Project not found. <Link to="/projects" className="text-primary hover:underline">Back to projects</Link></div>;

  const isOwner = user?.id === p.owner_id;
  const currentOrganization = organizations.find((organization) => organization.id === p.organization_id);
  const canManageScope = p.organization_id
    ? currentOrganization?.member_role === "owner" || currentOrganization?.member_role === "admin"
    : isOwner;
  const canEditRpps = p.organization_id
    ? ["owner", "admin", "engineer"].includes(currentOrganization?.member_role ?? "")
    : isOwner;
  const bom = p.rpps.bom ?? [];
  const assembly = p.rpps.assembly ?? [];
  const integrations = p.rpps.integrations ?? [];
  const files = p.rpps.files ?? [];
  const previewUrdf = files.find((file) => file.kind === "urdf" && typeof file.url === "string" && /\.urdf(?:[?#]|$)/iu.test(file.url));
  const previewStl = managedFiles.find((file) => (file.kind === "cad" || file.kind === "urdf") && typeof file.contentUrl === "string" && /\.stl(?:[?#]|$)/iu.test(file.originalName ?? ""));
  const evidence = p.rpps.evidence ?? [];
  const knownIssues = p.rpps.known_issues ?? [];
  const authors = p.rpps.authors ?? [];

  const bomLineCount = normalizedBom?.totals.lines ?? p.bom_line_count ?? bom.length;
  const bomQty = normalizedBom?.totals.units ?? bom.reduce((s, i) => s + i.qty, 0);
  const bomCostMinor = normalizedBom?.totals.knownCostMinor ?? Math.round(bom.reduce((s, i) => s + (i.unit_cost_usd ?? 0) * i.qty, 0) * 100);
  const bomPricedCount = normalizedBom ? normalizedBom.totals.lines - normalizedBom.totals.unpricedLines : bom.filter(i => i.unit_cost_usd != null).length;
  const totalBuildMin = assembly.reduce((s, a) => s + (a.duration_min ?? 0), 0);
  const integrationCounts = (() => {
    const c: Record<string, number> = {};
    for (const it of integrations) c[it.status] = (c[it.status] ?? 0) + 1;
    return c;
  })();

  const estCost = p.estimated_cost_usd ?? p.rpps.build?.estimated_cost_usd ?? null;
  const estTime = p.rpps.build?.estimated_time_hours ?? (totalBuildMin > 0 ? totalBuildMin / 60 : null);
  const latestPublishedRelease = portableReleases.find((release) => release.status === "published");
  const isCommercialShowcase = p.project_kind === "commercial_showcase";

  const reproduce = async () => {
    if (!user) {
      nav("/auth", { state: { from: `/projects/${p.slug}` } });
      return;
    }
    if (!latestPublishedRelease) {
      toast({ title: "No reproducible release yet", description: "A maintainer must publish an immutable RPPS release before another builder can reproduce it.", variant: "destructive" });
      return;
    }
    setReproducing(true);
    try {
      const result = await createReleaseBuildPassport(p.id, latestPublishedRelease.id, { visibility: "private" });
      toast({ title: "Reproduction created", description: `A private build passport is now locked to release ${latestPublishedRelease.version}.` });
      nav(`/builder?build=${encodeURIComponent(result.item.id)}`);
    } catch (error) {
      toast({ title: "Could not start reproduction", description: errorMessage(error), variant: "destructive" });
    } finally {
      setReproducing(false);
    }
  };

  const forkProject = async () => {
    if (!user) {
      nav("/auth", { state: { from: `/projects/${p.slug}` } });
      return;
    }
    setForking(true);
    try {
      const fork = await cloneProject(p.id, {
        name: `${p.name} fork`,
        visibility: "private",
        changeSummary: "Private working fork created from the public project page.",
      });
      toast({ title: "Private fork created", description: "The upstream project and revision were preserved. You can now edit the project and BOM." });
      nav(`/projects/${fork.slug}`);
    } catch (error) {
      toast({ title: "Could not create fork", description: errorMessage(error), variant: "destructive" });
    } finally {
      setForking(false);
    }
  };

  const createQuoteRequest = async () => {
    if (!user) {
      nav("/auth", { state: { from: `/projects/${p.slug}` } });
      return;
    }
    setCreatingRfq(true);
    try {
      const result = await rfqApi.create({ projectId: p.id, expiresInDays: 30 });
      nav(`/quotes/${result.item.id}`);
    } catch (error) {
      toast({ title: "Could not create quote request", description: errorMessage(error), variant: "destructive" });
    } finally {
      setCreatingRfq(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try { await deleteProject(p.id); nav("/projects"); }
    catch (e: any) { toast({ title: "Delete failed", description: e.message, variant: "destructive" }); }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied", description: "Project URL copied to clipboard." });
    } catch (e: any) {
      toast({ title: "Copy failed", description: e?.message ?? "Clipboard unavailable.", variant: "destructive" });
    }
  };

  const uploadManagedFile = async (file: File) => {
    const kind = inferProjectFileKind(file);
    const fileVisibility = p.visibility === "public" || p.visibility === "unlisted"
      ? "public"
      : p.organization_id ? "organization" : "private";
    setFileBusy("upload");
    try {
      const uploaded = await uploadFile(file, kind, fileVisibility, p.organization_id ?? null);
      if (uploaded.status !== "ready") throw new Error(`Upload is ${uploaded.status}; it cannot be attached until safety review completes.`);
      await attachFile(uploaded.fileId, {
        entityType: "project",
        entityId: p.id,
        purpose: kind === "image" ? "media" : kind,
        relativePath: file.name,
        altText: kind === "image" ? file.name : null,
      });
      setManagedFiles(await listProjectFiles(p.id));
      toast({ title: "Project artifact uploaded", description: `${file.name} is stored in R2 and linked to this project version.` });
    } catch (error) {
      toast({ title: "Upload failed", description: errorMessage(error), variant: "destructive" });
    } finally {
      setFileBusy(null);
    }
  };

  const detachManagedFile = async (file: ProjectFile) => {
    if (!confirm(`Detach "${file.originalName}" from this project? The stored file will remain available to its owner.`)) return;
    setFileBusy(file.id);
    try {
      await detachProjectFile(p.id, file.id);
      setManagedFiles((current) => current.filter((item) => item.id !== file.id));
      toast({ title: "Project artifact detached" });
    } catch (error) {
      toast({ title: "Detach failed", description: errorMessage(error), variant: "destructive" });
    } finally {
      setFileBusy(null);
    }
  };

  const cover = p.cover_image_url ?? p.rpps.cover_image_url ?? null;
  const updated = new Date(p.updated_at);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-4">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
        <Link to="/projects" className="hover:text-foreground">Projects</Link>
        <span>/</span>
        <span className="mono">{p.slug}</span>
        {p.visibility !== "public" && (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
            <Lock className="h-3 w-3" /> {p.visibility}
          </span>
        )}
      </div>

      {/* Header */}
      <div className="surface-card p-3 mb-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="md:w-[220px] shrink-0">
            {cover ? (
              <img
                src={cover}
                alt={`${p.name} cover image`}
                className="w-full h-[140px] md:h-[150px] rounded border border-border object-cover bg-muted"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-[140px] md:h-[150px] rounded border border-dashed border-border bg-muted/40 grid place-items-center text-muted-foreground">
                <div className="flex flex-col items-center gap-1">
                  <Cpu className="h-6 w-6 opacity-60" aria-hidden />
                  <span className="text-[10px] uppercase tracking-wider">No cover</span>
                </div>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-[22px] font-bold tracking-tight leading-tight">{p.name}</h1>
                {p.summary && <p className="text-[13px] text-muted-foreground mt-1 max-w-[720px]">{p.summary}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {p.repo_url && <a href={p.repo_url} target="_blank" rel="noreferrer" aria-label={isCommercialShowcase ? "Open official product page" : "Open source repository"} className="btn-ghost btn-sm"><Github className="h-3.5 w-3.5" /> {isCommercialShowcase ? "Official page" : "Repo"} <ExternalLink className="h-3 w-3" /></a>}
                  {p.docs_url && <a href={p.docs_url} target="_blank" rel="noreferrer" aria-label={isCommercialShowcase ? "Open official product page" : "Open documentation"} className="btn-ghost btn-sm"><BookOpen className="h-3.5 w-3.5" /> {isCommercialShowcase ? "Official page" : "Docs"} <ExternalLink className="h-3 w-3" /></a>}
                  <button onClick={copyLink} aria-label="Copy project link" className="btn-ghost btn-sm"><Link2 className="h-3.5 w-3.5" /> Copy link</button>
                  {!isCommercialShowcase && <button onClick={() => void forkProject()} disabled={forking} aria-label="Create a private editable fork" className="btn-ghost btn-sm"><GitFork className="h-3.5 w-3.5" /> {forking ? "Forking…" : "Fork & modify"}</button>}
                  {!isCommercialShowcase && <button onClick={() => void reproduce()} disabled={reproducing || portableReleases.length === 0} aria-label="Reproduce this project release" className="btn-primary btn-sm disabled:opacity-50"><Play className="h-3.5 w-3.5" /> {reproducing ? "Creating…" : "Reproduce"}</button>}
                  <button onClick={() => downloadRpps(p.rpps)} aria-label={isCommercialShowcase ? "Export showcase metadata" : "Export RPPS package"} className="btn-primary btn-sm"><Download className="h-3.5 w-3.5" /> {isCommercialShowcase ? "Export metadata" : "Export RPPS"}</button>
                </div>
                {canManageScope && (
                  <div className="mt-1 border-t border-border/60 pt-1.5 w-full flex justify-end">
                    <button onClick={remove} aria-label="Delete project" className="btn-ghost btn-sm text-destructive"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px]">
              <Meta k="version" v={`v${p.version}`} />
              <Meta k="rpps" v={p.rpps_version} />
              <StatusPill kind={p.status === "published" ? "ok" : p.status === "archived" ? "muted" : "warn"} label={p.status} />
              {p.is_demo && <StatusPill kind="warn" label="demo fixture" />}
              <StatusPill kind={p.license ? "ok" : "warn"} label={isCommercialShowcase ? "commercial showcase" : p.license ? "licensed source" : p.repo_url ? "license unclear" : "license unavailable"} />
              <StatusPill kind={p.publishability === "ready" ? "ok" : p.publishability === "blocked" ? "warn" : "info"} label={`publishability: ${p.publishability}`} />
              {p.difficulty && <Meta k="difficulty" v={p.difficulty} />}
              {p.license && <Meta k="license" v={p.license} />}
              <Meta k="updated" v={updated.toLocaleDateString()} />
              {p.tags.map(t => <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10.5px]">{t}</span>)}
            </div>
          </div>
        </div>

        {isCommercialShowcase && (
          <div className="mt-3 flex gap-2 rounded border border-warning/40 bg-warning/10 p-3 text-[12px] leading-5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div><strong>Commercial showcase, not a reproducible release.</strong> This page summarizes official manufacturer information. Public design files, build rights, a complete BOM, and assembly instructions have not been published here, so RoboPartPicker does not present this product as forkable or buildable.</div>
          </div>
        )}

        {/* KPI strip */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 border-t border-border pt-3">
          <Kpi to={`/projects/${p.slug}/reproducibility`} icon={<Users className="h-3.5 w-3.5" />} label="Reproductions" value={`${p.reproduction_count} started · ${p.successful_reproduction_count} verified`} />
          <Kpi to={`/projects/${p.slug}/cost`} icon={<DollarSign className="h-3.5 w-3.5" />} label="Est. cost" value={estCost != null ? `$${estCost.toLocaleString()}` : "—"} />
          <Kpi to={`/projects/${p.slug}/schedule`} icon={<Clock className="h-3.5 w-3.5" />} label="Est. time" value={estTime != null ? `${Number(estTime).toFixed(estTime >= 10 ? 0 : 1)} h` : "—"} />
          <Kpi to={`/projects/${p.slug}/parts`} icon={<Package className="h-3.5 w-3.5" />} label="Parts" value={bomLineCount > 0 ? `${bomLineCount} lines · ${bomQty} pcs` : "—"} />
          <Kpi to={`/projects/${p.slug}/assembly`} icon={<ListChecks className="h-3.5 w-3.5" />} label="Assembly" value={assembly.length > 0 ? `${assembly.length} steps` : "—"} />
          <Kpi to={`/projects/${p.slug}/software`} icon={<Code2 className="h-3.5 w-3.5" />} label="Software" value={p.rpps.software?.middleware ?? p.rpps.software?.os ?? "—"} />
          <Kpi to={`/projects/${p.slug}/integrations`} icon={<Link2 className="h-3.5 w-3.5" />} label="Integrations" value={integrations.length > 0 ? `${integrations.length} · ${integrationCounts["verified"] ?? 0} verified` : "—"} />
          <Kpi to={`/projects/${p.slug}/evidence`} icon={<FileJson className="h-3.5 w-3.5" />} label="Evidence" value={evidence.length > 0 ? `${evidence.length} sources` : "—"} />
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-3">
        <div className="space-y-3 min-w-0">
          {canEditRpps && <ProjectTechnicalEditor project={p} onSaved={setP} />}

          <Section title="Description">
            {p.description
              ? <ReadableDescription value={p.description} />
              : <Empty>No long-form description provided.</Empty>}
          </Section>

          {previewUrdf?.url ? (
            <Suspense fallback={<div className="surface-card grid h-[360px] place-items-center text-[11px] text-muted-foreground">Loading 3D viewer…</div>}>
              <UrdfModelViewer urdfUrl={previewUrdf.url} sourceUrl={p.repo_url ?? previewUrdf.url} title={`${p.name} · URDF preview`} />
            </Suspense>
          ) : previewStl?.contentUrl ? (
            <Suspense fallback={<div className="surface-card grid h-[360px] place-items-center text-[11px] text-muted-foreground">Loading 3D viewer…</div>}>
              <StlModelViewer stlUrl={previewStl.contentUrl} sourceUrl={p.repo_url ?? previewStl.contentUrl} title={`${p.name} · STL preview`} />
            </Suspense>
          ) : null}

          <Section
            title={`Bill of materials${bomLineCount ? ` · ${bomLineCount}` : ""}`}
            right={bomLineCount > 0 && (
              <span className="mono text-[11px] text-muted-foreground">
                {bomQty} pcs · {bomPricedCount}/{bomLineCount} priced · known total <span className="text-foreground">{moneyMinor(bomCostMinor, normalizedBom?.version?.currency ?? "USD")}</span>
              </span>
            )}
          >
            {normalizedBomLoading
              ? <Empty>Loading the normalized BOM…</Empty>
              : bomLineCount === 0
              ? <Empty>{isCommercialShowcase ? "No public BOM is available for this commercial showcase." : "No BOM items recorded. Add them by editing the RPPS package."}</Empty>
              : normalizedBom
                ? <NormalizedBomTable bom={normalizedBom} />
              : (
                <div className="overflow-x-auto -mx-3 px-3">
                  <table className="w-full text-[12px] min-w-[720px]">
                    <thead className="text-left text-muted-foreground border-b border-border">
                      <tr>
                        <th className="py-1 pr-2 font-medium">Ref</th>
                        <th className="pr-2 font-medium">Part</th>
                        <th className="pr-2 font-medium">Maker / MPN</th>
                        <th className="pr-2 font-medium">Class</th>
                        <th className="pr-2 font-medium text-right">Qty</th>
                        <th className="pr-2 font-medium text-right">Unit $</th>
                        <th className="pr-2 font-medium text-right">Ext $</th>
                        <th className="font-medium">Supplier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bom.map((i, ix) => (
                        <tr key={ix} className="border-b border-border/60 align-top">
                          <td className="py-1 pr-2 mono text-[11px]">{i.ref ?? "—"}</td>
                          <td className="pr-2">
                            <div className="font-medium">{i.name}</div>
                            {i.notes && <div className="text-muted-foreground text-[11px] mt-0.5">{i.notes}</div>}
                          </td>
                          <td className="pr-2">
                            <div>{i.manufacturer ?? "—"}</div>
                            {i.mpn && <div className="mono text-[11px] text-muted-foreground">{i.mpn}</div>}
                          </td>
                          <td className="pr-2">
                            <div className="flex flex-wrap gap-1">
                              {i.category && <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px]">{i.category}</span>}
                              {i.fabricated && <StatusPill kind="info" label="fabricated" />}
                              {i.optional && <StatusPill kind="muted" label="optional" />}
                              {!i.category && !i.fabricated && !i.optional && <span className="text-muted-foreground">—</span>}
                            </div>
                          </td>
                          <td className="pr-2 mono text-right">{i.qty}</td>
                          <td className="pr-2 mono text-right">{i.unit_cost_usd != null ? `$${i.unit_cost_usd.toFixed(2)}` : "—"}</td>
                          <td className="pr-2 mono text-right">{i.unit_cost_usd != null ? `$${(i.unit_cost_usd * i.qty).toFixed(2)}` : "—"}</td>
                          <td>
                            {i.supplier_url
                              ? <a href={i.supplier_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">link <ExternalLink className="h-3 w-3" /></a>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border">
                        <td colSpan={4} className="py-1 pr-2 text-[11px] text-muted-foreground">Totals</td>
                        <td className="pr-2 mono text-right">{bomQty}</td>
                        <td className="pr-2" />
                        <td className="pr-2 mono text-right font-medium">{moneyMinor(bomCostMinor, "USD")}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
          </Section>

          <Section title="Sourcing estimate">
            {isCommercialShowcase
              ? <Empty>Sourcing is unavailable because this showcase does not include a public, reproducible BOM.</Empty>
              : estimateLoading
              ? <Empty>Calculating the whole-BOM procurement estimate…</Empty>
              : estimateError
                ? <Empty>An estimate is not available for this project yet.</Empty>
                : estimate
                  ? (
                    <div className="space-y-2 px-3 py-2 text-[12px]">
                      <div className="flex flex-wrap gap-x-6 gap-y-1">
                        <span>Parts total <span className="mono font-medium">${(estimate.assumptions.partsTotalMinor / 100).toFixed(2)}</span></span>
                        <span>{estimate.basket.length} lines · {estimate.assumptions.unpricedLines} unpriced</span>
                        <span>{estimate.assumptions.substitutionCount} substitutions</span>
                        {estimate.assumptions.deliveryRangeDays && <span>delivery {estimate.assumptions.deliveryRangeDays[0]}–{estimate.assumptions.deliveryRangeDays[1]} days</span>}
                        <span>freshness: {estimate.assumptions.freshness}</span>
                      </div>
                      {!estimate.assumptions.shippingIncluded && <div className="text-muted-foreground">Shipping, tax and duties are not included.</div>}
                      <div className="text-muted-foreground italic">{estimate.assumptions.disclaimer}</div>
                      <DeliveryPlan estimate={estimate} />
                      <div className="overflow-x-auto rounded border border-border">
                        <table className="w-full min-w-[820px] text-[11px]">
                          <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground"><tr><th className="p-2">BOM line</th><th className="p-2">Supplier</th><th className="p-2">Evidence</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Unit</th><th className="p-2 text-right">Subtotal</th><th className="p-2 text-right">Arrival</th></tr></thead>
                          <tbody>{estimate.basket.map((line) => <tr key={line.lineId} className="border-b border-border/60 last:border-0"><td className="p-2"><div className="font-medium">{line.name}</div>{line.exclusionReason && <div className="text-[10px] text-warning">{line.exclusionReason}</div>}</td><td className="p-2">{line.supplierName ?? "Not sourced"}</td><td className="p-2"><div className="flex flex-wrap gap-1">{line.riskLabel && <StatusPill kind={line.isSubstitute ? "warn" : "ok"} label={line.riskLabel} />}{line.condition && <StatusPill kind="muted" label={line.condition} />}{line.freshnessLabel && <StatusPill kind="info" label={line.freshnessLabel} />}{line.unpriced && <StatusPill kind="warn" label="unpriced" />}</div></td><td className="p-2 text-right mono">{line.quantity}</td><td className="p-2 text-right mono">{moneyMinor(line.unitPriceMinor, line.currency)}</td><td className="p-2 text-right mono">{moneyMinor(line.subtotalMinor, line.currency)}</td><td className="p-2 text-right mono">{line.leadTimeDays == null ? "unknown" : `${line.leadTimeDays}d`}</td></tr>)}</tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-primary/25 bg-primary/5 p-3"><div><div className="font-medium">Need firm supplier pricing?</div><div className="text-[10.5px] text-muted-foreground">Capture this estimate in an RFQ package, reconcile supplier responses, and explicitly approve an option. Automated outbound delivery is still coming soon.</div></div><div className="flex gap-2"><Link to="/builder" className="btn-ghost btn-sm">Sourcing preferences</Link><button disabled={creatingRfq} onClick={() => void createQuoteRequest()} className="btn-primary btn-sm">{creatingRfq ? "Creating…" : "Create quote request"}</button></div></div>
                    </div>
                  )
                  : <Empty>An estimate is not available for this project yet.</Empty>}
          </Section>

          <Section title="Versions & forks">
            <div className="px-3 py-2"><ProjectLineage projectId={p.id} /></div>
          </Section>

          <Section
            title={`Assembly${assembly.length ? ` · ${assembly.length} steps` : ""}`}
            right={totalBuildMin > 0 && <span className="mono text-[11px] text-muted-foreground">{(totalBuildMin / 60).toFixed(1)} h total</span>}
          >
            {assembly.length === 0
              ? <Empty>No assembly steps documented.</Empty>
              : (
                <ol className="space-y-2 text-[12px]">
                  {assembly.map((s, ix) => (
                    <li key={s.id} className="border-l-2 border-primary/40 pl-3">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <div className="font-medium">{ix + 1}. {s.title}</div>
                        <span className="mono text-[10.5px] text-muted-foreground">#{s.id}</span>
                        {s.duration_min != null && <span className="text-[10.5px] text-muted-foreground">· {s.duration_min} min</span>}
                      </div>
                      {s.body && <div className="text-muted-foreground whitespace-pre-wrap mt-0.5">{s.body}</div>}
                      {(s.tools?.length || s.depends_on?.length) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {s.tools?.map(t => <span key={`t-${t}`} className="rounded bg-muted px-1.5 py-0.5 text-[10.5px]">tool: {t}</span>)}
                          {s.depends_on?.map(d => <span key={`d-${d}`} className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] mono">after: {d}</span>)}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
          </Section>

          <Section
            title={`Integrations${integrations.length ? ` · ${integrations.length}` : ""}`}
            right={integrations.length > 0 && (
              <span className="mono text-[11px] text-muted-foreground">
                {Object.entries(integrationCounts).map(([k, v]) => `${v} ${k}`).join(" · ")}
              </span>
            )}
          >
            {integrations.length === 0
              ? <Empty>No component-to-component integrations recorded.</Empty>
              : (
                <div className="overflow-x-auto -mx-3 px-3">
                  <table className="w-full text-[12px] min-w-[560px]">
                    <thead className="text-left text-muted-foreground border-b border-border">
                      <tr>
                        <th className="py-1 pr-2 font-medium">A</th>
                        <th className="pr-2 font-medium">B</th>
                        <th className="pr-2 font-medium">Status</th>
                        <th className="pr-2 font-medium">Notes</th>
                        <th className="font-medium">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {integrations.map((it, ix) => (
                        <tr key={ix} className="border-b border-border/60 align-top">
                          <td className="py-1 pr-2 mono text-[11px]">{it.a}</td>
                          <td className="pr-2 mono text-[11px]">{it.b}</td>
                          <td className="pr-2"><IntegrationPill status={it.status} /></td>
                          <td className="pr-2 text-muted-foreground">{it.notes ?? "—"}</td>
                          <td>
                            {it.evidence_url
                              ? <a href={it.evidence_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">source <ExternalLink className="h-3 w-3" /></a>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </Section>

          <Section title={`Evidence${evidence.length ? ` · ${evidence.length}` : ""}`}>
            {evidence.length === 0
              ? <Empty>No claims sourced yet.</Empty>
              : (
                <ul className="space-y-1.5 text-[12px]">
                  {evidence.map((e, ix) => (
                    <li key={ix} className="flex items-start gap-2 border-b border-border/60 pb-1.5 last:border-0">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] mono shrink-0 mt-0.5">{e.source_type}</span>
                      <div className="min-w-0 flex-1">
                        <div>{e.claim}</div>
                        <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground mt-0.5">
                          {e.confidence != null && <span>confidence {Math.round(e.confidence * 100)}%</span>}
                          {e.retrieved_at && <span>· {new Date(e.retrieved_at).toLocaleDateString()}</span>}
                          {e.source_url && (
                            <a href={e.source_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">source <ExternalLink className="h-3 w-3" /></a>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </Section>

          <Section title={`Known issues${knownIssues.length ? ` · ${knownIssues.length}` : ""}`}>
            {knownIssues.length === 0
              ? <Empty>No known issues reported.</Empty>
              : (
                <ul className="space-y-2 text-[12px]">
                  {knownIssues.map((k, ix) => (
                    <li key={ix} className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" aria-hidden />
                      <div>
                        <div className="font-medium">{k.title}</div>
                        {k.body && <div className="text-muted-foreground whitespace-pre-wrap">{k.body}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </Section>
        </div>

        {/* Sticky technical summary */}
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <Section title="Hardware">
            <KV rows={[
              ["DoF", p.rpps.hardware?.dof],
              ["Payload", p.rpps.hardware?.payload_kg && `${p.rpps.hardware.payload_kg} kg`],
              ["Weight", p.rpps.hardware?.weight_kg && `${p.rpps.hardware.weight_kg} kg`],
              ["Height", p.rpps.hardware?.height_cm && `${p.rpps.hardware.height_cm} cm`],
              ["Compute", p.rpps.hardware?.compute],
            ]} />
          </Section>

          <Section title="Software">
            <KV rows={[
              ["OS", p.rpps.software?.os],
              ["Middleware", p.rpps.software?.middleware],
              ["ROS", p.rpps.software?.ros_support ? <RosPill v={p.rpps.software.ros_support} /> : undefined],
              ["Languages", p.rpps.software?.languages?.join(", ")],
              ["Simulators", p.rpps.software?.simulators?.join(", ")],
            ]} />
          </Section>

          <Section title="Build">
            <KV rows={[
              ["Difficulty", p.rpps.build?.difficulty],
              ["Est. time", p.rpps.build?.estimated_time_hours && `${p.rpps.build.estimated_time_hours} h`],
              ["Est. cost", p.rpps.build?.estimated_cost_usd && `$${p.rpps.build.estimated_cost_usd.toLocaleString()}`],
              ["Fabrication", p.rpps.build?.fabrication?.length
                ? <span className="flex flex-wrap gap-1">{p.rpps.build.fabrication.map(f => <StatusPill key={f} kind="info" label={f} />)}</span>
                : undefined],
              ["Tools", p.rpps.build?.required_tools?.join(", ")],
              ["Skills", p.rpps.build?.required_skills?.join(", ")],
            ]} />
          </Section>

          {canManageScope && <ProjectScopeSettings project={p} organizations={organizations} onSaved={setP} />}

          {authors.length > 0 && (
            <Section title={`Authors · ${authors.length}`}>
              <ul className="space-y-1 text-[12px]">
                {authors.map((a, ix) => (
                  <li key={ix} className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.name}</div>
                      {a.role && <div className="text-[10.5px] text-muted-foreground">{a.role}</div>}
                    </div>
                    {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-[11px] inline-flex items-center gap-1 shrink-0">link <ExternalLink className="h-3 w-3" /></a>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section
            title={`Managed artifacts${managedFiles.length ? ` · ${managedFiles.length}` : ""}`}
            right={canEditRpps && (
              <label className={`btn-primary btn-sm inline-flex cursor-pointer items-center gap-1 ${fileBusy === "upload" ? "pointer-events-none opacity-50" : ""}`}>
                <FileUp className="h-3.5 w-3.5" /> {fileBusy === "upload" ? "Uploading…" : "Upload"}
                <input type="file" className="sr-only" disabled={fileBusy === "upload"} onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadManagedFile(file);
                  event.target.value = "";
                }} />
              </label>
            )}
          >
            {managedFilesLoading
              ? <Empty>Loading managed project artifacts…</Empty>
              : managedFiles.length === 0
                ? <Empty>No managed artifacts. Upload CAD, BOMs, firmware, configuration, documents, or project media.</Empty>
                : <div className="space-y-1.5 text-[12px]">
                  {managedFiles.map((file) => (
                    <div key={file.id} className="rounded border border-border p-2">
                      <div className="flex items-start justify-between gap-2">
                        <a href={file.contentUrl} className="min-w-0 hover:text-primary">
                          <div className="truncate font-medium">{file.relativePath ?? file.originalName}</div>
                          <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                            {file.kind} · {formatProjectFileBytes(file.sizeBytes)} · {file.status} · {file.visibility}
                          </div>
                        </a>
                        {canEditRpps && (
                          <button type="button" className="btn-ghost btn-sm text-destructive" disabled={fileBusy === file.id} aria-label={`Detach ${file.originalName}`} onClick={() => void detachManagedFile(file)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>}
            <p className="mt-2 text-[10.5px] text-muted-foreground">Stored in Cloudflare R2 and linked to the current project release. Detaching does not delete the owner’s stored file.</p>
          </Section>

          <Section title={`RPPS file references${files.length ? ` · ${files.length}` : ""}`}>
            {files.length === 0
              ? <Empty>No external file references declared in the RPPS package.</Empty>
              : (
                <FilesGrouped files={files} />
              )}
          </Section>

          <div id="portable-releases" className="surface-card scroll-mt-20 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Portable RPPS releases
            </div>
            {portableReleases.length === 0 ? <p className="text-[10.5px] text-muted-foreground">No RPPS 0.1 Draft releases yet.</p> : <div className="space-y-2">{portableReleases.map((release) => <ReleaseCollaborationPanel key={release.id} projectId={p.id} release={release} releases={portableReleases} userId={user?.id} canManage={canEditRpps} onReleaseChanged={async () => setPortableReleases(await listPortableReleases(p.id))} />)}</div>}
            {canEditRpps && <Link to="/rpps" className="btn-primary btn-sm mt-2 w-full justify-center"><FileUp className="h-3.5 w-3.5" /> Validate or add release</Link>}
          </div>

          <div className="surface-card p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <FileJson className="h-3 w-3" /> Legacy RPPS package
            </div>
            <button onClick={() => downloadRpps(p.rpps)} className="btn-ghost btn-sm w-full justify-center">
              <Download className="h-3.5 w-3.5" /> Download .rpps.json
            </button>
            <p className="text-[10.5px] text-muted-foreground mt-2">
              Legacy flat JSON retained for current project compatibility. New portable releases use the <Link to="/rpps" className="text-primary hover:underline">RPPS 0.1 Draft</Link> manifest and lockfile.
            </p>
          </div>
          <RelatedDiscussionList relatedType="project" relatedId={p.id} title="Community discussions" />
        </aside>
      </div>
    </div>
  );
}

function DeliveryPlan({ estimate }: { estimate: SourcingEstimate }) {
  const groups = new Map<string, { supplier: string; leadTimeDays: number | null; lines: number; subtotalMinor: number }>();
  for (const line of estimate.basket) {
    if (!line.supplierId || line.subtotalMinor == null) continue;
    const current = groups.get(line.supplierId) ?? { supplier: line.supplierName ?? "Supplier", leadTimeDays: null, lines: 0, subtotalMinor: 0 };
    current.lines += 1;
    current.subtotalMinor += line.subtotalMinor;
    current.leadTimeDays = line.leadTimeDays == null ? current.leadTimeDays : Math.max(current.leadTimeDays ?? 0, line.leadTimeDays);
    groups.set(line.supplierId, current);
  }
  const shipments = [...groups.values()].sort((a, b) => (a.leadTimeDays ?? Number.MAX_SAFE_INTEGER) - (b.leadTimeDays ?? Number.MAX_SAFE_INTEGER));
  if (!shipments.length) return <div className="rounded border border-dashed border-border p-3 text-muted-foreground">No supplier-backed shipment groups are available yet. Unpriced lines remain visible below.</div>;
  return <div><div className="mb-1.5 flex items-center gap-1.5 font-medium"><Truck className="h-3.5 w-3.5 text-primary" /> Split delivery plan · {shipments.length} shipment{shipments.length === 1 ? "" : "s"}</div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{shipments.map((shipment, index) => <div key={`${shipment.supplier}-${index}`} className="rounded border border-border p-2"><div className="flex items-center justify-between gap-2"><span className="font-medium">{shipment.supplier}</span><span className="mono text-[10px]">{shipment.leadTimeDays == null ? "date unknown" : `about ${shipment.leadTimeDays}d`}</span></div><div className="mt-1 text-[10.5px] text-muted-foreground">{shipment.lines} BOM line{shipment.lines === 1 ? "" : "s"} · {moneyMinor(shipment.subtotalMinor, estimate.assumptions.currency)}</div></div>)}</div></div>;
}

function NormalizedBomTable({ bom }: { bom: BomDetail }) {
  const currency = bom.version?.currency ?? "USD";
  return <div className="overflow-x-auto -mx-3 px-3">
    <table className="w-full min-w-[900px] text-[12px]">
      <thead className="border-b border-border text-left text-muted-foreground"><tr>
        <th className="py-1 pr-2 font-medium">Slot</th><th className="pr-2 font-medium">Part</th>
        <th className="pr-2 font-medium">Maker / MPN</th><th className="pr-2 font-medium">Evidence</th>
        <th className="pr-2 text-right font-medium">Qty</th><th className="pr-2 text-right font-medium">Known unit</th>
        <th className="pr-2 text-right font-medium">Extended</th><th className="font-medium">Supplier evidence</th>
      </tr></thead>
      <tbody>{bom.items.map((item) => {
        const unitMinor = item.targetUnitPriceMinor ?? item.selectedUnitPriceMinor ?? item.lowestUnitPriceMinor;
        return <tr key={item.id} className="border-b border-border/60 align-top">
          <td className="py-1 pr-2 mono text-[11px]">{item.slotKey}</td>
          <td className="pr-2"><div className="font-medium">{item.componentSlug
            ? <Link to={`/parts/${item.componentCategory}/${item.componentSlug}`} className="hover:text-primary">{item.componentName ?? item.description}</Link>
            : item.description}</div>{item.notes && <div className="mt-0.5 text-[11px] text-muted-foreground">{item.notes}</div>}</td>
          <td className="pr-2"><div>{item.manufacturerName ?? "—"}</div><div className="mono text-[11px] text-muted-foreground">{item.manufacturerPartNumber ?? "MPN unresolved"}</div></td>
          <td className="pr-2"><div className="flex flex-wrap gap-1"><StatusPill kind={item.completeness === "verified" ? "ok" : item.completeness === "unresolved" ? "warn" : "info"} label={item.completeness} /><StatusPill kind="muted" label={item.extractionMethod} /></div>{item.confidence != null && <div className="mt-0.5 text-[10px] text-muted-foreground">confidence {Math.round(item.confidence * 100)}%</div>}</td>
          <td className="pr-2 text-right mono">{item.quantity} {item.unit}</td>
          <td className="pr-2 text-right mono">{moneyMinor(unitMinor, currency)}</td>
          <td className="pr-2 text-right mono">{moneyMinor(unitMinor == null ? null : unitMinor * item.quantity, currency)}</td>
          <td>{item.selectedSupplierName ?? (item.knownOfferCount > 0 ? `${item.knownOfferCount} observed offer${item.knownOfferCount === 1 ? "" : "s"}` : "No observed offer")}</td>
        </tr>;
      })}</tbody>
      <tfoot><tr className="border-t border-border"><td colSpan={4} className="py-1 pr-2 text-[11px] text-muted-foreground">Known totals only. Unpriced lines remain visible.</td><td className="pr-2 text-right mono">{bom.totals.units}</td><td /><td className="pr-2 text-right mono font-medium">{moneyMinor(bom.totals.knownCostMinor, currency)}</td><td /></tr></tfoot>
    </table>
  </div>;
}

function moneyMinor(value: number | null, currency: string | null = "USD") {
  if (value == null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency ?? "USD" }).format(value / 100);
}

function ReadableDescription({ value }: { value: string }) {
  const cleaned = value
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/<[^>]+>/gu, " ")
    .replace(/^\s{0,3}#{1,6}\s*/gmu, "")
    .replace(/[>*_`~|]/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/[ \t]+/gu, " ")
    .trim();
  const preview = cleaned.slice(0, 2200);
  if (cleaned.length <= preview.length) return <p className="whitespace-pre-line text-[13px] leading-6">{cleaned}</p>;
  return <div className="text-[13px] leading-6"><p className="whitespace-pre-line">{preview}…</p><details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-primary">Show complete imported description</summary><p className="mt-2 whitespace-pre-line text-muted-foreground">{cleaned}</p></details></div>;
}

type ProjectAuthor = NonNullable<ProjectRow["rpps"]["authors"]>[number];
type ProjectKnownIssue = NonNullable<ProjectRow["rpps"]["known_issues"]>[number];
type ProjectEvidence = NonNullable<ProjectRow["rpps"]["evidence"]>[number];

const evidenceSourceTypes: ProjectEvidence["source_type"][] = ["datasheet", "repo", "docs", "paper", "user-build", "test", "teardown", "supplier", "listing", "inference"];

function ProjectTechnicalEditor({ project, onSaved }: { project: ProjectRow; onSaved: (project: ProjectRow) => void }) {
  const [releaseVersion, setReleaseVersion] = useState(() => nextRppsVersion(project.rpps.version));
  const [tools, setTools] = useState((project.rpps.build?.required_tools ?? []).join("\n"));
  const [skills, setSkills] = useState((project.rpps.build?.required_skills ?? []).join("\n"));
  const [authors, setAuthors] = useState<ProjectAuthor[]>(() => structuredClone(project.rpps.authors ?? []));
  const [knownIssues, setKnownIssues] = useState<ProjectKnownIssue[]>(() => structuredClone(project.rpps.known_issues ?? []));
  const [evidence, setEvidence] = useState<ProjectEvidence[]>(() => structuredClone(project.rpps.evidence ?? []));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReleaseVersion(nextRppsVersion(project.rpps.version));
    setTools((project.rpps.build?.required_tools ?? []).join("\n"));
    setSkills((project.rpps.build?.required_skills ?? []).join("\n"));
    setAuthors(structuredClone(project.rpps.authors ?? []));
    setKnownIssues(structuredClone(project.rpps.known_issues ?? []));
    setEvidence(structuredClone(project.rpps.evidence ?? []));
  }, [project.id, project.record_version, project.rpps]);

  const save = async () => {
    setSaving(true);
    try {
      const cleanAuthors = authors.map((author) => ({
        name: author.name.trim(),
        ...(author.role?.trim() ? { role: author.role.trim() } : {}),
        ...(author.url?.trim() ? { url: author.url.trim() } : {}),
      })).filter((author) => author.name);
      const cleanIssues = knownIssues.map((issue) => ({
        title: issue.title.trim(),
        ...(issue.body?.trim() ? { body: issue.body.trim() } : {}),
      })).filter((issue) => issue.title);
      const cleanEvidence = evidence.map((item) => ({
        ...item,
        claim: item.claim.trim(),
        ...(item.source_url?.trim() ? { source_url: item.source_url.trim() } : { source_url: undefined }),
      })).filter((item) => item.claim);
      const updated = await updateProjectRpps(project.id, project.record_version ?? 1, {
        ...project.rpps,
        version: releaseVersion.trim(),
        authors: cleanAuthors.length ? cleanAuthors : undefined,
        build: {
          ...(project.rpps.build ?? {}),
          required_tools: splitLines(tools),
          required_skills: splitLines(skills),
        },
        known_issues: cleanIssues.length ? cleanIssues : undefined,
        evidence: cleanEvidence.length ? cleanEvidence : undefined,
      });
      onSaved(updated);
      toast({ title: "Project records published", description: `RPPS ${updated.version} is now the current D1-backed project version.` });
    } catch (cause) {
      toast({ title: "Could not publish project records", description: cause instanceof Error ? cause.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="surface-card group">
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
        Edit versioned technical records <span className="normal-case tracking-normal">· current RPPS {project.rpps.version}</span>
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <div className="grid gap-2 md:grid-cols-3">
          <label className="text-[10px] uppercase text-muted-foreground">New RPPS version<input value={releaseVersion} maxLength={40} onChange={(event) => setReleaseVersion(event.target.value)} className="input-bare mt-1 h-9 w-full normal-case" /></label>
          <label className="text-[10px] uppercase text-muted-foreground">Required tools<textarea value={tools} onChange={(event) => setTools(event.target.value)} placeholder="One tool per line" className="input-bare mt-1 min-h-20 w-full normal-case" /></label>
          <label className="text-[10px] uppercase text-muted-foreground">Required skills<textarea value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="One skill per line" className="input-bare mt-1 min-h-20 w-full normal-case" /></label>
        </div>

        <RecordEditor title="Authors" addLabel="Add author" onAdd={() => setAuthors([...authors, { name: "" }])}>
          {authors.map((author, index) => <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_1.5fr_auto]">
            <input aria-label={`Author ${index + 1} name`} placeholder="Name" value={author.name} onChange={(event) => setAuthors(replaceAt(authors, index, { ...author, name: event.target.value }))} className="input-bare h-9" />
            <input aria-label={`Author ${index + 1} role`} placeholder="Role" value={author.role ?? ""} onChange={(event) => setAuthors(replaceAt(authors, index, { ...author, role: event.target.value }))} className="input-bare h-9" />
            <input aria-label={`Author ${index + 1} URL`} type="url" placeholder="https://…" value={author.url ?? ""} onChange={(event) => setAuthors(replaceAt(authors, index, { ...author, url: event.target.value }))} className="input-bare h-9" />
            <RemoveButton label={`Remove author ${index + 1}`} onClick={() => setAuthors(authors.filter((_, itemIndex) => itemIndex !== index))} />
          </div>)}
        </RecordEditor>

        <RecordEditor title="Known issues" addLabel="Add issue" onAdd={() => setKnownIssues([...knownIssues, { title: "", body: "" }])}>
          {knownIssues.map((issue, index) => <div key={index} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
            <input aria-label={`Issue ${index + 1} title`} placeholder="Issue title" value={issue.title} onChange={(event) => setKnownIssues(replaceAt(knownIssues, index, { ...issue, title: event.target.value }))} className="input-bare h-9" />
            <input aria-label={`Issue ${index + 1} description`} placeholder="Symptoms, constraints, or workaround" value={issue.body ?? ""} onChange={(event) => setKnownIssues(replaceAt(knownIssues, index, { ...issue, body: event.target.value }))} className="input-bare h-9" />
            <RemoveButton label={`Remove issue ${index + 1}`} onClick={() => setKnownIssues(knownIssues.filter((_, itemIndex) => itemIndex !== index))} />
          </div>)}
        </RecordEditor>

        <RecordEditor title="Evidence" addLabel="Add evidence" onAdd={() => setEvidence([...evidence, { claim: "", source_type: "test", confidence: 0.5 }])}>
          {evidence.map((item, index) => <div key={index} className="grid gap-2 md:grid-cols-[2fr_1fr_1.5fr_90px_auto]">
            <input aria-label={`Evidence ${index + 1} claim`} placeholder="Technical claim" value={item.claim} onChange={(event) => setEvidence(replaceAt(evidence, index, { ...item, claim: event.target.value }))} className="input-bare h-9" />
            <select aria-label={`Evidence ${index + 1} source type`} value={item.source_type} onChange={(event) => setEvidence(replaceAt(evidence, index, { ...item, source_type: event.target.value as ProjectEvidence["source_type"] }))} className="input-bare h-9">{evidenceSourceTypes.map((sourceType) => <option key={sourceType} value={sourceType}>{sourceType}</option>)}</select>
            <input aria-label={`Evidence ${index + 1} source URL`} type="url" placeholder="https://…" value={item.source_url ?? ""} onChange={(event) => setEvidence(replaceAt(evidence, index, { ...item, source_url: event.target.value }))} className="input-bare h-9" />
            <input aria-label={`Evidence ${index + 1} confidence`} type="number" min={0} max={1} step={0.05} value={item.confidence ?? 0.5} onChange={(event) => setEvidence(replaceAt(evidence, index, { ...item, confidence: Number(event.target.value) }))} className="input-bare h-9" />
            <RemoveButton label={`Remove evidence ${index + 1}`} onClick={() => setEvidence(evidence.filter((_, itemIndex) => itemIndex !== index))} />
          </div>)}
        </RecordEditor>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-[10.5px] text-muted-foreground">Publishing creates an immutable RPPS version; stale browser state is rejected by the Worker.</p>
          <button type="button" disabled={saving || !releaseVersion.trim()} onClick={() => void save()} className="btn-primary btn-sm disabled:opacity-50">{saving ? "Publishing…" : "Publish records"}</button>
        </div>
      </div>
    </details>
  );
}

function RecordEditor({ title, addLabel, onAdd, children }: { title: string; addLabel: string; onAdd: () => void; children: React.ReactNode }) {
  return <div className="space-y-2"><div className="flex items-center justify-between"><div className="section-title">{title}</div><button type="button" onClick={onAdd} className="btn-ghost btn-sm">{addLabel}</button></div>{children}</div>;
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" aria-label={label} onClick={onClick} className="btn-ghost btn-sm h-9 text-destructive">Remove</button>;
}

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  return items.map((item, itemIndex) => itemIndex === index ? value : item);
}

function splitLines(value: string): string[] {
  return Array.from(new Set(value.split(/\r?\n|,/u).map((item) => item.trim()).filter(Boolean)));
}

function nextRppsVersion(version: string): string {
  const semanticVersion = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version);
  if (semanticVersion) return `${semanticVersion[1]}.${semanticVersion[2]}.${Number(semanticVersion[3]) + 1}`;
  return `${version.slice(0, 32)}-revision`;
}

const Section = ({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) => (
  <section className="surface-card p-3">
    <div className="flex items-center justify-between gap-2 mb-2">
      <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</h2>
      {right}
    </div>
    {children}
  </section>
);

function ProjectScopeSettings({ project, organizations, onSaved }: {
  project: ProjectRow;
  organizations: Organization[];
  onSaved: (project: ProjectRow) => void;
}) {
  const [organizationId, setOrganizationId] = useState(project.organization_id ?? "");
  const [visibility, setVisibility] = useState<ProjectRow["visibility"]>(project.visibility);
  const [saving, setSaving] = useState(false);
  const eligibleOrganizations = organizations.filter((organization) => ["owner", "admin"].includes(organization.member_role));

  useEffect(() => {
    setOrganizationId(project.organization_id ?? "");
    setVisibility(project.visibility);
  }, [project.id, project.organization_id, project.visibility, project.record_version]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateProjectScope(project.id, {
        version: project.record_version ?? 1,
        organizationId: organizationId || null,
        visibility,
      });
      onSaved(updated);
      toast({ title: "Project access updated", description: "Organization ownership and the generated BOM scope are synchronized in D1." });
    } catch (cause) {
      toast({ title: "Could not update project access", description: cause instanceof Error ? cause.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Access & ownership">
      <label className="block text-[11px] text-muted-foreground">Owner scope
        <select value={organizationId} onChange={(event) => {
          const next = event.target.value;
          setOrganizationId(next);
          if (!next && visibility === "organization") setVisibility("private");
        }} className="input-bare mt-1 w-full">
          <option value="">Personal</option>
          {eligibleOrganizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name} · {organization.member_role}</option>)}
        </select>
      </label>
      <label className="mt-2 block text-[11px] text-muted-foreground">Visibility
        <select value={visibility} onChange={(event) => setVisibility(event.target.value as ProjectRow["visibility"])} className="input-bare mt-1 w-full">
          <option value="private">Private</option>
          <option value="organization" disabled={!organizationId}>Organization members</option>
          <option value="unlisted">Unlisted</option>
          <option value="public">Public</option>
        </select>
      </label>
      <button type="button" disabled={saving} onClick={() => void save()} className="btn-primary btn-sm mt-2 w-full disabled:opacity-50">{saving ? "Saving…" : "Save access"}</button>
      <p className="mt-2 text-[10px] text-muted-foreground">Organization transfers require administrator access in both scopes. The Worker enforces the change.</p>
    </Section>
  );
}

const Meta = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5">
    <span className="text-muted-foreground">{k}</span>
    <span className="mono font-medium">{v}</span>
  </span>
);

const Kpi = ({ to, icon, label, value }: { to: string; icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <Link to={to} className="group rounded border border-border bg-surface px-2 py-1.5 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
      <span className="text-primary/80">{icon}</span>{label}
    </div>
    <div className="mono text-[13px] font-medium mt-0.5 truncate">{value}</div>
  </Link>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11.5px] text-muted-foreground">{children}</div>
);

type PillKind = "ok" | "warn" | "err" | "info" | "muted";
const pillClass: Record<PillKind, string> = {
  ok: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  err: "bg-destructive/10 text-destructive border-destructive/30",
  info: "bg-primary/10 text-primary border-primary/30",
  muted: "bg-muted text-muted-foreground border-border",
};
const StatusPill = ({ kind, label }: { kind: PillKind; label: string }) => (
  <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide ${pillClass[kind]}`}>{label}</span>
);

const IntegrationPill = ({ status }: { status: string }) => {
  const map: Record<string, PillKind> = {
    verified: "ok",
    documented: "info",
    compatible: "info",
    "adaptation-required": "warn",
    unverified: "muted",
    incompatible: "err",
  };
  return <StatusPill kind={map[status] ?? "muted"} label={status} />;
};

const RosPill = ({ v }: { v: "native" | "community" | "none" }) => {
  const kind: PillKind = v === "native" ? "ok" : v === "community" ? "info" : "muted";
  return <StatusPill kind={kind} label={`ros: ${v}`} />;
};

const KV = ({ rows }: { rows: [string, any][] }) => {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (shown.length === 0) return <Empty>Not specified.</Empty>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="mono min-w-0">{typeof v === "string" || typeof v === "number" ? String(v) : v}</dd>
        </div>
      ))}
    </dl>
  );
};

const FilesGrouped = ({ files }: { files: NonNullable<ProjectRow["rpps"]["files"]> }) => {
  const groups = files.reduce<Record<string, typeof files>>((acc, f) => {
    (acc[f.kind] ||= [] as any).push(f);
    return acc;
  }, {});
  const order = ["readme", "cad", "urdf", "mjcf", "firmware", "config", "image", "video", "doc", "other"];
  const keys = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (
    <div className="space-y-2 text-[12px]">
      {keys.map(k => (
        <div key={k}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{k}</div>
          <ul className="space-y-0.5">
            {groups[k].map((f, ix) => (
              <li key={ix} className="flex items-baseline justify-between gap-2">
                <span className="mono text-[11px] truncate">{f.path}</span>
                {f.url && <a href={f.url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-[11px] inline-flex items-center gap-1 shrink-0">open <ExternalLink className="h-3 w-3" /></a>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

function inferProjectFileKind(file: File): FileKind {
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

function formatProjectFileBytes(value: number): string {
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MiB` : `${Math.max(1, Math.round(value / 1024))} KiB`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}
