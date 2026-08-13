// Pure whole-BOM sourcing optimizer. Deterministic and side-effect free so it
// can be unit-tested and reused verbatim in the Worker. It never invents a
// price: lines without a usable offer stay unpriced and are listed, not hidden.

import type { OfferCondition, OfferFreshnessLabel, PriceBreak, SourcingOffer } from "./offer";

export type SourcingObjective = "lowest-cost" | "fastest-delivery" | "fewest-suppliers" | "balanced";

export type SourcingConstraints = {
  preferredSupplierIds?: string[];
  excludedSupplierIds?: string[];
  region?: string;
  maxDeliveryDays?: number;
  exactPartsOnly?: boolean;
  allowSubstitutes?: boolean;
  allowUsed?: boolean;
  allowSurplus?: boolean;
  ownedComponentIds?: string[];
  userPriceOverrides?: Record<string, { unitPriceMinor: number }>;
  objective?: SourcingObjective;
};

export type SourcingLineInput = {
  id: string;
  componentId: string | null;
  name: string;
  quantity: number;
  fabricated: boolean;
  optional: boolean;
  mpn?: string | null;
};

export type BasketLine = {
  lineId: string;
  componentId: string | null;
  name: string;
  quantity: number;
  unitPriceMinor: number | null;
  selectedOfferId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  condition: OfferCondition | null;
  riskLabel: string | null;
  freshnessLabel: OfferFreshnessLabel | null;
  leadTimeDays: number | null;
  currency: string | null;
  subtotalMinor: number | null;
  isSubstitute: boolean;
  unpriced: boolean;
  exclusionReason: string | null;
};

export type SourcingAssumptions = {
  objective: SourcingObjective;
  currency: string;
  partsTotalMinor: number;
  shippingMinor: number;
  taxDutiesMinor: number;
  shippingIncluded: boolean;
  taxDutiesIncluded: boolean;
  unpricedLines: number;
  substitutionCount: number;
  ownedPartLines: number;
  deliveryRangeDays: [number, number] | null;
  freshness: "fresh" | "recent" | "stale" | "mixed" | "unknown";
  disclaimer: string;
};

export type SourcingEstimate = {
  basket: BasketLine[];
  assumptions: SourcingAssumptions;
  totalRangeMinor: [number, number];
};

export const ESTIMATE_DISCLAIMER =
  "Estimate only, not a binding quote. Prices are observations from supplier data, not live offers. Shipping, tax and duties are not included.";

const objectives: SourcingObjective[] = ["lowest-cost", "fastest-delivery", "fewest-suppliers", "balanced"];

export const normalizeObjective = (value: unknown): SourcingObjective =>
  typeof value === "string" && (objectives as string[]).includes(value) ? (value as SourcingObjective) : "lowest-cost";

/** Apply a quantity price break: the tier with the largest quantity that does
 *  not exceed the requested quantity wins, otherwise the base unit price. */
export function applyPriceBreaks(unitPriceMinor: number, breaks: PriceBreak[] | undefined, quantity: number): number {
  if (!breaks?.length) return unitPriceMinor;
  const sorted = [...breaks].sort((a, b) => a.quantity - b.quantity);
  let best = unitPriceMinor;
  for (const tier of sorted) {
    if (tier.quantity <= quantity) best = tier.unitPriceMinor;
    else break;
  }
  return best;
}

function isUsableOffer(offer: SourcingOffer, line: SourcingLineInput, constraints: SourcingConstraints): boolean {
  if (constraints.excludedSupplierIds?.includes(offer.supplierId)) return false;
  if (constraints.region && offer.region && offer.region !== constraints.region) return false;
  if (constraints.exactPartsOnly && offer.riskLabel !== "exact") return false;
  if (constraints.allowSubstitutes === false && offer.riskLabel === "substitute") return false;
  if (constraints.allowUsed === false && (offer.condition === "used" || offer.condition === "refurb")) return false;
  if (constraints.allowSurplus === false && offer.condition === "surplus") return false;
  if (constraints.maxDeliveryDays != null && offer.leadTimeDays != null && offer.leadTimeDays > constraints.maxDeliveryDays) return false;
  return true;
}

function offerScore(offer: SourcingOffer, objective: SourcingObjective, supplierIdsInBasket: Set<string>): number {
  switch (objective) {
    case "lowest-cost": return offer.unitPriceMinor;
    case "fastest-delivery": return (offer.leadTimeDays ?? 10_000) * 1_000_000 + offer.unitPriceMinor / 1_000;
    case "fewest-suppliers": return (supplierIdsInBasket.has(offer.supplierId) ? 0 : 1_000_000) + offer.unitPriceMinor;
    case "balanced": return offer.unitPriceMinor + (offer.leadTimeDays ?? 0) * 1_000;
  }
}

export function optimizeSourcing(lines: SourcingLineInput[], offers: SourcingOffer[], rawConstraints: SourcingConstraints = {}): SourcingEstimate {
  const objective = normalizeObjective(rawConstraints.objective);
  const constraints: SourcingConstraints = { ...rawConstraints, objective };
  const offersByComponent = new Map<string, SourcingOffer[]>();
  for (const offer of offers) {
    offersByComponent.set(offer.componentId, [...(offersByComponent.get(offer.componentId) ?? []), offer]);
  }

  const basket: BasketLine[] = [];
  const supplierIdsInBasket = new Set<string>();
  let partsTotalMinor = 0;
  let unpricedLines = 0;
  let substitutionCount = 0;
  let ownedPartLines = 0;
  const leadTimes: number[] = [];
  const freshnesses: OfferFreshnessLabel[] = [];
  const currencies = new Set<string>();

  for (const line of lines) {
    const overrides = constraints.userPriceOverrides?.[line.componentId ?? line.id];
    if (constraints.ownedComponentIds?.includes(line.componentId ?? line.id)) {
      ownedPartLines += 1;
      basket.push({ lineId: line.id, componentId: line.componentId, name: line.name, quantity: line.quantity, unitPriceMinor: null, selectedOfferId: null, supplierId: null, supplierName: null, condition: null, riskLabel: null, freshnessLabel: null, leadTimeDays: null, currency: null, subtotalMinor: null, isSubstitute: false, unpriced: false, exclusionReason: "owned-part" });
      continue;
    }
    if (line.fabricated) {
      basket.push({ lineId: line.id, componentId: line.componentId, name: line.name, quantity: line.quantity, unitPriceMinor: null, selectedOfferId: null, supplierId: null, supplierName: null, condition: null, riskLabel: null, freshnessLabel: null, leadTimeDays: null, currency: null, subtotalMinor: null, isSubstitute: false, unpriced: false, exclusionReason: "fabricated" });
      continue;
    }

    const candidates = (line.componentId ? offersByComponent.get(line.componentId) ?? [] : [])
      .filter((offer) => isUsableOffer(offer, line, constraints));
    if (!candidates.length) {
      unpricedLines += 1;
      basket.push({ lineId: line.id, componentId: line.componentId, name: line.name, quantity: line.quantity, unitPriceMinor: null, selectedOfferId: null, supplierId: null, supplierName: null, condition: null, riskLabel: null, freshnessLabel: null, leadTimeDays: null, currency: null, subtotalMinor: null, isSubstitute: false, unpriced: true, exclusionReason: "no-usable-offer" });
      continue;
    }

    const scored = candidates.map((offer) => ({ offer, score: offerScore(offer, objective, supplierIdsInBasket) }));
    scored.sort((a, b) => a.score - b.score);
    if (constraints.preferredSupplierIds?.length) {
      const preferred = scored.find((entry) => constraints.preferredSupplierIds!.includes(entry.offer.supplierId));
      if (preferred) scored.unshift(preferred);
    }
    const { offer } = scored[0];
    const unitPriceMinor = overrides ? overrides.unitPriceMinor : applyPriceBreaks(offer.unitPriceMinor, offer.priceBreaks, line.quantity);
    const subtotalMinor = unitPriceMinor * line.quantity;
    partsTotalMinor += subtotalMinor;
    supplierIdsInBasket.add(offer.supplierId);
    if (offer.leadTimeDays != null) leadTimes.push(offer.leadTimeDays);
    if (offer.freshnessLabel) freshnesses.push(offer.freshnessLabel);
    currencies.add(offer.currency);
    if (offer.riskLabel === "substitute") substitutionCount += 1;
    basket.push({
      lineId: line.id,
      componentId: line.componentId,
      name: line.name,
      quantity: line.quantity,
      unitPriceMinor,
      selectedOfferId: offer.id,
      supplierId: offer.supplierId,
      supplierName: offer.supplierName ?? null,
      condition: offer.condition,
      riskLabel: offer.riskLabel,
      freshnessLabel: offer.freshnessLabel,
      leadTimeDays: offer.leadTimeDays,
      currency: offer.currency,
      subtotalMinor,
      isSubstitute: offer.riskLabel === "substitute",
      unpriced: false,
      exclusionReason: null,
    });
  }

  const deliveryRangeDays: [number, number] | null = leadTimes.length ? [Math.min(...leadTimes), Math.max(...leadTimes)] : null;
  const uniqueFreshness = Array.from(new Set(freshnesses));
  const freshness: SourcingAssumptions["freshness"] = uniqueFreshness.length === 0 ? "unknown" : uniqueFreshness.length === 1 ? uniqueFreshness[0] : "mixed";
  const currency = currencies.size === 1 ? [...currencies][0] : currencies.size === 0 ? "USD" : "mixed";

  return {
    basket,
    assumptions: {
      objective,
      currency,
      partsTotalMinor: Math.round(partsTotalMinor),
      shippingMinor: 0,
      taxDutiesMinor: 0,
      shippingIncluded: false,
      taxDutiesIncluded: false,
      unpricedLines,
      substitutionCount,
      ownedPartLines,
      deliveryRangeDays,
      freshness,
      disclaimer: ESTIMATE_DISCLAIMER,
    },
    totalRangeMinor: [Math.round(partsTotalMinor), Math.round(partsTotalMinor)],
  };
}
