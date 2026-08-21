import type { OfferAvailability, OfferCondition } from "../../shared/offer";

/**
 * A normalized, deterministic source-side identifier. Normalization is strict:
 * it only removes presentation differences (invisible links, trimmable
 * whitespace, case) and never rewrites the underlying SKU/MPN, so two tokens
 * that normalize equal are unambiguously the same part and two that differ are
 * treated as different parts. No fuzzy matching happens here by design.
 */
export function normalizePartToken(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/** An MPN-bearing component already recorded in the catalog (the match target). */
export type ComponentIdentity = {
  /** Catalog component id (existing row; the pipeline never creates one). */
  componentId: string;
  /** Manufacturer name recorded against the component. */
  manufacturer: string;
  /** The part token held on the component (its SKU/MPN). */
  manufacturerPartNumber: string;
  /** Human-readable name, carried through to the report for traceability. */
  name: string;
  /** The component's own source URL, if any. */
  sourceUrl: string | null;
};

/**
 * A verified supplier offer observation. Every field required to describe an
 * offer honestly is mandatory; `sourceSha256` ties the observation to the exact
 * page bytes that were verified so a price can be re-checked later.
 */
export type OfferObservation = {
  supplierSlug: string;
  supplierName: string;
  /** Supplier-facing SKU taken verbatim from the verified page. */
  supplierSku: string;
  /** Manufacturer part number published on the verified page, if present. */
  manufacturerPartNumber: string | null;
  /** Brand/manufacturer published on the verified page, if present. */
  brand: string | null;
  /** Canonical product page URL. */
  productUrl: string;
  regionCode: string;
  /** 3-letter ISO currency code published on the page. */
  currency: string;
  /** Quantity-one price in the currency's minor unit. Always >= 0 and finite. */
  unitPriceMinor: number;
  minimumQuantity: number;
  availability: OfferAvailability;
  condition: OfferCondition;
  observedAt: string;
  /** SHA-256 of the exact retrieved page bytes. */
  sourceSha256: string;
  /** Human-readable product name published on the page. */
  productName: string | null;
};

export type OfferRejectionReason =
  | "no-structured-data"
  | "sku-mismatch"
  | "missing-sku"
  | "missing-price"
  | "non-positive-price"
  | "missing-currency"
  | "invalid-currency"
  | "invalid-url"
  | "unreachable"
  | "not-a-product";

export type OfferSourceOutcome =
  | { status: "matched"; observation: OfferObservation }
  | { status: "rejected"; reason: OfferRejectionReason; detail?: string };

/** A supplier source adapter: turn one component identity into zero/one verified observation. */
export type OfferSourceAdapter = {
  supplierSlug: string;
  supplierName: string;
  regionCode: string;
  match(identity: ComponentIdentity): Promise<OfferSourceOutcome>;
};