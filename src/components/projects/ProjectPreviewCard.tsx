import { AlertTriangle, Clock3, GitBranch, ShieldCheck, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { ProjectMedia } from "@/components/projects/ProjectMedia";
import type { ProjectRow } from "@/lib/projects";
import { projectPreviewFacts, type ProjectPreviewFact } from "@/lib/projectPreviewFacts";
import { ROBOT_CATEGORY_LABELS } from "@/shared/robotCategory";
import { trackAnalyticsEvent } from "@/lib/analytics";

export type ProjectPreviewCardVariant = "catalog" | "featured" | "compact";

export function ProjectPreviewCard({ project, variant = "catalog", className = "" }: {
  project: ProjectRow;
  variant?: ProjectPreviewCardVariant;
  className?: string;
}) {
  const facts = projectPreviewFacts(project);
  const category = project.robot_category ? ROBOT_CATEGORY_LABELS[project.robot_category] : projectKind(project.project_kind);
  const sourcePositive = facts.source.tone === "positive";
  const mediaClass = variant === "featured" ? "aspect-[16/7]" : "aspect-[16/8]";
  const padding = variant === "compact" ? "p-2.5" : "p-3";
  const versionLabel = project.project_kind === "commercial_showcase"
    ? "Manufacturer listing · Published"
    : `Version ${project.version} · ${capitalize(project.status)}`;

  return (
    <Link
      to={`/projects/${project.slug}`}
      onClick={() => trackAnalyticsEvent({ event: "project_preview_click", targetType: "project", targetId: project.slug })}
      aria-label={`${project.name} project preview`}
      className={`surface-card surface-card-hover group flex min-w-0 flex-col overflow-hidden ${className}`}
    >
      <div className="relative">
        <ProjectMedia project={project} mode="card" className={`${mediaClass} rounded-none border-x-0 border-t-0`} imageClassName="group-hover:scale-[1.02]" />
        <span className={`absolute left-1.5 top-1.5 inline-flex items-center gap-1 border bg-background/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide backdrop-blur ${sourcePositive ? "border-positive/40 text-positive" : "border-warning/40 text-warning"}`}>
          {sourcePositive ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{facts.source.value}
        </span>
        <span className="absolute bottom-1.5 left-1.5 border border-primary/30 bg-background/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide backdrop-blur">{category}</span>
      </div>

      <div className={`${padding} flex min-w-0 flex-1 flex-col`}>
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className={`${variant === "featured" ? "text-[15px]" : "text-[13px]"} truncate font-semibold leading-tight`}>{project.name}</h3>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{versionLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
            {project.githubStars != null && <span className="inline-flex items-center gap-1" aria-label={`${project.githubStars} GitHub stars`}><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{formatCount(project.githubStars)}</span>}
            {project.repo_url && <GitBranch className="h-3 w-3" aria-label="Repository source" />}
          </div>
        </div>

        <p className={`${variant === "compact" ? "line-clamp-1" : "line-clamp-2"} mt-1.5 text-[11px] leading-4 text-muted-foreground`}>
          {project.summary ?? fallbackSummary(project)}
        </p>

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <PreviewFactCell label="Cost" fact={facts.cost} />
          <PreviewFactCell label="Builds" fact={facts.builds} />
          <PreviewFactCell label="BOM" fact={facts.bom} />
        </div>

        {variant === "catalog" && project.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {project.tags.slice(0, 4).map((tag) => <span key={tag} className="bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{tag}</span>)}
            {project.tags.length > 4 && <span className="text-[9px] text-muted-foreground">+{project.tags.length - 4}</span>}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2 text-[9px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{facts.freshness}</span>
          <span className="max-w-[40%] truncate font-mono">{project.slug}</span>
        </div>
      </div>
    </Link>
  );
}

function PreviewFactCell({ label, fact }: { label: string; fact: ProjectPreviewFact }) {
  const tone = fact.tone === "positive" ? "text-positive" : fact.tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="min-w-0 border border-border bg-surface px-1.5 py-1.5" title={fact.detail}>
      <div className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 line-clamp-2 text-[10px] font-medium leading-3.5 ${tone}`}>{fact.value}</div>
      <div className="mt-0.5 truncate text-[8px] text-muted-foreground">{fact.detail}</div>
    </div>
  );
}

function fallbackSummary(project: ProjectRow): string {
  if (project.project_kind === "commercial_showcase") return "Commercial robot tracked from its official product source.";
  if (project.project_kind === "robotics_software") return "Source-linked robotics software project.";
  return "Source-linked physical robotics design.";
}

function projectKind(kind: ProjectRow["project_kind"]): string {
  if (kind === "physical_design") return "Physical design";
  if (kind === "robotics_software") return "Robotics software";
  if (kind === "commercial_showcase") return "Commercial showcase";
  return "Robotics project";
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/u, "")}k`;
  return value.toLocaleString();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
