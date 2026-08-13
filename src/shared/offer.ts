// Shared sourcing/offer schema consumed by the catalog, comparison UI and the
// sourcing optimizer. Everything here is pure and side-effect free so it can be
// unit-tested in the browser test project and reused verbatim in the Worker.

export type OfferCondition = "new" | "refurb" | "used" | "surplus" | "unknown";
export type OfferRiskLabel = "exact" | "substitute" | "used" | "surplus" | "unknown";
export type OfferFreshnessLabel = "fresh" | "recent" | "stale" | "unknown";
export type OfferAvailability =
  | "in_stock"
  | "limited"
  | "backorder"
  | "preorder"
  | "out_of_stock"
  | "unknown";

export const OFFER_CONDITIONS: readonly OfferCondition[] = ["new", "refurb", "used", "surplus", "unknown"];
export const OFFER_RISK_LABELS: readonly OfferRiskLabel[] = ["exact", "substitute", "used", "surplus", "unknown"];
export const OFFER_FRESHNESS_LABELS: readonly OfferFreshnessLabel[] = ["fresh", "recent", "stale", "unknown"];
export const OFFER_AVAILABILITIES: readonly OfferAvailability[] = [
  "in_stock",
  "limited",
  "backorder",
  "preorder",
  "out_of_stock",
  "unknown",
];

/** A quantity/price tier. `unitPriceMinor` is the price in the currency's minor unit. */
export type PriceBreak = { quantity: number; unitPriceMinor: number };

/** Canonical offer shape the optimizer and comparison consume. */
export type SourcingOffer = {
  id: string;
  supplierId: string;
  supplierName?: string | null;
  componentId: string;
  region?: string | null;
  currency: string;
  unitPriceMinor: number;
  minimumQuantity: number;
  stockQuantity: number | null;
  leadTimeDays: number | null;
  availability: OfferAvailability;
  condition: OfferCondition;
  priceBreaks: PriceBreak[];
  reliabilityScore: number | null;
  riskLabel: OfferRiskLabel;
  freshnessLabel: OfferFreshnessLabel;
  observedAt: string;
  isDemo: boolean;
};

/** Input accepted by the repository upsert path (both insert and update). */
export type OfferWriteInput = {
  offerId?: string | null;
  supplierId: string;
  componentId: string;
  supplierSku?: string | null;
  productUrl?: string | null;
  regionCode?: string | null;
  currency: string;
  unitPriceMinor: number;
  minimumQuantity: number;
  stockQuantity?: number | null;
  leadTimeDays?: number | null;
  availability?: OfferAvailability;
  condition?: OfferCondition;
  priceBreaks?: PriceBreak[];
  reliabilityScore?: number | null;
  riskLabel?: OfferRiskLabel;
  freshnessLabel?: OfferFreshnessLabel;
  observedAt: string;
  expiresAt?: string | null;
  sourceImportRecordId?: string | null;
};

export class OfferValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfferValidationError";
  }
}

function isIn<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export const normalizeCondition = (value: unknown): OfferCondition =>
  isIn(value, OFFER_CONDITIONS) ? value : "unknown";

export const normalizeRiskLabel = (value: unknown): OfferRiskLabel =>
  isIn(value, OFFER_RISK_LABELS) ? value : "unknown";

export const normalizeFreshnessLabel = (value: unknown): OfferFreshnessLabel =>
  isIn(value, OFFER_FRESHNESS_LABELS) ? value : "unknown";

export const normalizeAvailability = (value: unknown): OfferAvailability =>
  isIn(value, OFFER_AVAILABILITIES) ? value : "unknown";

/** Price must be a finite, non-negative number. NaN, Infinity, negatives and
 *  null/undefined are treated as placeholders and rejected. Zero is allowed as
 *  a genuine "free" price, not a placeholder. */
export const isUsablePriceMinor = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

function parsePriceBreak(raw: unknown): PriceBreak | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const quantity = Number(o.quantity);
  const unitPriceMinor = Number(o.unitPriceMinor);
  if (!Number.isSafeInteger(quantity) || quantity < 1) return null;
  if (!isUsablePriceMinor(unitPriceMinor)) return null;
  return { quantity, unitPriceMinor };
}

/** Accepts either an array of objects or a JSON string encoding one. Invalid
 *  entries are dropped; duplicate quantities keep the first occurrence. */
export const normalizePriceBreaks = (value: unknown): PriceBreak[] => {
  let raw: unknown = value;
  if (typeof value === "string") {
    if (!value.trim()) return [];
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: PriceBreak[] = [];
  for (const entry of raw) {
    const parsed = parsePriceBreak(entry);
    if (parsed && !seen.has(parsed.quantity)) {
      seen.add(parsed.quantity);
      out.push(parsed);
    }
  }
  return out.sort((a, b) => a.quantity - b.quantity);
};

/** Classify an observation's freshness by its age. Boundaries: <=7 days fresh,
 *  <=30 days recent, otherwise stale. */
export const freshnessLabelFromAge = (observedAt: string, now: string): OfferFreshnessLabel => {
  const observed = Date.parse(observedAt);
  const current = Date.parse(now);
  if (!Number.isFinite(observed) || !Number.isFinite(current)) return "unknown";
  const ageMs = Math.max(0, current - observed);
  const ageDays = ageMs / 86_400_000;
  if (ageDays <= 7) return "fresh";
  if (ageDays <= 30) return "recent";
  return "stale";
};

/** An update must append a history observation when the observable state
 *  (price or stock) changed, so a prior observation is never silently
 *  overwritten and no-op updates do not spam identical rows. */
export const shouldAppendHistory = (
  previous: { unitPriceMinor: number; stockQuantity: number | null },
  next: { unitPriceMinor: number; stockQuantity: number | null },
): boolean => previous.unitPriceMinor !== next.unitPriceMinor || previous.stockQuantity !== next.stockQuantity;

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new OfferValidationError(`${field} is required.`);
  return value.trim();
}

function optionalNullableInt(value: unknown, field: string, minimum: number): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new OfferValidationError(`${field} must be an integer >= ${minimum}.`);
  }
  return parsed;
}

/** Normalize untrusted offer payload into a validated `OfferWriteInput`.
 *  Rejects placeholder prices and malformed currency so nothing invalid is
 *  persisted as a current offer. */
export const normalizeOfferWriteInput = (raw: Record<string, unknown>): OfferWriteInput => {
  const currency = requireNonEmptyString(raw.currency, "currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new OfferValidationError("currency must be a 3-letter ISO code.");

  if (!isUsablePriceMinor(raw.unitPriceMinor)) {
    throw new OfferValidationError("unitPriceMinor must be a finite non-negative number (no placeholder prices).");
  }
  const unitPriceMinor = Math.round(raw.unitPriceMinor);

  const supplierId = requireNonEmptyString(raw.supplierId, "supplierId");
  const componentId = requireNonEmptyString(raw.componentId, "componentId");

  const minimumQuantity = raw.minimumQuantity == null ? 1 : optionalNullableInt(raw.minimumQuantity, "minimumQuantity", 1);
  if (minimumQuantity == null) throw new OfferValidationError("minimumQuantity must be an integer >= 1.");

  const reliabilityRaw = raw.reliabilityScore;
  let reliabilityScore: number | null = null;
  if (reliabilityRaw != null && reliabilityRaw !== "") {
    const parsed = Number(reliabilityRaw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new OfferValidationError("reliabilityScore must be between 0 and 1.");
    }
    reliabilityScore = parsed;
  }

  return {
    offerId: typeof raw.offerId === "string" && raw.offerId ? raw.offerId : null,
    supplierId,
    componentId,
    supplierSku: typeof raw.supplierSku === "string" && raw.supplierSku ? raw.supplierSku : null,
    productUrl: typeof raw.productUrl === "string" && raw.productUrl ? raw.productUrl : null,
    regionCode: typeof raw.regionCode === "string" && raw.regionCode ? raw.regionCode : null,
    currency,
    unitPriceMinor,
    minimumQuantity,
    stockQuantity: optionalNullableInt(raw.stockQuantity, "stockQuantity", 0),
    leadTimeDays: optionalNullableInt(raw.leadTimeDays, "leadTimeDays", 0),
    availability: normalizeAvailability(raw.availability),
    condition: normalizeCondition(raw.condition),
    priceBreaks: normalizePriceBreaks(raw.priceBreaks),
    reliabilityScore,
    riskLabel: normalizeRiskLabel(raw.riskLabel),
    freshnessLabel: normalizeFreshnessLabel(raw.freshnessLabel),
    observedAt: typeof raw.observedAt === "string" && raw.observedAt ? raw.observedAt : new Date().toISOString(),
    expiresAt: typeof raw.expiresAt === "string" && raw.expiresAt ? raw.expiresAt : null,
    sourceImportRecordId: typeof raw.sourceImportRecordId === "string" && raw.sourceImportRecordId ? raw.sourceImportRecordId : null,
  };
};
