import type { ProjectRow } from "@/lib/projects";

export type ProjectPreviewFact = {
  value: string;
  detail: string;
  tone: "positive" | "warning" | "muted" | "neutral";
};

export type ProjectPreviewFacts = {
  cost: ProjectPreviewFact;
  builds: ProjectPreviewFact;
  bom: ProjectPreviewFact;
  source: ProjectPreviewFact;
  freshness: string;
};

export function projectPreviewFacts(project: ProjectRow): ProjectPreviewFacts {
  return {
    cost: costFact(project),
    builds: buildFact(project),
    bom: bomFact(project),
    source: sourceFact(project),
    freshness: formatFreshness(project.last_checked_at ?? project.updated_at),
  };
}

function costFact(project: ProjectRow): ProjectPreviewFact {
  const previewMinor = project.preview_cost_minor
    ?? (project.project_kind === "commercial_showcase" || project.estimated_cost_usd == null
      ? null
      : Math.round(project.estimated_cost_usd * 100));
  const kind = project.preview_cost_kind
    ?? (project.project_kind === "commercial_showcase" || project.estimated_cost_usd == null ? null : "published");

  if (previewMinor == null || previewMinor <= 0 || !kind) {
    return project.project_kind === "commercial_showcase"
      ? fact("Price not published", "No active source-backed manufacturer price", "muted")
      : fact("Cost not calculated", "No source-backed complete-build cost", "muted");
  }

  const value = money(previewMinor, project.preview_cost_currency ?? "USD");
  if (kind === "published_price" && project.preview_cost_method === "official-product-price-v1") {
    return fact(value, "Official price", "positive");
  }
  if (kind === "published_price") return fact(value, "Published price", "positive");
  if (kind === "published_range") return fact(value, "Published range start", "positive");
  if (kind === "market_estimate") return fact(value, "Inferred market estimate", "warning");
  if (kind === "known_bom") return fact(value, "Known BOM cost", "neutral");
  if (kind === "inferred") return fact(value, "Low-confidence estimate", "warning");
  return fact(value, "Published estimate", "neutral");
}

function buildFact(project: ProjectRow): ProjectPreviewFact {
  if (project.project_kind === "commercial_showcase") {
    return fact("Not buildable", "Commercial showcase", "muted");
  }
  const started = Math.max(0, project.reproduction_count ?? 0);
  const verified = Math.max(0, project.successful_reproduction_count ?? 0);
  return fact(
    `${started.toLocaleString()} started · ${verified.toLocaleString()} verified`,
    verified > 0 ? "Independent outcomes recorded" : "No independent success recorded",
    verified > 0 ? "positive" : "neutral",
  );
}

function bomFact(project: ProjectRow): ProjectPreviewFact {
  const state = project.bom_publication_state ?? fallbackBomState(project);
  const lines = Math.max(0, project.bom_line_count ?? 0);
  if (state === "verified") return fact(lines > 0 ? `${lines.toLocaleString()} verified lines` : "Verified BOM", "Current public BOM", "positive");
  if (state === "partial") return fact(lines > 0 ? `${lines.toLocaleString()} partial lines` : "Partial BOM", "Coverage remains incomplete", "warning");
  if (state === "manufacturer_unavailable") return fact("Manufacturer BOM unavailable", "No public manufacturer BOM", "muted");
  if (state === "not_applicable") return fact("Not applicable", "Software-only project", "muted");
  if (state === "rejected") return fact("BOM rejected", "Source review did not pass", "warning");
  if (state === "classification_required") return fact("BOM review required", "Project classification is incomplete", "warning");
  return fact("Source BOM not published", "No current public BOM", "muted");
}

function sourceFact(project: ProjectRow): ProjectPreviewFact {
  const hasSource = Boolean(project.repo_url ?? project.docs_url ?? project.upstream_url);
  if (project.project_kind === "commercial_showcase" && hasSource) return fact("Official product source", "Manufacturer or official product page", "positive");
  if (project.license && hasSource) return fact("Licensed source", project.license, "positive");
  if (project.repo_url) return fact("License not published", "Repository source", "warning");
  if (hasSource) return fact("Published source", "External project source", "neutral");
  return fact("Source not published", "No public source URL", "muted");
}

function fallbackBomState(project: ProjectRow): NonNullable<ProjectRow["bom_publication_state"]> {
  if (project.project_kind === "commercial_showcase") return "manufacturer_unavailable";
  if (project.project_kind === "robotics_software") return "not_applicable";
  return project.bom_line_count > 0 ? "partial" : "unavailable";
}

function fact(value: string, detail: string, tone: ProjectPreviewFact["tone"]): ProjectPreviewFact {
  return { value, detail, tone };
}

function money(minor: number, currency: string): string {
  const hasCents = minor % 100 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(minor / 100);
}

function formatFreshness(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "Verification date unavailable";
  return `Verified ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(time))}`;
}
