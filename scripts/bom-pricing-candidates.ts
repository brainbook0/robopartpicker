export type BomPricingCandidateKind = "digikey-prefixed" | "manufacturer-mpn";

export type BomPricingCandidate = {
  originalMpn: string;
  queryMpn: string;
  kind: BomPricingCandidateKind;
  supplierPrefix?: string;
};

const INTERNAL_PART_PATTERNS = [
  /^ATOM-\d/u,
  /^MMP(?:\.|-)/u,
];

const STANDARD_PATTERNS = [
  /^(?:GB|JB)\/T\b/iu,
];

const hasAsciiLetter = (value: string): boolean => /[A-Za-z]/u.test(value);
const hasDigit = (value: string): boolean => /\d/u.test(value);

/**
 * Turn a BOM-supplied identifier into a conservative DigiKey search candidate.
 *
 * Three-digit prefixes are distributor/manufacturer codes found in the source
 * snapshot, not part of the manufacturer MPN. The suffix is only proposed as a
 * query. A fetched page must still prove the exact manufacturer MPN before any
 * catalog or BOM mutation is allowed.
 */
export function toDigiKeyCandidate(value: unknown): BomPricingCandidate | null {
  const originalMpn = String(value ?? "").normalize("NFKC").trim();
  if (!originalMpn || /^\d+$/u.test(originalMpn)) return null;
  if (STANDARD_PATTERNS.some((pattern) => pattern.test(originalMpn))) return null;
  if (INTERNAL_PART_PATTERNS.some((pattern) => pattern.test(originalMpn))) return null;
  if (/^C\d+$/iu.test(originalMpn)) return null; // LCSC catalog code, not an MPN.
  if (/[^\x20-\x7E]/u.test(originalMpn)) return null;

  const prefixed = originalMpn.match(/^(\d{3})-(\S+)$/u);
  if (prefixed) {
    const queryMpn = prefixed[2];
    if (queryMpn.length < 3 || !hasAsciiLetter(queryMpn)) return null;
    return { originalMpn, queryMpn, kind: "digikey-prefixed", supplierPrefix: prefixed[1] };
  }

  // Avoid free text, standards, dimensions, and generic connector descriptions.
  if (!/^[A-Za-z0-9][A-Za-z0-9.%+_()/.-]{3,}$/u.test(originalMpn)) return null;
  if (!hasAsciiLetter(originalMpn) || !hasDigit(originalMpn)) return null;
  return { originalMpn, queryMpn: originalMpn, kind: "manufacturer-mpn" };
}

export function uniqueDigiKeyCandidates(values: unknown[]): BomPricingCandidate[] {
  const byQuery = new Map<string, BomPricingCandidate>();
  for (const value of values) {
    const candidate = toDigiKeyCandidate(value);
    if (!candidate) continue;
    const key = candidate.queryMpn.toUpperCase();
    const existing = byQuery.get(key);
    if (!existing || (existing.kind === "manufacturer-mpn" && candidate.kind === "digikey-prefixed")) {
      byQuery.set(key, candidate);
    }
  }
  return [...byQuery.values()].sort((left, right) => left.queryMpn.localeCompare(right.queryMpn));
}
