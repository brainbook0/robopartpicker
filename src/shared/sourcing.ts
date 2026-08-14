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

export type SourcingDeliveryGroup = {
  supplierId: string;
  supplierName: string | null;
  lineIds: string[];
  subtotalMinor: number;
  currency: string | null;
  leadRangeDays: [number, number] | null;
  blockers: string[];
};

export type SourcingUnpricedLine = {
  lineId: string;
  componentId: string | null;
  name: string;
  quantity: number;
  reason: string;
};

export type SourcingEstimate = {
  basket: BasketLine[];
  assumptions: SourcingAssumptions;
  totalRangeMinor: [number, number];
  deliveryGroups: SourcingDeliveryGroup[];
  unpricedLines: SourcingUnpricedLine[];
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

function offerScore(offer: SourcingOffer, objective: SourcingObjective): number {
  switch (objective) {
    case "lowest-cost": return offer.unitPriceMinor;
    case "fastest-delivery": return (offer.leadTimeDays ?? 10_000) * 1_000_000 + offer.unitPriceMinor / 1_000;
    case "fewest-suppliers": return offer.unitPriceMinor;
    case "balanced": return offer.unitPriceMinor + (offer.leadTimeDays ?? 0) * 1_000;
  }
}

type PricedChoice = { line: SourcingLineInput; offer: SourcingOffer; unitPriceMinor: number; subtotalMinor: number };

function compareChoiceSets(a: PricedChoice[], b: PricedChoice[], objective: SourcingObjective): number {
  const supplierCountA = new Set(a.map((choice) => choice.offer.supplierId)).size;
  const supplierCountB = new Set(b.map((choice) => choice.offer.supplierId)).size;
  const totalA = a.reduce((sum, choice) => sum + choice.subtotalMinor, 0);
  const totalB = b.reduce((sum, choice) => sum + choice.subtotalMinor, 0);
  const maxLeadA = Math.max(...a.map((choice) => choice.offer.leadTimeDays ?? 10_000), 0);
  const maxLeadB = Math.max(...b.map((choice) => choice.offer.leadTimeDays ?? 10_000), 0);
  const leadSumA = a.reduce((sum, choice) => sum + (choice.offer.leadTimeDays ?? 10_000), 0);
  const leadSumB = b.reduce((sum, choice) => sum + (choice.offer.leadTimeDays ?? 10_000), 0);
  const stableA = a.map((choice) => choice.offer.id).join("\u0000");
  const stableB = b.map((choice) => choice.offer.id).join("\u0000");
  const byStable = stableA.localeCompare(stableB);
  switch (objective) {
    case "fewest-suppliers": return supplierCountA - supplierCountB || totalA - totalB || maxLeadA - maxLeadB || byStable;
    case "fastest-delivery": return maxLeadA - maxLeadB || leadSumA - leadSumB || totalA - totalB || supplierCountA - supplierCountB || byStable;
    case "balanced": return totalA + leadSumA * 1_000 - (totalB + leadSumB * 1_000) || supplierCountA - supplierCountB || byStable;
    case "lowest-cost": return totalA - totalB || supplierCountA - supplierCountB || maxLeadA - maxLeadB || byStable;
  }
}

function selectPricedChoices(choiceGroups: PricedChoice[][], objective: SourcingObjective): PricedChoice[] {
  const exhaustiveCombinations = choiceGroups.reduce((count, group) => count * group.length, 1);
  if (exhaustiveCombinations > 50_000) return selectPricedChoicesWithBeam(choiceGroups, objective);
  let best: PricedChoice[] = [];
  const visit = (index: number, current: PricedChoice[]) => {
    if (index === choiceGroups.length) {
      if (!best.length || compareChoiceSets(current, best, objective) < 0) best = [...current];
      return;
    }
    for (const choice of choiceGroups[index]) visit(index + 1, [...current, choice]);
  };
  visit(0, []);
  return best;
}

function selectPricedChoicesWithBeam(choiceGroups: PricedChoice[][], objective: SourcingObjective): PricedChoice[] {
  const beamWidth = 2_048;
  let partials: PricedChoice[][] = [[]];
  for (const group of choiceGroups) {
    partials = partials.flatMap((partial) => group.map((choice) => [...partial, choice]));
    partials.sort((a, b) => compareChoiceSets(a, b, objective));
    partials = partials.slice(0, beamWidth);
  }
  return partials[0] ?? [];
}

export function optimizeSourcing(lines: SourcingLineInput[], offers: SourcingOffer[], rawConstraints: SourcingConstraints = {}): SourcingEstimate {
  const objective = normalizeObjective(rawConstraints.objective);
  const constraints: SourcingConstraints = { ...rawConstraints, objective };
  const offersByComponent = new Map<string, SourcingOffer[]>();
  for (const offer of offers) {
    offersByComponent.set(offer.componentId, [...(offersByComponent.get(offer.componentId) ?? []), offer]);
  }

  const basket: BasketLine[] = [];
  const deferredLines: SourcingLineInput[] = [];
  const choiceGroups: PricedChoice[][] = [];
  let partsTotalMinor = 0;
  let unpricedLines = 0;
  let substitutionCount = 0;
  let ownedPartLines = 0;
  const leadTimes: number[] = [];
  const freshnesses: OfferFreshnessLabel[] = [];
  const currencies = new Set<string>();
  const unpricedLineDetails: SourcingUnpricedLine[] = [];

  const addUnpriced = (line: SourcingLineInput, reason: string) => {
    unpricedLines += 1;
    unpricedLineDetails.push({ lineId: line.id, componentId: line.componentId, name: line.name, quantity: line.quantity, reason });
    basket.push({ lineId: line.id, componentId: line.componentId, name: line.name, quantity: line.quantity, unitPriceMinor: null, selectedOfferId: null, supplierId: null, supplierName: null, condition: null, riskLabel: null, freshnessLabel: null, leadTimeDays: null, currency: null, subtotalMinor: null, isSubstitute: false, unpriced: true, exclusionReason: reason });
  };

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
      addUnpriced(line, "no-usable-offer");
      continue;
    }

    const scored = candidates.map((offer) => ({ offer, score: offerScore(offer, objective) }));
    scored.sort((a, b) => a.score - b.score || a.offer.id.localeCompare(b.offer.id));
    if (constraints.preferredSupplierIds?.length) {
      const preferred = scored.find((entry) => constraints.preferredSupplierIds!.includes(entry.offer.supplierId));
      if (preferred) scored.unshift(preferred);
    }
    deferredLines.push(line);
    choiceGroups.push(scored.map(({ offer }) => {
      const unitPriceMinor = overrides ? overrides.unitPriceMinor : applyPriceBreaks(offer.unitPriceMinor, offer.priceBreaks, line.quantity);
      return { line, offer, unitPriceMinor, subtotalMinor: unitPriceMinor * line.quantity };
    }));
  }

  const selectedByLine = new Map(selectPricedChoices(choiceGroups, objective).map((choice) => [choice.line.id, choice]));
  for (const line of deferredLines) {
    const choice = selectedByLine.get(line.id)!;
    const { offer, unitPriceMinor, subtotalMinor } = choice;
    partsTotalMinor += subtotalMinor;
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

  const deliveryGroups = buildDeliveryGroups(basket, unpricedLineDetails);

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
    deliveryGroups,
    unpricedLines: unpricedLineDetails,
  };
}

function buildDeliveryGroups(basket: BasketLine[], unpricedLineDetails: SourcingUnpricedLine[]): SourcingDeliveryGroup[] {
  const groups = new Map<string, SourcingDeliveryGroup>();
  for (const line of basket) {
    if (!line.supplierId || line.subtotalMinor == null) continue;
    const group = groups.get(line.supplierId) ?? { supplierId: line.supplierId, supplierName: line.supplierName, lineIds: [], subtotalMinor: 0, currency: line.currency, leadRangeDays: null, blockers: [] };
    group.lineIds.push(line.lineId);
    group.subtotalMinor += line.subtotalMinor;
    if (group.currency !== line.currency) group.currency = "mixed";
    if (line.leadTimeDays != null) {
      group.leadRangeDays = group.leadRangeDays ? [Math.min(group.leadRangeDays[0], line.leadTimeDays), Math.max(group.leadRangeDays[1], line.leadTimeDays)] : [line.leadTimeDays, line.leadTimeDays];
    } else {
      group.blockers.push(`Line ${line.lineId} has no supplier lead time.`);
    }
    groups.set(line.supplierId, group);
  }
  const blockers = unpricedLineDetails.map((line) => `Line ${line.lineId} is unpriced: ${line.reason}.`);
  return [...groups.values()].map((group) => ({ ...group, blockers: [...group.blockers, ...blockers] })).sort((a, b) => a.supplierName?.localeCompare(b.supplierName ?? "") || a.supplierId.localeCompare(b.supplierId));
}
