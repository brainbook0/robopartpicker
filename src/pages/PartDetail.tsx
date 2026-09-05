import { lazy, Suspense, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { categoryLabel, type CatalogPart } from "@/shared/catalog";
import { useComponent, useComponentAlternatives } from "@/lib/api/catalog";
import { ExpandableField } from "@/components/common/ExpandableField";
import { RelatedDiscussionList } from "@/components/community/RelatedDiscussionList";
import { ComingSoon } from "@/components/common/ComingSoon";
import { CatalogDataNotice } from "@/components/parts/CatalogDataNotice";
import { PartVisual } from "@/components/parts/PartVisual";
import { PartAlternatives } from "@/components/parts/PartAlternatives";
import { RfqComposer } from "@/components/parts/RfqComposer";
import {
  isPartSaved,
  toggleSavedPart,
  toggleCompare,
  readCompare,
} from "@/lib/catalogWorkspace";
import { fmtList, fmtNumber, fmtText, MISSING } from "@/lib/partsFormat";
import {
  Boxes,
  Check,
  ChevronDown,
  ExternalLink,
  GitCompareArrows,
  FileBox,
  FileText,

  Images,
  Link2,
  PackageCheck,
  Plus,
  Star,
  StarOff,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PageMeta } from "@/components/PageMeta";
import { normalizeCatalogText } from "@/lib/catalogText";
import { selectPartPreview } from "@/lib/partPreview";
import { PriceHistoryPlaceholder } from "@/components/pricing/PriceHistoryPlaceholder";

const StlModelViewer = lazy(() => import("@/components/projects/StlModelViewer"));
const StepModelViewer = lazy(() => import("@/components/projects/StepModelViewer"));
const ObjModelViewer = lazy(() => import("@/components/projects/ObjModelViewer"));

const SPEC_LABELS: Record<string, string> = {
  peakNm: "Peak torque",
  contNm: "Continuous torque",
  speedRpm: "Maximum speed",
  voltageV: "Voltage",
  weightKg: "Weight",
  torqueDensity: "Torque density",
  backlashArcmin: "Backlash",
  encoderType: "Encoder",
  protocol: "Protocol",
  protocols: "Protocols",
  thermalLimitC: "Thermal limit",
  dutyCyclePct: "Duty cycle",
  dof: "Degrees of freedom",
  actuatedDof: "Actuated degrees of freedom",
  payloadKg: "Payload",
  gripForceN: "Grip force",
  tactile: "Tactile sensing",
  interface: "Interface",
  sdk: "SDK",
  fingerReplaceCostUsd: "Finger replacement cost",
  type: "Type",
  rangeM: "Range",
  fovDeg: "Field of view",
  hz: "Frame rate",
  resolution: "Resolution",
  tops: "AI performance",
  ramGb: "Memory",
  storageGb: "Storage",
  ports: "Ports",
  powerW: "Power",
  maxCurrentA: "Maximum current",
  ratio: "Ratio",
  ratedTorqueNm: "Rated torque",
  peakTorqueNm: "Peak torque",
};

const SPEC_UNITS: Record<string, string> = {
  peakNm: " Nm", contNm: " Nm", speedRpm: " RPM", voltageV: " V", weightKg: " kg",
  torqueDensity: " Nm/kg", backlashArcmin: " arcmin", thermalLimitC: " °C", dutyCyclePct: "%",
  payloadKg: " kg", gripForceN: " N", fingerReplaceCostUsd: " USD", rangeM: " m", fovDeg: "°",
  hz: " Hz", ramGb: " GB", storageGb: " GB", powerW: " W", maxCurrentA: " A",
  ratedTorqueNm: " Nm", peakTorqueNm: " Nm",
};

const titleCase = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const categoryTitle = (category: string) => categoryLabel[category] ?? titleCase(category);


function Panel({ title, count, defaultOpen = true, right, id, children }: {
  title: string;
  count?: number | string;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} className="surface-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 hover:bg-muted/40">
        <div className="flex items-center gap-2">
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
          <span className="section-title">{title}</span>
          {count !== undefined && <span className="pill mono text-[10px]">{count}</span>}
        </div>
        {right}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

const Row = ({ k, v, source }: { k: string; v: React.ReactNode; source?: string }) => (
  <ExpandableField k={k} v={v} source={source} />
);

function renderSpecValue(key: string, value: unknown, unit?: string | null): string {
  if (typeof value === "number") {
    const text = fmtNumber(value, { digits: Number.isInteger(value) ? undefined : 2 });
    return text === MISSING ? text : `${text}${unit ? ` ${unit}` : SPEC_UNITS[key] ?? ""}`;
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return fmtList(value);
  return fmtText(value);
}

function SourceSpecifications({ part }: { part: CatalogPart }) {
  const rows = part.technicalSpecifications ?? [];

  if (!rows.length) {
    return <div className="p-4 text-[12px] text-muted-foreground">No structured source specifications have been published for this component yet.</div>;
  }

  return <div className="p-3">{rows.map((spec) => (
    <Row key={spec.key} k={spec.label || SPEC_LABELS[spec.key] || titleCase(spec.key)} v={renderSpecValue(spec.key, spec.value, spec.unit)} source={part.sourceUrl} />
  ))}</div>;
}

export default function PartDetail() {
  const { category, slug } = useParams();
  const componentQuery = useComponent(slug);
  const part = componentQuery.data?.item;
  const alternativesQuery = useComponentAlternatives(part?.id, 5);

  const [tick, setTick] = useState(0);

  if (componentQuery.isPending) {
    return <div className="p-8 text-[13px]" role="status">Loading component from the API…</div>;
  }
  if (componentQuery.isError) {
    return <div className="p-8" role="alert"><div className="font-medium text-negative">Component data could not be loaded.</div><div className="mt-1 text-[12px] text-muted-foreground">{componentQuery.error.message}</div></div>;
  }
  if (!part || (category && part.category !== category)) return <div className="p-8">Part not found.</div>;

  if (part.isDemo) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-6">
        <ComingSoon
          icon={Boxes}
          kicker="Unavailable"
          title={`${part.name} is not a published catalog record`}
          body="This component is a demonstration fixture and is withheld from production. No fixture identity, specifications, imagery, files, or compatibility claims are shown."
          actionLabel="Back to component catalog"
          actionTo={`/parts/${part.category}`}
        />
      </div>
    );
  }

  void tick;
  const compare = readCompare();
  const inCompare = compare.ids.includes(part.id);
  const saved = isPartSaved(part.id);
  const files = part.files ?? [];
  const imageFiles = files.filter((file) => file.purpose === "image" || file.mediaType.startsWith("image/"));
  const partPreview = selectPartPreview(files);
  const projectUsage = part.projectUsage ?? [];
  const sourceEvidence = part.evidence ?? [];

  const doSave = () => {
    const nowSaved = toggleSavedPart(part.id);
    setTick((value) => value + 1);
    toast({ title: nowSaved ? "Component saved" : "Component unsaved", description: "Stored in this browser only." });
  };

  const doCompare = () => {
    let result = toggleCompare(part.id, part.category);
    if (result.kind === "category-mismatch") {
      result = toggleCompare(part.id, part.category, { allowReplace: true });
      toast({ title: "Compare set reset", description: `Now comparing ${categoryTitle(part.category).toLowerCase()} only.` });
    } else if (result.kind === "limit-reached") {
      toast({ title: "Compare limit reached", description: "Comparison holds up to 4 components. Remove one first.", variant: "destructive" });
      return;
    } else if (result.kind === "invalid-part") {
      return;
    } else {
      toast({ title: result.kind === "added" ? "Added to compare" : "Removed from compare" });
    }
    setTick((value) => value + 1);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <PageMeta title={`${part.name}${part.maker ? ` by ${part.maker}` : ""} | RoboPartPicker`} description={normalizeCatalogText(part.blurb) || `Review source-backed identity, specifications, files and robotics project usage for ${part.name}.`} path={`/parts/${part.category}/${part.slug}`} />
      <div className="mb-2 text-[12px] text-muted-foreground">
        <Link to={`/parts/${part.category}`} className="hover:text-primary">{categoryTitle(part.category)}</Link> / <span className="text-foreground">{part.name}</span>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-start">
        <PartVisual part={part} className="h-44 w-full" />
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <h1 className="text-[22px] font-bold tracking-tight break-words">{part.name}</h1>
          <div className="mt-1 text-[13px] text-muted-foreground">
            {part.maker || "Unknown manufacturer"}
            {part.mpn ? <> · MPN <span className="mono text-foreground">{part.mpn}</span></> : null}
            {part.region ? ` · ${part.region}` : ""}
          </div>
          {part.blurb ? <p className="mt-2 max-w-3xl whitespace-pre-line text-[14px]">{normalizeCatalogText(part.blurb)}</p> : <p className="mt-2 text-[13px] text-muted-foreground">No source summary has been published for this component yet.</p>}
          <div className="mt-2 flex flex-wrap gap-1">
            {part.tags.map((tag) => <span key={tag} className="pill">{tag}</span>)}
            {part.openSource && <span className="pill pill-good">open source</span>}
            <span className="pill">{categoryTitle(part.category)}</span>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-wrap gap-2 sm:col-span-2 lg:col-span-1 lg:w-auto lg:justify-end">
          {part.sourceUrl && <a href={part.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-primary"><ExternalLink className="h-3.5 w-3.5" /> Product source</a>}
          {part.manufacturerUrl && part.manufacturerUrl !== part.sourceUrl && <a href={part.manufacturerUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost"><ExternalLink className="h-3.5 w-3.5" /> Manufacturer</a>}
          <Link to={`/builder?add=${encodeURIComponent(part.id)}`} className="btn-primary"><Plus className="h-3.5 w-3.5" /> Add to BOM</Link>
          <button onClick={doSave} className="btn-ghost inline-flex items-center gap-1" aria-pressed={saved}>
            {saved ? <Star className="h-3.5 w-3.5 fill-primary text-primary" /> : <StarOff className="h-3.5 w-3.5" />} {saved ? "Saved" : "Save"}
          </button>
          <button onClick={doCompare} className={`btn-ghost inline-flex items-center gap-1 ${inCompare ? "text-primary" : ""}`} aria-pressed={inCompare}>
            {inCompare ? <Check className="h-3.5 w-3.5" /> : <GitCompareArrows className="h-3.5 w-3.5" />} {inCompare ? "In compare" : "Compare"}
          </button>
        </div>
      </div>

      <CatalogDataNotice className="mt-4" />

      {partPreview && (
        <div className="mt-4">
          <Suspense fallback={<div className="surface-card grid h-[360px] place-items-center text-[11px] text-muted-foreground">Loading exact component geometry…</div>}>
            {partPreview.kind === "step" ? (
              <StepModelViewer files={[{ contentUrl: partPreview.file.contentUrl, name: partPreview.file.originalName }]} sourceUrl={part.sourceUrl} title={`${part.name} · exact component geometry`} />
            ) : partPreview.kind === "stl" ? (
              <StlModelViewer files={[{ contentUrl: partPreview.file.contentUrl, name: partPreview.file.originalName }]} sourceUrl={part.sourceUrl} title={`${part.name} · exact component geometry`} />
            ) : partPreview.kind === "obj" ? (
              <ObjModelViewer file={{ contentUrl: partPreview.file.contentUrl, name: partPreview.file.originalName }} sourceUrl={part.sourceUrl} title={`${part.name} · exact component geometry`} />
            ) : null}
          </Suspense>
        </div>
      )}

      <div className="mt-4"><PriceHistoryPlaceholder entityName={part.name} kind="part" /></div>

      {part.profile && <div className="surface-card mt-4 overflow-hidden"><div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0"><ProfileMetric label="Identity" value={part.profile.identity} /><ProfileMetric label="Technical specs" value={part.profile.technicalSpecCount} /><ProfileMetric label="Images" value={part.profile.imageCount} /><ProfileMetric label="Engineering files" value={part.profile.engineeringFileCount} /><ProfileMetric label="BOM usages" value={part.profile.projectUsageCount} /><ProfileMetric label="Evidence records" value={part.profile.evidenceCount} /></div>{part.profile.missing.length > 0 && <div className="border-t border-border px-3 py-2 text-[10.5px] text-muted-foreground"><span className="mr-2 font-semibold uppercase tracking-wide text-foreground">Explicit unknowns</span>{part.profile.missing.join(" · ")}</div>}</div>}

      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-4">
          <Panel title="Images and source links" count={imageFiles.length}>
            {imageFiles.length > 0 ? (
              <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {imageFiles.map((file) => <a key={file.id} href={file.contentUrl} target="_blank" rel="noreferrer" className="group overflow-hidden rounded border border-border bg-muted/20 hover:border-primary/60"><img src={file.contentUrl} alt={`${part.name} - ${file.originalName}`} className="aspect-[4/3] w-full object-contain p-2" loading="lazy" /><div className="truncate border-t border-border px-2 py-1.5 text-[10.5px] group-hover:text-primary">{file.originalName}</div></a>)}
              </div>
            ) : (
              <div className="grid gap-4 p-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
                <div><PartVisual part={part} className="h-40 w-full" /><div className="mt-1 text-center text-[9px] uppercase tracking-wide text-muted-foreground">Identity illustration, not a product photograph</div></div>
                <div><div className="text-[12px] font-medium">No exact source-backed product photograph is attached yet</div><p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">The identity illustration keeps this record visually recognizable without inventing its physical appearance. Use the authoritative product or manufacturer source to inspect current photographs, drawings and dimensions.</p><div className="mt-3 flex flex-wrap gap-2">{part.sourceUrl && <a href={part.sourceUrl} target="_blank" rel="noreferrer" className="btn-primary btn-sm">Product source <ExternalLink className="h-3 w-3" /></a>}{part.datasheetUrl && <a href={part.datasheetUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Datasheet <ExternalLink className="h-3 w-3" /></a>}</div></div>
              </div>
            )}
          </Panel>

          <Panel title="Files and engineering artifacts" count={files.length}>
            <PartFiles files={files} />
          </Panel>

          <Panel title="Used in project BOMs" count={projectUsage.length}>
            <ProjectUsage items={projectUsage} />
          </Panel>

          {sourceEvidence.length > 0 && <Panel title="Source evidence" count={sourceEvidence.length}><PartEvidence items={sourceEvidence} /></Panel>}

          <Panel title="Specifications"><SourceSpecifications part={part} /></Panel>


          <Panel id="rfq" title="Draft RFQ" defaultOpen={false} right={<span className="text-[10.5px] font-medium uppercase tracking-wide text-foreground">Local only · not sent</span>}>
            <div className="p-3"><RfqComposer key={part.id} prefill={{ partId: part.id, manualPartName: part.mpn ?? part.name, quantity: 1 }} /></div>
          </Panel>

          <PartAlternatives
            current={part}
            items={alternativesQuery.data?.items ?? []}
            loading={alternativesQuery.isPending}
            error={alternativesQuery.isError}
          />

          <RelatedDiscussionList relatedType="component" relatedId={part.id} title="Community discussions about this component" />
        </section>

        <aside className="min-w-0 space-y-4">
          <div className="surface-card p-4">
            <div className="section-title mb-2">Record</div>
            <Row k="Manufacturer" v={part.maker || "Unknown"} />
            <Row k="MPN" v={part.mpn || "Unknown"} />
            <Row k="Category" v={categoryTitle(part.category)} />
            <Row k="Lifecycle" v={part.lifecycleStatus || "Unknown"} source={part.sourceUrl} />
            <Row k="Primary region" v={part.region || "Unknown"} />
            <Row k="Provenance" v={part.provenanceLabel || "Unknown"} />
            <Row k="Last source refresh" v={part.freshnessAt ? new Date(part.freshnessAt).toLocaleDateString() : "Unknown"} />
            {part.datasheetUrl && <Row k="Datasheet" v={<a href={part.datasheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Open source document <ExternalLink className="h-3 w-3" /></a>} />}
          </div>

          <div className="surface-card p-4">
            <div className="section-title mb-2">Technical coverage</div>
            <Row k="Specifications" v={part.profile?.technicalSpecCount ?? part.technicalSpecifications?.length ?? 0} />
            <Row k="Images" v={part.profile?.imageCount ?? imageFiles.length} />
            <Row k="Engineering files" v={part.profile?.engineeringFileCount ?? files.length - imageFiles.length} />
            <Row k="BOM usages" v={part.profile?.projectUsageCount ?? projectUsage.length} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function PartFiles({ files }: { files: NonNullable<CatalogPart["files"]> }) {
  if (!files.length) return <div className="flex items-start gap-3 p-4 text-[11px] leading-5 text-muted-foreground"><FileBox className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-medium text-foreground">No component files attached</div><p>Datasheets, drawings, CAD, firmware, and verified photos will appear here without changing the part URL when source-backed files are added.</p></div></div>;
  return <div className="grid gap-2 p-3 sm:grid-cols-2">{files.map((file) => <a key={file.id} href={file.contentUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3 rounded border border-border p-3 hover:border-primary/60 hover:bg-muted/30"><FileText className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="truncate text-[12px] font-medium">{file.originalName}</div><div className="mt-0.5 font-mono text-[9.5px] uppercase text-muted-foreground">{file.purpose} · {formatBytes(file.sizeBytes)} · {file.mediaType}</div></div><ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></a>)}</div>;
}

function ProfileMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="px-3 py-2"><div className="text-[9.5px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-0.5 font-mono text-[13px] font-semibold">{typeof value === "number" ? value.toLocaleString() : value}</div></div>;
}

function ProjectUsage({ items }: { items: NonNullable<CatalogPart["projectUsage"]> }) {
  if (!items.length) return <div className="flex items-start gap-3 p-4 text-[11px] leading-5 text-muted-foreground"><PackageCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="font-medium text-foreground">No published project usage linked yet</div><p>This component is not currently referenced by a public normalized BOM.</p></div></div>;
  return <div className="divide-y divide-border/70">{items.map((item) => <div key={item.bomItemId} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><Link to={`/projects/${item.projectSlug}`} className="inline-flex items-center gap-1 text-[12px] font-semibold hover:text-primary hover:underline">{item.projectName}<ExternalLink className="h-3 w-3" /></Link><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground"><span className="font-mono">{item.quantity} {item.unit}</span>{item.evidenceLocator && <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> {item.evidenceLocator}</span>}</div>{item.notes && <p className="mt-1 text-[10.5px] leading-4 text-muted-foreground">{item.notes}</p>}</div><Link to={`/boms/${encodeURIComponent(item.bomSlug ?? item.bomId)}`} className="btn-ghost btn-sm">Open BOM</Link></div>)}</div>;
}

function PartEvidence({ items }: { items: NonNullable<CatalogPart["evidence"]> }) {
  return <div className="divide-y divide-border/70">{items.map((item) => <div key={item.id} className="flex items-start gap-3 px-4 py-3"><Images className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[12px] font-medium">{item.title}</span><span className="pill">{item.sourceType} · {Math.round(item.confidence * 100)}%</span></div><div className="mt-1 text-[10px] text-muted-foreground">Retrieved {new Date(item.retrievedAt).toLocaleDateString()}</div>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">Open source <ExternalLink className="h-3 w-3" /></a>}</div></div>)}</div>;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}
