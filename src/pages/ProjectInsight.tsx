import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, GitPullRequest } from "lucide-react";
import { getProjectBySlug, type ProjectRow } from "@/lib/projects";
import { bomsApi } from "@/lib/api/builds";
import type { BomDetail, BomItem } from "@/shared/builds";
import { currentBomTotals } from "@/lib/current-bom";

const aspects = ["reproducibility", "cost", "schedule", "parts", "assembly", "software", "integrations", "evidence"] as const;
type Aspect = (typeof aspects)[number];

const labels: Record<Aspect, string> = {
  reproducibility: "Reproducibility",
  cost: "Cost breakdown",
  schedule: "Build time & requirements",
  parts: "Parts list",
  assembly: "Assembly instructions",
  software: "Software, firmware & drivers",
  integrations: "Interfaces & integrations",
  evidence: "Evidence & provenance",
};

export default function ProjectInsight() {
  const { slug, aspect: routeAspect } = useParams<{ slug: string; aspect: string }>();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [normalizedBom, setNormalizedBom] = useState<BomDetail | null>(null);
  const [normalizedBomLoading, setNormalizedBomLoading] = useState(false);
  const aspect = aspects.includes(routeAspect as Aspect) ? routeAspect as Aspect : null;

  useEffect(() => {
    if (!slug) return;
    setError(null);
    getProjectBySlug(slug).then(setProject).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load project."));
  }, [slug]);

  useEffect(() => {
    if (!project?.bom_id) { setNormalizedBom(null); setNormalizedBomLoading(false); return; }
    const controller = new AbortController();
    setNormalizedBomLoading(true);
    bomsApi.get(project.bom_id, controller.signal)
      .then((result) => setNormalizedBom(result.item))
      .catch(() => setNormalizedBom(null))
      .finally(() => setNormalizedBomLoading(false));
    return () => controller.abort();
  }, [project?.bom_id]);

  if (!aspect) return <State>Unknown project detail.</State>;
  if (error) return <State>{error}</State>;
  if (!project) return <State>Loading project details…</State>;

  return (
    <main className="mx-auto max-w-[1120px] px-4 py-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link to={`/projects/${project.slug}`} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> {project.name}</Link>
          <h1 className="mt-1 text-xl font-bold">{labels[aspect]}</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">Release {project.version} · updated {new Date(project.updated_at).toLocaleDateString()}</p>
        </div>
      </div>
      <nav aria-label="Project detail categories" className="mb-3 flex gap-1 overflow-x-auto border-b border-border pb-2">
        {aspects.map((item) => <Link key={item} to={`/projects/${project.slug}/${item}`} className={item === aspect ? "btn-primary btn-sm whitespace-nowrap" : "btn-ghost btn-sm whitespace-nowrap"}>{labels[item]}</Link>)}
      </nav>
      <AspectContent project={project} aspect={aspect} normalizedBom={normalizedBom} normalizedBomLoading={normalizedBomLoading} />
    </main>
  );
}

function AspectContent({ project, aspect, normalizedBom, normalizedBomLoading }: { project: ProjectRow; aspect: Aspect; normalizedBom: BomDetail | null; normalizedBomLoading: boolean }) {
  const bom = project.rpps.bom ?? [];
  const assembly = project.rpps.assembly ?? [];
  const files = project.rpps.files ?? [];
  const totals = currentBomTotals(project, normalizedBom);

  if (aspect === "cost") return <div className="space-y-3">
    <MetricGrid metrics={[
      ["Known parts cost", totals.source === "normalized" ? moneyMinor(totals.knownCostMinor, totals.currency) : totals.available ? (totals.knownCostMinor ? moneyMinor(totals.knownCostMinor, totals.currency) : "Not resolved") : "Resolving…"],
      ["Priced lines", totals.available ? `${totals.pricedLines} / ${totals.lineCount}` : `— / ${totals.lineCount}`],
      ["Unpriced lines", totals.available ? String(totals.unpricedLines) : "—"],
      ["Declared estimate", project.estimated_cost_usd == null ? "Not supplied" : money(project.estimated_cost_usd)],
    ]} />
    <Card title="Line-item cost breakdown">
      {normalizedBomLoading
        ? <Empty>Loading the normalized BOM…</Empty>
        : normalizedBom
          ? <NormalizedBomTable bom={normalizedBom} showCosts />
          : <BomTable project={project} showCosts />}
    </Card>
    <LegacyBomEvidence bom={bom} normalizedBom={normalizedBom} />
    <Card title="How this cost will be resolved"><p className="text-[12px] leading-relaxed text-muted-foreground">RoboPartPicker will match reviewed BOM identities against its internal component catalog and stored supplier offers, then calculate purchasable configurations by region, quantity, availability, shipping constraints, and freshness. It does not infer a purchasable part from CAD geometry, and this release does not claim live prices where no catalog offer has been resolved.</p></Card>
  </div>;

  if (aspect === "parts") return <div className="space-y-3">
    <MetricGrid metrics={[
      ["BOM lines", String(totals.lineCount)],
      ["Total quantity", totals.available ? String(totals.units) : "—"],
      ["Identified by MPN", String(normalizedBom ? normalizedBom.items.filter((item) => item.manufacturerPartNumber).length : bom.filter((item) => item.mpn).length)],
      ["Unpriced lines", totals.available ? String(totals.unpricedLines) : "—"],
    ]} />
    <Card title="Reviewed bill of materials">
      {normalizedBomLoading
        ? <Empty>Loading the normalized BOM…</Empty>
        : normalizedBom
          ? <NormalizedBomTable bom={normalizedBom} />
          : <BomTable project={project} />}
    </Card>
    <LegacyBomEvidence bom={bom} normalizedBom={normalizedBom} />
    <Card title="Identity rules"><p className="text-[12px] text-muted-foreground">Original imported values remain preserved. Manufacturer and part number are normalized only after deterministic matching or human review; mesh names and filenames are candidates, not confirmed commercial parts.</p></Card>
  </div>;

  if (aspect === "schedule") return <div className="space-y-3">
    <MetricGrid metrics={[["Declared time", project.rpps.build?.estimated_time_hours == null ? "Not supplied" : `${project.rpps.build.estimated_time_hours} h`], ["Documented step time", `${assembly.reduce((sum, item) => sum + (item.duration_min ?? 0), 0)} min`], ["Difficulty", project.rpps.build?.difficulty ?? "Not assessed"], ["Assembly steps", String(assembly.length)]]} />
    <Card title="Tools">{listOrEmpty(project.rpps.build?.required_tools)}</Card>
    <Card title="Skills">{listOrEmpty(project.rpps.build?.required_skills)}</Card>
    <Card title="Fabrication processes">{listOrEmpty(project.rpps.build?.fabrication)}</Card>
  </div>;

  if (aspect === "software") {
    const softwareFiles = files.filter((file) => ["firmware", "config", "urdf", "mjcf"].includes(file.kind));
    return <div className="space-y-3">
      <MetricGrid metrics={[["Operating system", project.rpps.software?.os ?? "Not specified"], ["Middleware", project.rpps.software?.middleware ?? "Not specified"], ["ROS support", project.rpps.software?.ros_support ?? "Not specified"], ["Software artifacts", String(softwareFiles.length)]]} />
      <Card title="Languages">{listOrEmpty(project.rpps.software?.languages)}</Card>
      <Card title="Simulators">{listOrEmpty(project.rpps.software?.simulators)}</Card>
      <Card title="Firmware, configuration & robot descriptions"><ArtifactList files={softwareFiles} /></Card>
      <Card title="Reproducibility note"><p className="text-[12px] text-muted-foreground">Exact dependency versions, firmware revisions, configuration hashes, calibration procedures, and expected tests belong in the portable release lockfile. Missing values remain visibly unspecified rather than being guessed.</p></Card>
    </div>;
  }

  if (aspect === "assembly") return <div className="space-y-3">
    <Card title="Assembly sequence">{assembly.length ? <ol className="space-y-3">{assembly.map((step, index) => <li key={step.id} className="border-l-2 border-primary/40 pl-3 text-[12px]"><div className="font-semibold">{index + 1}. {step.title}</div>{step.body && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{step.body}</p>}<div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground"><span className="mono">{step.id}</span>{step.duration_min != null && <span>· {step.duration_min} min</span>}{step.depends_on?.map((dependency) => <span key={dependency}>· after {dependency}</span>)}</div></li>)}</ol> : <Empty>No reviewed assembly steps are available.</Empty>}</Card>
    <Card title="Improve these instructions"><p className="text-[12px] text-muted-foreground">Imported documentation may create clearly labeled draft steps. Builders can propose a missing step, correction, dependency, tool, or observed result against an immutable release. Maintainers review the structured proposal for the next version, preserving authorship and history.</p><Link to={`/projects/${project.slug}#portable-releases`} className="btn-primary btn-sm mt-3 inline-flex"><GitPullRequest className="h-3.5 w-3.5" /> Open release collaboration</Link></Card>
  </div>;

  if (aspect === "integrations") return <Card title="Declared interfaces and compatibility claims">{(project.rpps.integrations ?? []).length ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[12px]"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-2">From</th><th className="p-2">To</th><th className="p-2">Status</th><th className="p-2">Conditions / notes</th><th className="p-2">Evidence</th></tr></thead><tbody>{project.rpps.integrations?.map((item, index) => <tr key={`${item.a}-${item.b}-${index}`} className="border-b border-border/60"><td className="p-2 mono">{item.a}</td><td className="p-2 mono">{item.b}</td><td className="p-2">{item.status}</td><td className="p-2 text-muted-foreground">{item.notes ?? "Not supplied"}</td><td className="p-2">{item.evidence_url ? <a href={item.evidence_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">source <ExternalLink className="inline h-3 w-3" /></a> : "None"}</td></tr>)}</tbody></table></div> : <Empty>No interface or compatibility claims have been reviewed.</Empty>}<p className="mt-3 text-[10.5px] text-muted-foreground">Claims should identify whether they are manufacturer-declared, maintainer-declared, community-observed, independently reproduced, disputed, or outdated. “Compatible” never means drop-in compatible without conditions and evidence.</p></Card>;

  if (aspect === "evidence") return <div className="space-y-3"><Card title="Evidence sources">{(project.rpps.evidence ?? []).length ? <ul className="space-y-2">{project.rpps.evidence?.map((item, index) => <li key={index} className="rounded border border-border p-2 text-[12px]"><div className="flex flex-wrap justify-between gap-2"><span>{item.claim}</span><span className="mono text-[10px] text-muted-foreground">{item.source_type}{item.confidence == null ? "" : ` · ${Math.round(item.confidence * 100)}% confidence`}</span></div>{item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">Open source <ExternalLink className="h-3 w-3" /></a>}</li>)}</ul> : <Empty>No evidence claims have been recorded.</Empty>}</Card><Card title="Evidence levels"><p className="text-[12px] text-muted-foreground">Structured means required artifacts are present. Tested means the maintainer supplied a completed build and evidence. Reproduced means at least one independent builder succeeded. Repeated means multiple independent builders succeeded. Current means parts, links, and procedures were recently revalidated.</p></Card></div>;

  return <div className="space-y-3">
    <MetricGrid metrics={[["Build passports", String(project.reproduction_count)], ["Independent successes", String(project.successful_reproduction_count)], ["Published project", project.status === "published" ? "Yes" : "No"], ["Evidence sources", String(project.rpps.evidence?.length ?? 0)]]} />
    <Card title="What the counts mean"><p className="text-[12px] leading-relaxed text-muted-foreground">A reproduction is a personal build passport locked to an exact immutable release. A successful reproduction only counts here after an independent builder records evidence and submits a successful outcome. Private build details remain private even though the aggregate count contributes to project confidence.</p><Link to={`/projects/${project.slug}#portable-releases`} className="btn-primary btn-sm mt-3 inline-flex">Reproduce or report an outcome</Link></Card>
  </div>;
}

function NormalizedBomTable({ bom, showCosts = false }: { bom: BomDetail; showCosts?: boolean }) {
  const currency = bom.version?.currency ?? "USD";
  return <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-[12px]"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-2">Ref</th><th className="p-2">Part</th><th className="p-2">Manufacturer / MPN</th><th className="p-2 text-right">Qty</th>{showCosts && <><th className="p-2 text-right">Unit</th><th className="p-2 text-right">Extended</th></>}</tr></thead><tbody>{bom.items.map((item) => <NormalizedBomRow key={item.id} item={item} currency={currency} showCosts={showCosts} />)}</tbody><tfoot><tr className="border-t border-border"><td colSpan={3} className="p-2 text-[11px] text-muted-foreground">Known totals only. Unpriced lines remain visible.</td><td className="p-2 text-right mono">{bom.totals.units}</td>{showCosts && <><td className="p-2" /><td className="p-2 text-right mono font-medium">{moneyMinor(bom.totals.knownCostMinor, currency)}</td></>}</tr></tfoot></table></div>;
}

function NormalizedBomRow({ item, currency, showCosts }: { item: BomItem; currency: string; showCosts: boolean }) {
  const unitMinor = item.targetUnitPriceMinor ?? item.selectedUnitPriceMinor ?? item.lowestUnitPriceMinor;
  return <tr className="border-b border-border/60">
    <td className="p-2 mono">{item.slotKey}</td>
    <td className="p-2"><div className="font-medium">{item.componentSlug ? <Link to={`/parts/${item.componentCategory}/${item.componentSlug}`} className="hover:text-primary">{item.componentName ?? item.description}</Link> : item.description}</div><div className="text-[10px] text-muted-foreground">{[item.completeness, item.manufacturerPartNumber ? null : "MPN unresolved"].filter(Boolean).join(" · ") || "No classification"}</div></td>
    <td className="p-2"><div>{item.manufacturerName ?? "Unresolved"}</div><div className="mono text-[10px] text-muted-foreground">{item.manufacturerPartNumber ?? "No MPN"}</div></td>
    <td className="p-2 text-right mono">{item.quantity} {item.unit}</td>
    {showCosts && <><td className="p-2 text-right mono">{moneyMinor(unitMinor, currency)}</td><td className="p-2 text-right mono">{moneyMinor(unitMinor == null ? null : unitMinor * item.quantity, currency)}</td></>}
  </tr>;
}

function LegacyBomEvidence({ bom, normalizedBom }: { bom: ProjectRow["rpps"]["bom"]; normalizedBom: BomDetail | null }) {
  if (!normalizedBom || !bom?.length) return null;
  return <Card title="Legacy RPPS BOM (source evidence)">
    <p className="text-[12px] text-muted-foreground">The legacy flat RPPS package retains {bom.length} line{bom.length === 1 ? "" : "s"} of original imported provenance. They are shown as source evidence only: the normalized D1-backed BOM above is the current source of truth for counts, offers, and costs.</p>
    <ul className="mt-2 space-y-1">{bom.map((item, index) => <li key={`${item.ref ?? item.name}-${index}`} className="text-[11px] text-muted-foreground"><span className="mono text-[10px]">{item.ref ?? "—"}</span> · {item.name}{item.fabricated ? <span className="ml-1 rounded bg-muted px-1 py-0.5 text-[9px] uppercase">fabricated</span> : null}</li>)}</ul>
  </Card>;
}

function BomTable({ project, showCosts = false }: { project: ProjectRow; showCosts?: boolean }) {
  const bom = project.rpps.bom ?? [];
  if (!bom.length) return <Empty>No reviewed BOM lines are available.</Empty>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-[12px]"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="p-2">Ref</th><th className="p-2">Part</th><th className="p-2">Manufacturer / MPN</th><th className="p-2 text-right">Qty</th>{showCosts && <><th className="p-2 text-right">Unit</th><th className="p-2 text-right">Extended</th></>}</tr></thead><tbody>{bom.map((item, index) => <tr key={`${item.ref ?? item.name}-${index}`} className="border-b border-border/60"><td className="p-2 mono">{item.ref ?? "—"}</td><td className="p-2"><div className="font-medium">{item.name}</div><div className="text-[10px] text-muted-foreground">{[item.category, item.fabricated ? "fabricated" : null, item.optional ? "optional" : null].filter(Boolean).join(" · ") || "No classification"}</div></td><td className="p-2"><div>{item.manufacturer ?? "Unresolved"}</div><div className="mono text-[10px] text-muted-foreground">{item.mpn ?? "No MPN"}</div></td><td className="p-2 text-right mono">{item.qty}</td>{showCosts && <><td className="p-2 text-right mono">{item.unit_cost_usd == null ? "—" : money(item.unit_cost_usd)}</td><td className="p-2 text-right mono">{item.unit_cost_usd == null ? "—" : money(item.unit_cost_usd * item.qty)}</td></>}</tr>)}</tbody></table></div>;
}

function ArtifactList({ files }: { files: NonNullable<ProjectRow["rpps"]["files"]> }) {
  if (!files.length) return <Empty>No matching artifacts were declared.</Empty>;
  return <ul className="space-y-1.5">{files.map((file) => <li key={file.path} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2 text-[12px]"><span><span className="mono text-[10px] text-muted-foreground">{file.kind}</span> · {file.path}</span>{file.url && <a href={file.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">open <ExternalLink className="inline h-3 w-3" /></a>}</li>)}</ul>;
}

function MetricGrid({ metrics }: { metrics: Array<[string, string]> }) { return <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="surface-card p-3"><div className="section-title">{label}</div><div className="mono mt-1 text-lg font-bold">{value}</div></div>)}</div>; }
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <section className="surface-card p-3"><h2 className="section-title mb-2">{title}</h2>{children}</section>; }
function Empty({ children }: { children: React.ReactNode }) { return <p className="rounded border border-dashed border-border bg-muted/30 p-3 text-[12px] text-muted-foreground">{children}</p>; }
function State({ children }: { children: React.ReactNode }) { return <div className="mx-auto max-w-[1120px] px-4 py-10 text-[12px] text-muted-foreground">{children}</div>; }
function listOrEmpty(items?: readonly string[]) { return items?.length ? <div className="flex flex-wrap gap-1">{items.map((item) => <span key={item} className="rounded border border-border bg-muted px-2 py-1 text-[11px]">{item}</span>)}</div> : <Empty>Not specified.</Empty>; }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value); }
function moneyMinor(value: number | null, currency: string = "USD") { return value == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value / 100); }