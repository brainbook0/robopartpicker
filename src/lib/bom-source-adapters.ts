import { parse as parseYaml } from "yaml";
import {
  normalizeBomHeader,
  parseCsvObjects,
  parseMarkdownBomObjects,
  parseXlsxObjects,
} from "./bom-format-parser";
import type { SourceObjectOutcome } from "@/shared/bomPublication";

export type ExplicitBomArtifact = {
  path: string;
  text?: string;
  bytes?: Uint8Array;
};

export type ExplicitBomCandidate = {
  sourceObjectId: string;
  sourceLocator: string;
  name: string;
  quantity: number;
  quantityBasis: "explicit-field" | "source-instance";
  unit: string;
  manufacturer?: string;
  mpn?: string;
  optional: boolean;
  rawFields: Record<string, unknown>;
};

export type ExplicitBomParseResult = {
  adapterId: string;
  publishCapable: boolean;
  sourceObjectIds: string[];
  outcomes: SourceObjectOutcome[];
  candidates: ExplicitBomCandidate[];
};

const NAME_KEYS = ["name", "part", "partname", "component", "componentname", "description", "item", "value", "comment", "type", "pcb", "名称", "规格"];
const QUANTITY_KEYS = ["quantity", "qty", "amount", "count", "qtyperassembly", "qtyperboard", "qtyfor1platform", "数量", "用量"];
const MANUFACTURER_KEYS = ["manufacturer", "maker", "mfr", "制造商", "厂商", "品牌"];
const MPN_KEYS = ["manufacturerpartnumber", "manufacturerpart", "mpn", "partnumber", "supplierpart", "sku", "制造商料号", "制造商型号", "型号", "料号", "物料编号", "物料编码"];

export function parseExplicitBomArtifact(artifact: ExplicitBomArtifact): ExplicitBomParseResult {
  const path = artifact.path.trim();
  const lower = path.toLocaleLowerCase("en-US");
  const text = artifact.text ?? (artifact.bytes ? new TextDecoder().decode(artifact.bytes) : "");
  const selected = selectAdapter(lower, text);
  if (!selected) return unsupported(path);

  let rows: Record<string, unknown>[];
  try {
    rows = selected.parse(text, artifact.bytes);
  } catch (error) {
    return {
      adapterId: selected.id,
      publishCapable: true,
      sourceObjectIds: [path],
      outcomes: [{ sourceObjectId: path, outcome: "unsupported", reason: error instanceof Error ? error.message : "parse_failed" }],
      candidates: [],
    };
  }

  const sourceObjectIds: string[] = [];
  const outcomes: SourceObjectOutcome[] = [];
  const candidates: ExplicitBomCandidate[] = [];
  for (const [index, rawFields] of rows.entries()) {
    const sourceObjectId = `${path}#row${index + 2}`;
    sourceObjectIds.push(sourceObjectId);
    const normalized = Object.fromEntries(Object.entries(rawFields).map(([key, value]) => [normalizeBomHeader(key), value]));
    const name = firstText(normalized, NAME_KEYS);
    if (!name) {
      outcomes.push({ sourceObjectId, outcome: "rejected", reason: "name_missing" });
      continue;
    }
    const rawQuantity = firstValue(normalized, QUANTITY_KEYS)
      ?? firstValue(normalized, Object.keys(normalized).filter((key) => /^qty|^quantity/iu.test(key)));
    const sourceInstance = normalized.quantitybasis === "source-instance";
    if ((rawQuantity == null || String(rawQuantity).trim() === "") && !sourceInstance) {
      outcomes.push({ sourceObjectId, outcome: "rejected", reason: "quantity_missing" });
      continue;
    }
    const quantity = sourceInstance ? 1 : Number(rawQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
      outcomes.push({ sourceObjectId, outcome: "rejected", reason: "quantity_invalid" });
      continue;
    }
    const optional = /^(true|yes|optional|1)$/iu.test(String(firstValue(normalized, ["optional"]) ?? ""));
    const candidate: ExplicitBomCandidate = {
      sourceObjectId,
      sourceLocator: sourceObjectId,
      name,
      quantity,
      quantityBasis: sourceInstance ? "source-instance" : "explicit-field",
      unit: firstText(normalized, ["unit", "uom", "单位"]) || "each",
      manufacturer: clean(firstText(normalized, MANUFACTURER_KEYS)),
      mpn: clean(firstText(normalized, MPN_KEYS)),
      optional,
      rawFields,
    };
    candidates.push(candidate);
    outcomes.push({ sourceObjectId, outcome: optional ? "published_optional" : "published_purchased" });
  }

  return { adapterId: selected.id, publishCapable: true, sourceObjectIds, outcomes, candidates };
}

type Adapter = {
  id: string;
  parse: (text: string, bytes?: Uint8Array) => Record<string, unknown>[];
};

function selectAdapter(path: string, text: string): Adapter | null {
  if (/\.(?:urdf|xacro|sdf|mjcf|stl|step|stp|obj|3mf|fcstd|gltf|glb)$/u.test(path)) return null;
  if (/\.csv$/u.test(path)) return { id: "bom-csv-v2", parse: (value) => parseCsvObjects(value) };
  if (/\.tsv$/u.test(path)) return { id: "bom-tsv-v2", parse: (value) => parseCsvObjects(value, "\t") };
  if (/\.xlsx$/u.test(path)) return { id: "bom-xlsx-v2", parse: (_value, bytes) => {
    if (!bytes) throw new Error("binary_xlsx_missing");
    return parseXlsxObjects(bytes);
  } };
  if (/\.(?:md|markdown)$/u.test(path)) return { id: "bom-markdown-v2", parse: (value) => parseMarkdownBomObjects(value) };
  if (/\.html?$/u.test(path)) return { id: "bom-html-v2", parse: parseHtmlBomObjects };
  if (/\.xml$/u.test(path) && /<export\b[\s\S]*<components\b/iu.test(text)) return { id: "bom-kicad-xml-v2", parse: parseXmlBomObjects };
  if (/\.xml$/u.test(path)) return { id: "bom-xml-v2", parse: parseXmlBomObjects };
  if (/\.json$/u.test(path)) return { id: "bom-json-v2", parse: (value) => structuredRows(JSON.parse(value)) };
  if (/\.ya?ml$/u.test(path)) return { id: "bom-yaml-v2", parse: (value) => structuredRows(parseYaml(value)) };
  return null;
}

function parseHtmlBomObjects(html: string): Record<string, unknown>[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)].map((row) =>
    [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/giu)].map((cell) => htmlText(cell[1])));
  if (rows.length < 2) return [];
  const markdown = rows.map((row, index) => `| ${row.join(" | ")} |${index === 0 ? `\n| ${row.map(() => "---").join(" | ")} |` : ""}`).join("\n");
  return parseMarkdownBomObjects(markdown);
}

function parseXmlBomObjects(xml: string): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  for (const match of xml.matchAll(/<(item|part|component|comp)\b([^>]*)>([\s\S]*?)<\/\1>/giu)) {
    const tag = match[1].toLocaleLowerCase("en-US");
    const attrs = match[2];
    const body = match[3];
    const field = (names: string[]) => {
      for (const name of names) {
        const fromAttribute = attrs.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "iu"))?.[1];
        if (fromAttribute) return htmlText(fromAttribute);
        const fromElement = body.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "iu"))?.[1];
        if (fromElement) return htmlText(fromElement);
        const fromField = body.match(new RegExp(`<field\\b[^>]*name=["']${name}["'][^>]*>([\\s\\S]*?)</field>`, "iu"))?.[1];
        if (fromField) return htmlText(fromField);
      }
      return "";
    };
    output.push({
      name: field(["name", "value", "description", "part"]),
      quantity: tag === "comp" ? "1" : field(["quantity", "qty", "count"]),
      quantitybasis: tag === "comp" ? "source-instance" : "explicit-field",
      manufacturer: field(["manufacturer", "mfr", "maker"]),
      manufacturerpartnumber: field(["manufacturerpartnumber", "mpn", "partnumber"]),
      reference: field(["ref", "reference", "designator"]),
      unit: field(["unit", "uom"]),
    });
  }
  return output;
}

function structuredRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(record);
  if (!record(value)) return [];
  for (const key of ["bom", "components", "items", "parts"]) {
    if (Array.isArray(value[key])) return value[key].filter(record);
  }
  return [];
}

function unsupported(path: string): ExplicitBomParseResult {
  return {
    adapterId: "not-explicit-bom-v1",
    publishCapable: false,
    sourceObjectIds: [path],
    outcomes: [{ sourceObjectId: path, outcome: "unsupported", reason: "not_an_explicit_bom" }],
    candidates: [],
  };
}

function firstValue(recordValue: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (recordValue[key] != null) return recordValue[key];
  return undefined;
}

function firstText(recordValue: Record<string, unknown>, keys: string[]): string {
  const value = firstValue(recordValue, keys);
  return value == null ? "" : String(value).trim();
}

function clean(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function htmlText(value: string): string {
  return value.replace(/<br\s*\/?\s*>/giu, " ").replace(/<[^>]+>/gu, " ")
    .replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'").replace(/&amp;/gu, "&").replace(/\s+/gu, " ").trim();
}
