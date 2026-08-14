import type { OfferRiskLabel, PriceBreak } from "../shared/offer";

export type SupplierPriceTier = {
  quantity: number;
  unitPriceUsd: number;
  packaging?: string;
};

export type ImportedPriceBreak = PriceBreak & { packaging?: string };

export const IMPORTED_EXACT_MATCH_RISK_LABEL: OfferRiskLabel = "exact";

export function canonicalImportedPriceBreaks(tiers: SupplierPriceTier[]): ImportedPriceBreak[] {
  return tiers.map((tier) => ({
    quantity: tier.quantity,
    unitPriceMinor: Math.round(tier.unitPriceUsd * 100),
    ...(tier.packaging ? { packaging: tier.packaging } : {}),
  }));
}
