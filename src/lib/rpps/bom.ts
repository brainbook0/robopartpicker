// Pure BOM line compilation: per-line evidence locator, extraction method,
// confidence, and completeness bucket. Shared by the Worker extractor and the
// golden-fixture tests so the compiled BOM is honest and deterministic.

import type { PortableComponent } from "./portable";

export const COMPLETENESS_BUCKETS = [
  "verified",
  "probable",
  "unresolved",
  "missing-qty",
  "custom-fabricated",
  "non-procurement",
  "possible-omission",
] as const;
export type CompletenessBucket = (typeof COMPLETENESS_BUCKETS)[number];

export const EXTRACTION_METHODS = [
  "explicit-bom",
  "rpps-manifest",
  "urdf-model",
  "assembly-instructions",
  "configuration",
  "firmware",
  "dependencies",
  "page-text",
  "cad-metadata",
  "inferred",
] as const;
export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number];

export const isCompletenessBucket = (value: unknown): value is CompletenessBucket =>
  typeof value === "string" && (COMPLETENESS_BUCKETS as readonly string[]).includes(value);

export const isExtractionMethod = (value: unknown): value is ExtractionMethod =>
  typeof value === "string" && (EXTRACTION_METHODS as readonly string[]).includes(value);

export type BomLineInput = {
  name: string;
  quantity?: unknown;
  unit?: string;
  manufacturer?: string;
  mpn?: string;
  revision?: string;
  fabricated?: boolean;
  optional?: boolean;
  sourcePath: string;
  rowIndex?: number;
  extractionMethod?: ExtractionMethod;
};

export type BomLine = Omit<PortableComponent, "id" | "artifactRefs">;

/** Resolve a possibly-missing quantity. Missing/invalid quantities are never
 *  dropped: the line is kept and flagged `missing-qty`. */
export function resolveQuantity(value: unknown): { quantity: number; missing: boolean } {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1_000_000) {
    return { quantity: parsed, missing: false };
  }
  return { quantity: 1, missing: true };
}

/** The completeness bucket for a line given its resolved fields and method.
 *  Unresolved lines are retained, never dropped. */
export function classifyCompleteness(
  line: { fabricated: boolean; missingQty: boolean; manufacturer?: string; mpn?: string },
  method: ExtractionMethod,
): CompletenessBucket {
  if (line.fabricated) return "custom-fabricated";
  if (method === "dependencies" || method === "firmware" || method === "configuration") return "non-procurement";
  if (line.missingQty) return "missing-qty";
  if (line.manufacturer && line.mpn) return "verified";
  if (line.manufacturer || line.mpn) return "probable";
  return "unresolved";
}

export function confidenceFor(completeness: CompletenessBucket): number {
  switch (completeness) {
    case "verified": return 0.95;
    case "custom-fabricated": return 0.85;
    case "probable": return 0.7;
    case "non-procurement": return 0.6;
    case "missing-qty": return 0.5;
    case "unresolved": return 0.4;
    case "possible-omission": return 0.3;
  }
}

export function evidenceLocatorFor(sourcePath: string, rowIndex?: number): string {
  return rowIndex == null ? sourcePath : `${sourcePath}#row${rowIndex + 1}`;
}

/** Compile one BOM line with a full completeness assessment. */
export function buildBomLine(input: BomLineInput): BomLine {
  const { quantity, missing } = resolveQuantity(input.quantity);
  const fabricated = input.fabricated === true;
  const method: ExtractionMethod = isExtractionMethod(input.extractionMethod) ? input.extractionMethod : "explicit-bom";
  const completeness = classifyCompleteness(
    { fabricated, missingQty: missing, manufacturer: input.manufacturer, mpn: input.mpn },
    method,
  );
  return {
    name: input.name.slice(0, 500),
    quantity,
    unit: (input.unit ?? "each").slice(0, 40) || "each",
    manufacturer: input.manufacturer?.slice(0, 160),
    mpn: input.mpn?.slice(0, 160),
    revision: input.revision?.slice(0, 160),
    fabricated,
    optional: input.optional === true,
    extractionMethod: method,
    completeness,
    evidenceLocator: evidenceLocatorFor(input.sourcePath, input.rowIndex),
    confidence: confidenceFor(completeness),
  };
}

/** Ensure an already-parsed component carries the completeness fields,
 *  computing them from its identity when they are absent. Idempotent. */
export function withCompleteness(component: PortableComponent, sourcePath?: string): PortableComponent {
  const method: ExtractionMethod = isExtractionMethod(component.extractionMethod) ? component.extractionMethod : "rpps-manifest";
  const { quantity, missing } = resolveQuantity(component.quantity);
  const completeness: CompletenessBucket = isCompletenessBucket(component.completeness)
    ? component.completeness
    : classifyCompleteness({ fabricated: component.fabricated, missingQty: missing, manufacturer: component.manufacturer, mpn: component.mpn }, method);
  return {
    ...component,
    quantity,
    extractionMethod: method,
    completeness,
    confidence: component.confidence ?? confidenceFor(completeness),
    evidenceLocator: component.evidenceLocator ?? (sourcePath ? evidenceLocatorFor(sourcePath) : undefined),
  };
}
