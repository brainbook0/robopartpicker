import { parseMarkdownBomObjects, parseXlsxObjects } from "./bom-format-parser";

export type ReviewedBomSourceFormat = "markdown" | "xlsx";
export type ReviewedBomTransform = "tny-components" | "tny-screws-total" | "tny-cables" | "tny-pcbs" | "nodequad-xlsx-explicit" | "aloha-mobile-base" | "aloha-follower-arms" | "aloha-leader-arms" | "aloha-fasteners-consumables" | "so101-two-arm";

export type ReviewedBomSourceDefinition = {
  path: string;
  format: ReviewedBomSourceFormat;
  sha256: string;
  transform: ReviewedBomTransform;
  expected_items?: number;
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
      if (source.expected_items != null && (!Number.isInteger(source.expected_items) || source.expected_items <= 0)) errors.push(`${project.project_id}/${source.path}: expected_items must be a positive integer`);
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
  if (source.section) return sliceHeadingRange(markdown, source.section.from_heading, source.section.until_before_heading);
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
  const quantityText = pick(row, ["quantity", "qty", "amount", "count", "数量", "用量", "qtyperassembly", "qtyfor1platform"]);
  if (source.transform === "nodequad-xlsx-explicit" && !quantityText.trim()) return [];
  const quantity = parseQuantity(quantityText);
  if (!Number.isFinite(quantity) || quantity <= 0) return [];

  const name = itemNameFor(source, row);
  if (!name) return [];
  const mpn = itemMpnFor(source, row);
  const sourceUrl = pick(row, ["buyusurl", "buycnurl", "link", "链接", "files", "source"]);

  return [{
    ref: `${project.project_id}-${source.transform}-${String(rowIndex + 1).padStart(4, "0")}`,
    name,
    quantity,
    category: categoryFor(source, row),
    fabricated: fabricatedFor(source, row),
    mpn: mpn || undefined,
    source_url: /^https?:\/\//u.test(sourceUrl) ? sourceUrl : undefined,
    metadata: { ...row, source_label: pick(row, ["名称", "name", "part", "component", "description", "item", "type", "pcb", "规格", "型号"]), transform: source.transform },
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

function itemNameFor(source: ReviewedBomSourceDefinition, row: Record<string, string>): string {
  if (source.transform === "tny-components") {
    return joinDistinct(pick(row, ["type"]), pick(row, ["description"]));
  }
  if (source.transform === "tny-screws-total") {
    return joinDistinct(pick(row, ["type", "name", "part"]), pick(row, ["length"]));
  }
  if (source.transform === "tny-cables") {
    return joinDistinct(pick(row, ["type"]), pick(row, ["pins"]), pick(row, ["length"]));
  }
  if (source.transform === "tny-pcbs") return pick(row, ["pcb", "name"]);
  if (source.transform === "nodequad-xlsx-explicit") {
    return joinDistinct(pick(row, ["名称"]), pick(row, ["规格", "型号"]));
  }
  if (source.transform.startsWith("aloha-")) {
    return joinDistinct(alohaSectionLabel(source), pick(row, ["item", "part", "component", "name", "description", "type"]), pick(row, ["model", "mpn", "spec", "specification"]));
  }
  if (source.transform === "so101-two-arm") return cleanMarkdownPartName(pick(row, ["part", "item", "name", "component", "description"]));
  return pick(row, ["名称", "name", "part", "component", "description", "item", "type", "pcb", "规格", "型号"]);
}

function cleanMarkdownPartName(value: string): string {
  return value
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/giu, "")
    .replace(/<[^>]*>/gu, "")
    .replace(/\[\^[^\]]+\]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function alohaSectionLabel(source: ReviewedBomSourceDefinition): string {
  const heading = source.section?.from_heading.replace(/^#+\s*/u, "").trim();
  return heading || source.transform.replace(/^aloha-/u, "Aloha ").replace(/-/gu, " ");
}

function joinDistinct(...parts: string[]): string {
  const kept: string[] = [];
  for (const part of parts.map((value) => value.trim()).filter(Boolean)) {
    if (!kept.some((value) => value.localeCompare(part, undefined, { sensitivity: "accent" }) === 0)) kept.push(part);
  }
  return kept.join(" — ");
}

const SOURCE_BACKED_MODEL_TOKENS = [
  "NodeMCU-32S", "PCA9685", "MPU6050", "AMS1117", "1N4004", "XT60-F", "KCD1-101", "TD-8120MG", "MINI360",
  "VL53L0X", "SH1106", "TTP223", "OV2640", "SG90", "MG996R",
  "ST-3215-C018", "ST-3095-C002", "H65V1", "Raspberry Pi 5", "Waveshare Bus Servo Adapter A",
  "C001", "C044", "C046",
];

function itemMpnFor(source: ReviewedBomSourceDefinition, row: Record<string, string>): string | undefined {
  const explicit = pick(row, ["mpn", "model", "manufacturerpart", "manufacturerpartnumber", "lcscpart", "型号"]);
  if (explicit) return explicit;
  const candidate = [pick(row, ["名称", "type", "item", "part", "component", "name"]), pick(row, ["规格", "description", "spec", "specification"]), pick(row, ["buyusurl", "buycnurl"])].filter(Boolean).join(" ");
  const token = SOURCE_BACKED_MODEL_TOKENS.find((value) => candidate.toLowerCase().includes(value.toLowerCase()));
  return token;
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
  if (source.transform === "so101-two-arm") {
    const label = `${itemNameFor(source, row)} ${pick(row, ["category", "notes", "description"])}`;
    if (/servo/iu.test(label)) return "actuator";
    if (/clamp|screwdriver|tool/iu.test(label)) return "tool";
    if (/motor\s*control\s*board|controller|driver|board/iu.test(label)) return "electronics";
    if (/cable|wire/iu.test(label)) return "cable";
    if (/power\s*supply|charger|battery|psu/iu.test(label)) return "power";
  }
  if (source.transform.includes("screws")) return "fastener";
  if (source.transform.includes("cables")) return "cable";
  if (source.transform.includes("pcbs") || pick(row, ["pcb"])) return "pcb";
  if (source.transform === "nodequad-xlsx-explicit") {
    const label = `${pick(row, ["名称"])} ${pick(row, ["规格"])}`;
    if (/螺钉|螺丝|螺母/u.test(label)) return "fastener";
    if (/舵机/u.test(label)) return "actuator";
    if (/主控|驱动|陀螺|模块|电阻|二极管|LED|接线|开关|排针|排母/iu.test(label)) return "electronics";
  }
  if (source.transform.startsWith("aloha-")) {
    const label = `${itemNameFor(source, row)} ${pick(row, ["category", "section", "description", "notes"])}`;
    if (/3d\s*print|printed|fabricated|printable/iu.test(label)) return "fabricated";
    if (/servo|actuator|motor/iu.test(label)) return "actuator";
    if (/screw|nut|bolt|washer|fastener|threadlocker|loctite/iu.test(label)) return "fastener";
    if (/camera|raspberry\s*pi|adapter|board|electronics|sensor|waveshare/iu.test(label)) return "electronics";
    if (/cable|wire|connector/iu.test(label)) return "cable";
    if (/bearing|shaft|extrusion|bracket|plate|mechanical/iu.test(label)) return "mechanical";
    if (/battery|power|supply|charger|buck|dc-dc/iu.test(label)) return "power";
  }
  return undefined;
}

function fabricatedFor(source: ReviewedBomSourceDefinition, row?: Record<string, string>): boolean | undefined {
  if (source.transform.includes("pcbs")) return true;
  if (source.transform.startsWith("aloha-") && row) {
    const label = `${itemNameFor(source, row)} ${pick(row, ["category", "description", "notes"])}`;
    if (/3d\s*print|printed|fabricated|printable/iu.test(label)) return true;
  }
  return undefined;
}
