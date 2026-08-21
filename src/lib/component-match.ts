// Deterministic, source-conservative component matching.
//
// Matches a normalized BOM line to a catalog component using only exact
// MPN / SKU / manufacturer evidence and high-confidence normalized aliases.
// It never matches on free-text component names, never applies edit-distance,
// prefix, or substring heuristics, and never returns a "probable" result: a
// line is either matched with a named evidence class or left unresolved.
//
// All functions in this module are pure and deterministic given the same
// inputs, so dry-run output, forward SQL, and rollback SQL are reproducible.

export type ComponentCandidate = {
  id: string;
  /** Catalog component display name. Never used as a match key. */
  name?: string;
  /** Catalog manufacturer part number (MPN). */
  manufacturerPartNumber?: string | null;
  /** Catalog component's manufacturer name. */
  manufacturerName?: string | null;
  /** Supplier SKUs associated with the component (from supplier offers). */
  supplierSkus?: string[];
};

export type BomLineIdentity = {
  /** Raw manufacturer name declared on the BOM line. */
  manufacturer?: string | null;
  /** Raw manufacturer part number declared on the BOM line. */
  mpn?: string | null;
  /** Raw supplier SKU declared on the BOM line, if the BOM tracks one. */
  sku?: string | null;
  /** Display name. Never used as a match key. */
  name?: string;
};

export type MatchKind = "manufacturer-mpn" | "mpn" | "sku";

export type ConfidenceClass = "exact" | "high";

export type MatchResult = {
  kind: MatchKind;
  confidenceClass: ConfidenceClass;
  /** Normalized confidence in [0, 1]. */
  confidence: number;
  component: ComponentCandidate;
  /** True when a normalized alias (case/separator/unicode folding) rather
   *  than a byte-identical key produced the match. */
  aliasApplied: boolean;
  /** Human-readable evidence string, e.g. `manufacturer+mpn "STMicroelectronics" "STM32F103C8T6"` -> cmp_...`. */
  evidence: string;
};

export type MatchDecision =
  | { matched: true; result: MatchResult }
  | { matched: false; reason: ResolveReason };

export type ResolveReason =
  | "no-identity"
  | "manufacturer-mismatch"
  | "ambiguous-mpn"
  | "ambiguous-manufacturer-mpn"
  | "ambiguous-sku"
  | "no-catalog-match";

/** Soft token key: NFKC + trim + case fold + unicode dash fold, but separators
 *  are preserved. Two values that compare equal here are "exact" evidence. */
export function softKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-");
}

/**
 * Canonical key for MPN/SKU identity tokens. Deduced from `softKey` by
 * stripping every non-alphanumeric separator. This is a high-confidence
 * normalized alias (formatting equivalence only), never a fuzzy or meaning-
 * preserving transform.
 */
export function canonicalKey(value: unknown): string {
  return softKey(value).replace(/[^a-z0-9]+/g, "");
}

/** Canonical key for manufacturer names: same identity normalization as
 *  `canonicalKey`. It never abbreviates ("stmicro" != "stmicroelectronics"). */
export function canonicalMakerKey(value: unknown): string {
  return canonicalKey(value);
}

/** True when a match required more than case, whitespace, or unicode-dash
 * normalization relative to the identity actually stored in the catalog. */
function aliasAppliedFor(raw: unknown, stored: unknown): boolean {
  return softKey(raw) !== softKey(stored);
}

export type ComponentIndex = {
  byManufacturerMpn: Map<string, ComponentCandidate | null>;
  byMpn: Map<string, ComponentCandidate | null>;
  bySku: Map<string, ComponentCandidate | null>;
};

function indexUnique(map: Map<string, ComponentCandidate | null>, key: string, component: ComponentCandidate): void {
  const existing = map.get(key);
  if (existing === undefined) map.set(key, component);
  else map.set(key, null); // duplicate key -> ambiguous, never match
}

/**
 * Build a lookup index over catalog components. Keys that collide across
 * multiple components are poisoned to `null` so the matcher can never return
 * an ambiguous identity.
 */
export function buildComponentIndex(components: ComponentCandidate[]): ComponentIndex {
  const index: ComponentIndex = {
    byManufacturerMpn: new Map(),
    byMpn: new Map(),
    bySku: new Map(),
  };
  for (const component of components) {
    const mpnKey = canonicalKey(component.manufacturerPartNumber);
    if (mpnKey) {
      indexUnique(index.byMpn, mpnKey, component);
      if (component.manufacturerName) {
        const key = `${canonicalMakerKey(component.manufacturerName)}\0${mpnKey}`;
        indexUnique(index.byManufacturerMpn, key, component);
      }
    }
    for (const sku of component.supplierSkus ?? []) {
      const skuKey = canonicalKey(sku);
      if (skuKey) indexUnique(index.bySku, skuKey, component);
    }
  }
  return index;
}

/** Deterministic component match for a single BOM line. */
export function matchComponent(line: BomLineIdentity, index: ComponentIndex): MatchDecision {
  const rawMpn = String(line.mpn ?? "").trim();
  const rawMaker = String(line.manufacturer ?? "").trim();
  const rawSku = String(line.sku ?? "").trim();

  const mpnKey = canonicalKey(line.mpn);
  const makerKey = canonicalMakerKey(line.manufacturer);
  const skuKey = canonicalKey(line.sku);

  // 1. Manufacturer + MPN is the strongest identity. When a manufacturer is
  //    declared it is treated as binding: no fallback to a bare-MPN match that
  //    could silently cross manufacturers.
  if (mpnKey && makerKey) {
    const key = `${makerKey}\0${mpnKey}`;
    const component = index.byManufacturerMpn.get(key);
    if (component === undefined) return { matched: false, reason: "no-catalog-match" };
    if (component === null) return { matched: false, reason: "ambiguous-manufacturer-mpn" };
    const aliasApplied = aliasAppliedFor(
      `${rawMaker}\0${rawMpn}`,
      `${component.manufacturerName ?? ""}\0${component.manufacturerPartNumber ?? ""}`,
    );
    return {
      matched: true,
      result: {
        kind: "manufacturer-mpn",
        confidenceClass: aliasApplied ? "high" : "exact",
        confidence: aliasApplied ? 0.98 : 1,
        component,
        aliasApplied,
        evidence: describeManufacturerMpn(rawMaker, rawMpn, component),
      },
    };
  }

  // 2. Bare MPN. Unique exact normalized MPN only; duplicates remain unresolved.
  if (mpnKey) {
    const component = index.byMpn.get(mpnKey);
    if (component === undefined) return { matched: false, reason: "no-catalog-match" };
    if (component === null) return { matched: false, reason: "ambiguous-mpn" };
    const aliasApplied = aliasAppliedFor(rawMpn, component.manufacturerPartNumber);
    return {
      matched: true,
      result: {
        kind: "mpn",
        confidenceClass: "high",
        confidence: 0.9,
        component,
        aliasApplied,
        evidence: describeMpn(rawMpn, component),
      },
    };
  }

  // 3. Supplier SKU. Unique exact normalized SKU only.
  if (skuKey) {
    const component = index.bySku.get(skuKey);
    if (component === undefined) return { matched: false, reason: "no-catalog-match" };
    if (component === null) return { matched: false, reason: "ambiguous-sku" };
    const storedSku = component.supplierSkus?.find((value) => canonicalKey(value) === skuKey) ?? rawSku;
    const aliasApplied = aliasAppliedFor(rawSku, storedSku);
    return {
      matched: true,
      result: {
        kind: "sku",
        confidenceClass: "high",
        confidence: 0.9,
        component,
        aliasApplied,
        evidence: describeSku(rawSku, component),
      },
    };
  }

  // No procurement identity at all.
  return { matched: false, reason: "no-identity" };
}

function describeManufacturerMpn(maker: string, mpn: string, component: ComponentCandidate): string {
  return `manufacturer+mpn "${maker}" "${mpn}" -> component ${component.id}`;
}
function describeMpn(mpn: string, component: ComponentCandidate): string {
  return `mpn "${mpn}" -> component ${component.id}`;
}
function describeSku(sku: string, component: ComponentCandidate): string {
  return `sku "${sku}" -> component ${component.id}`;
}

/** Completeness bucket assigned to a matched BOM line at the materialized
 *  `bom_items` layer. Matches the repo convention used by the pricing and
 *  repair pipelines (`complete` denotes a resolved catalog link). */
export const MATCHED_COMPLETENESS = "complete" as const;

/** Completeness bucket assigned to a procurement line that could not be
 *  matched. Explicitly replaces the silent `probable` default so unresolved
 *  lines are never presented as a probable identity. */
export const UNRESOLVED_COMPLETENESS = "unresolved" as const;

export const UNRESOLVED_CONFIDENCE = 0.4;

export type LineResolution =
  | { resolved: true; componentId: string; completeness: typeof MATCHED_COMPLETENESS; confidence: number; evidence: string; kind: MatchKind; confidenceClass: ConfidenceClass; aliasApplied: boolean }
  | { resolved: false; componentId: null; completeness: typeof UNRESOLVED_COMPLETENESS; confidence: number; reason: ResolveReason };

/**
 * Resolve one normalized procurement BOM line to a materialized state. This
 * function only decides `complete` (matched) vs `unresolved`; fabricated and
 * non-procurement lines must be filtered out by the caller and left in their
 * own completeness bucket (`custom-fabricated`, `non-procurement`, ...).
 */
export function resolveLine(line: BomLineIdentity, index: ComponentIndex): LineResolution {
  const decision = matchComponent(line, index);
  if (decision.matched === true) {
    return {
      resolved: true,
      componentId: decision.result.component.id,
      completeness: MATCHED_COMPLETENESS,
      confidence: decision.result.confidence,
      evidence: decision.result.evidence,
      kind: decision.result.kind,
      confidenceClass: decision.result.confidenceClass,
      aliasApplied: decision.result.aliasApplied,
    };
  }
  const unresolved = decision as Extract<MatchDecision, { matched: false }>;
  return {
    resolved: false,
    componentId: null,
    completeness: UNRESOLVED_COMPLETENESS,
    confidence: UNRESOLVED_CONFIDENCE,
    reason: unresolved.reason,
  };
}
