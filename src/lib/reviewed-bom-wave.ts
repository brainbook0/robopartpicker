import { parseMarkdownBomObjects, parseXlsxObjects } from "./bom-format-parser";

export type ReviewedBomSourceFormat = "markdown" | "xlsx";
export type ReviewedBomTransform = "tny-components" | "tny-screws-total" | "tny-cables" | "tny-pcbs" | "nodequad-xlsx-explicit";

export type ReviewedBomSourceDefinition = {
  path: string;
  format: ReviewedBomSourceFormat;
  sha256: string;
  transform: ReviewedBomTransform;
  section?: { from_heading: string; until_before_heading: string };
  exclude_sections?: string[];
};

export type ReviewedBomProjectDefinition = {
  project_id: string;
  repo_url: string;
  revision: string;
  sources: ReviewedBomSourceDefinition[];
};

export type ReviewedBomWaveDefinition = {
  wave: string;
  schema_version: number;
  projects: ReviewedBomProjectDefinition[];
};

export type LegacyBomItem = {
  ref: string;
  name: string;
  quantity: number;
  category?: string;
  fabricated?: boolean;
  mpn?: string;
  source_url?: string;
  metadata: Record<string, string | number | boolean | undefined>;
};

export type ReviewedBomItem = LegacyBomItem & {
  provenance: {
    project_id: string;
    repo_url: string;
    revision: string;
    source_path: string;
    source_sha256: string;
    transform: ReviewedBomTransform;
    row_index: number;
  };
};

const SHA256_RE = /^[a-f0-9]{64}$/u;
const GIT_REV_RE = /^[a-f0-9]{40}$/u;

export function validateReviewedBomWaveDefinition(wave: ReviewedBomWaveDefinition): string[] {
  const errors: string[] = [];
  if (!wave.wave) errors.push("wave is required");
  if (wave.schema_version !== 1) errors.push("schema_version must be 1");
  for (const project of wave.projects ?? []) {
    if (!project.project_id) errors.push("project_id is required");
    if (!GIT_REV_RE.test(project.revision)) errors.push(`${project.project_id}: revision must be a 40-character lowercase git hash`);
    for (const source of project.sources ?? []) {
      if (!SHA256_RE.test(source.sha256)) errors.push(`${project.project_id}/${source.path}: sha256 must be a 64-character lowercase hex digest`);
      if ((source.format === "markdown") !== source.path.endsWith(".md")) errors.push(`${project.project_id}/${source.path}: markdown sources must use .md paths`);
      if ((source.format === "xlsx") !== source.path.endsWith(".xlsx")) errors.push(`${project.project_id}/${source.path}: xlsx sources must use .xlsx paths`);
    }
  }
  return errors;
}

export function transformReviewedBomSource(project: ReviewedBomProjectDefinition, source: ReviewedBomSourceDefinition, content: string | Uint8Array): ReviewedBomItem[] {
  const rows = source.format === "xlsx"
    ? parseXlsxObjects(content instanceof Uint8Array ? content : new TextEncoder().encode(content))
    : parseMarkdownBomObjects(markdownForSource(source, typeof content === "string" ? content : new TextDecoder().decode(content)));

  const filledRows = source.transform === "nodequad-xlsx-explicit" ? fillDownNames(rows) : rows;
  return filledRows.flatMap((row, index) => rowToItem(project, source, row, index));
}

function markdownForSource(source: ReviewedBomSourceDefinition, markdown: string): string {
  if (source.transform === "tny-screws-total") return sliceHeadingRange(markdown, "### Total", "### Complete kit");
  if (source.transform === "tny-cables") return removeHeadingSections(markdown, new Set(["### Complete kit"]));
  return markdown;
}

function sliceHeadingRange(markdown: string, startHeading: string, endHeading: string): string {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim() === startHeading);
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && line.trim() === endHeading);
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

function removeHeadingSections(markdown: string, headings: Set<string>): string {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const kept: string[] = [];
  let skippingLevel = 0;
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+.+$/u);
    if (heading) {
      const level = heading[1].length;
      if (headings.has(line.trim())) { skippingLevel = level; continue; }
      if (skippingLevel && level <= skippingLevel) skippingLevel = 0;
    }
    if (!skippingLevel) kept.push(line);
  }
  return kept.join("\n");
}

function fillDownNames(rows: Record<string, string>[]): Record<string, string>[] {
  let lastName = "";
  return rows.map((row) => {
    const name = pick(row, ["名称", "name", "part", "component", "description"]);
    if (name) lastName = name;
    return name ? row : { ...row, 名称: lastName };
  });
}

function rowToItem(project: ReviewedBomProjectDefinition, source: ReviewedBomSourceDefinition, row: Record<string, string>, rowIndex: number): ReviewedBomItem[] {
  const quantityText = pick(row, ["quantity", "qty", "count", "数量", "用量", "qtyperassembly", "qtyfor1platform"]);
  if (source.transform === "nodequad-xlsx-explicit" && !quantityText.trim()) return [];
  const quantity = parseQuantity(quantityText);
  if (!Number.isFinite(quantity) || quantity <= 0) return [];

  const name = pick(row, ["名称", "name", "part", "component", "description", "item", "type", "pcb", "规格", "型号"]);
  if (!name) return [];
  const mpn = pick(row, ["mpn", "manufacturerpart", "manufacturerpartnumber", "lcscpart", "型号", "规格"]);
  const sourceUrl = pick(row, ["link", "链接", "files", "source"]);

  return [{
    ref: `${project.project_id}:${source.path}:${source.transform}:${String(rowIndex + 1).padStart(4, "0")}`,
    name,
    quantity,
    category: categoryFor(source, row),
    fabricated: fabricatedFor(source),
    mpn: mpn || undefined,
    source_url: /^https?:\/\//u.test(sourceUrl) ? sourceUrl : undefined,
    metadata: { ...row, source_label: name, transform: source.transform },
    provenance: {
      project_id: project.project_id,
      repo_url: project.repo_url,
      revision: project.revision,
      source_path: source.path,
      source_sha256: source.sha256,
      transform: source.transform,
      row_index: rowIndex + 1,
    },
  }];
}

function pick(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseQuantity(value: string): number {
  const match = value.trim().match(/^\d+(?:\.\d+)?/u);
  return match ? Number(match[0]) : Number.NaN;
}

function categoryFor(source: ReviewedBomSourceDefinition, row: Record<string, string>): string | undefined {
  if (source.transform.includes("screws")) return "fastener";
  if (source.transform.includes("cables")) return "cable";
  if (source.transform.includes("pcbs") || pick(row, ["pcb"])) return "pcb";
  return undefined;
}

function fabricatedFor(source: ReviewedBomSourceDefinition): boolean | undefined {
  if (source.transform.includes("pcbs")) return true;
  return undefined;
}
