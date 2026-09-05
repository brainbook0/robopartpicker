import { Boxes, CircleDollarSign, Fingerprint, ShieldCheck } from "lucide-react";
import type { ProjectRow } from "@/lib/projects";
import { ROBOT_CATEGORY_LABELS } from "@/shared/robotCategory";
import type { ProjectProfileEstimate } from "@/shared/projectEstimate";

type MetadataProject = Pick<ProjectRow,
  | "version"
  | "rpps_version"
  | "project_kind"
  | "robot_category"
  | "status"
  | "publishability"
  | "license"
  | "repo_url"
  | "docs_url"
  | "last_checked_at"
  | "updated_at"
  | "bom_line_count"
  | "reproduction_count"
  | "successful_reproduction_count"
  | "tags"
  | "is_demo"
>;

export function ProjectMetadataSummary({ project, estimate, variant = "full" }: { project: MetadataProject; estimate: ProjectProfileEstimate; variant?: "full" | "hero" }) {
  const sourceUrl = project.repo_url ?? project.docs_url;
  const sourceLabel = sourceUrl ? safeHostname(sourceUrl) : "Source URL not published";
  const license = project.license
    ?? (project.project_kind === "commercial_showcase" ? "Manufacturer terms" : "License not published");
  const estimateSourceLabel = estimate.cost
    ? estimate.cost.source === "market" ? "Market estimate" : capitalize(estimate.cost.source)
    : null;
  const estimateLabel = estimate.cost && estimateSourceLabel
    ? `${estimateSourceLabel} · ${estimate.cost.confidence} confidence`
    : "Awaiting a source-backed price";

  return (
    <section aria-label="Project metadata" className={variant === "hero" ? "flex h-full min-w-0 flex-col" : "mt-3 border-t border-border pt-3"}>
      <div className={variant === "hero" ? "grid min-h-0 flex-1 gap-px overflow-hidden border border-border bg-border sm:grid-cols-2" : "grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 xl:grid-cols-4"}>
        <MetadataGroup icon={<Fingerprint className="h-4 w-4" />} title="Identity" rows={[
          ["Version", project.project_kind === "commercial_showcase" ? `Manufacturer listing · RPPS ${project.rpps_version}` : `v${project.version} · RPPS ${project.rpps_version}`],
          ["Category", project.robot_category ? ROBOT_CATEGORY_LABELS[project.robot_category] : "General robotics"],
          ["Type", projectKindLabel(project.project_kind)],
        ]} />
        <MetadataGroup icon={<ShieldCheck className="h-4 w-4" />} title="Source" rows={[
          ["Official source", sourceLabel],
          ["License", license],
          ["Last verified", formatDate(project.last_checked_at ?? project.updated_at)],
        ]} />
        <MetadataGroup icon={<Boxes className="h-4 w-4" />} title="Maturity" rows={[
          ["Publication", project.is_demo ? "Demo fixture" : capitalize(project.status)],
          ["Review state", publishabilityLabel(project.publishability)],
          ["BOM", project.bom_line_count > 0 ? `${project.bom_line_count} identified lines` : project.project_kind === "commercial_showcase" ? "Manufacturer BOM not published" : "Source BOM not published"],
          ["Reproductions", project.project_kind === "commercial_showcase" ? "Not applicable to commercial showcases" : `${project.successful_reproduction_count} verified · ${project.reproduction_count} started`],
        ]} />
        <MetadataGroup icon={<CircleDollarSign className="h-4 w-4" />} title={project.project_kind === "commercial_showcase" ? "Pricing" : "Estimates"} rows={[
          [project.project_kind === "commercial_showcase" ? "Price" : "Build cost", estimate.cost ? money(estimate.cost.amountMinor) : project.project_kind === "commercial_showcase" ? "Official price not published" : "Cost estimate unavailable"],
          [project.project_kind === "commercial_showcase" ? "Buildability" : "Build time", estimate.time ? duration(estimate.time.minutes) : project.project_kind === "commercial_showcase" ? "Not a buildable release" : "Build time unavailable"],
          ["Basis", estimateLabel],
          ["Valued", estimate.cost ? formatDate(estimate.valuedAt) : "No valuation published"],
        ]} />
      </div>
      {project.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Project tags">
          <span className="section-title mr-1">Taxonomy</span>
          {project.tags.map((tag) => <span key={tag} className="border border-border bg-muted/35 px-2 py-0.5 text-[10.5px] text-muted-foreground">{tag}</span>)}
        </div>
      )}
    </section>
  );
}

function MetadataGroup({ icon, title, rows }: { icon: React.ReactNode; title: string; rows: Array<[string, string]> }) {
  return (
    <section className="min-w-0 bg-background p-3">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground">
        <span className="text-primary" aria-hidden="true">{icon}</span>{title}
      </h2>
      <dl className="mt-2 space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-2 text-[11px] leading-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function projectKindLabel(kind: ProjectRow["project_kind"]): string {
  if (kind === "physical_design") return "Open physical design";
  if (kind === "robotics_software") return "Robotics software";
  if (kind === "commercial_showcase") return "Commercial robot";
  return "Robotics project";
}

function publishabilityLabel(value: ProjectRow["publishability"]): string {
  if (value === "ready") return "Source reviewed";
  if (value === "blocked") return "Publication blocked";
  if (value === "review") return "Verification in progress";
  return "Enrichment in progress";
}

function safeHostname(value: string): string {
  try { return new URL(value).hostname.replace(/^www\./u, ""); }
  catch { return "Official source linked"; }
}

function formatDate(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(time))
    : "Verification date recorded";
}

function money(minor: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
