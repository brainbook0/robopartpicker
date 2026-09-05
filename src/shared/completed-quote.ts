export const DEFAULT_QUOTE_FRESHNESS_DAYS = 30;

export type QuoteLineInput = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  componentId: string | null;
  classification: "purchased" | "fabricated" | "optional" | "non-procurement" | "unresolved";
  included: boolean;
  optional: boolean;
  completeness: string;
  evidenceLocator: string | null;
};

export type QuoteOfferInput = {
  id: string;
  componentId: string;
  currency: string;
  unitPriceMinor: number;
  observedAt: string;
  expiresAt: string | null;
  isDemo: boolean;
  riskLabel: string | null;
};

export type CompletedQuoteLine = {
  bomItemId: string;
  description: string;
  quantity: number;
  unit: string;
  componentId: string;
  selectedOfferId: string;
  unitPriceMinor: number;
  extendedPriceMinor: number;
  observedAt: string;
  currency: string;
  evidenceLocator: string;
};

export type CompletedQuoteSnapshot = {
  schemaVersion: "completed-quote/1";
  bomId: string;
  bomVersionId: string;
  bomName: string;
  currency: string;
  generatedAt: string;
  freshnessWindowDays: number;
  lines: CompletedQuoteLine[];
  subtotalMinor: number;
  shippingIncluded: false;
  taxIncluded: false;
};

export type QuoteEligibility = {
  ready: boolean;
  blockers: Array<{ lineId: string | null; description: string }>;
  snapshot: CompletedQuoteSnapshot | null;
};

const confirmedBuckets = new Set(["complete", "verified"]);

export function buildCompletedQuoteSnapshot(input: {
  bomId: string;
  bomVersionId: string;
  bomName: string;
  currency: string;
  confirmed: boolean;
  lines: QuoteLineInput[];
  offers: QuoteOfferInput[];
  now?: Date;
  freshnessDays?: number;
}): QuoteEligibility {
  const now = input.now ?? new Date();
  const freshnessDays = input.freshnessDays ?? DEFAULT_QUOTE_FRESHNESS_DAYS;
  const cutoff = now.getTime() - freshnessDays * 86_400_000;
  const blockers: QuoteEligibility["blockers"] = [];
  if (!input.confirmed) blockers.push({ lineId: null, description: "Confirm this BOM before generating a completed quote." });

  const offersByComponent = new Map<string, QuoteOfferInput[]>();
  for (const offer of input.offers) {
    offersByComponent.set(offer.componentId, [...(offersByComponent.get(offer.componentId) ?? []), offer]);
  }

  const selectedLines: CompletedQuoteLine[] = [];
  for (const line of input.lines) {
    if (!line.included || line.classification === "non-procurement") continue;
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      blockers.push({ lineId: line.id, description: `${line.description}: confirm a positive quantity.` });
      continue;
    }
    if (!line.evidenceLocator) blockers.push({ lineId: line.id, description: `${line.description}: source evidence is missing.` });
    if (line.classification === "fabricated") {
      blockers.push({ lineId: line.id, description: `${line.description}: fabricated-part pricing is not yet verified.` });
      continue;
    }
    if (line.classification === "unresolved" || !confirmedBuckets.has(line.completeness)) {
      blockers.push({ lineId: line.id, description: `${line.description}: commercial identity is unresolved.` });
      continue;
    }
    if (!line.componentId) {
      blockers.push({ lineId: line.id, description: `${line.description}: no exact catalog component is linked.` });
      continue;
    }

    const candidates = (offersByComponent.get(line.componentId) ?? [])
      .filter((offer) => {
        const observed = Date.parse(offer.observedAt);
        const expires = offer.expiresAt ? Date.parse(offer.expiresAt) : Number.POSITIVE_INFINITY;
        return !offer.isDemo
          && offer.unitPriceMinor > 0
          && offer.currency === input.currency
          && Number.isFinite(observed)
          && observed >= cutoff
          && (!Number.isFinite(expires) || expires > now.getTime())
          && offer.riskLabel !== "substitute";
      })
      .sort((left, right) => left.unitPriceMinor - right.unitPriceMinor || Date.parse(right.observedAt) - Date.parse(left.observedAt) || left.id.localeCompare(right.id));
    const selected = candidates[0];
    if (!selected) {
      blockers.push({ lineId: line.id, description: `${line.description}: no fresh positive verified ${input.currency} price is available.` });
      continue;
    }
    const extended = Math.round(selected.unitPriceMinor * line.quantity);
    selectedLines.push({
      bomItemId: line.id,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      componentId: line.componentId,
      selectedOfferId: selected.id,
      unitPriceMinor: selected.unitPriceMinor,
      extendedPriceMinor: extended,
      observedAt: selected.observedAt,
      currency: selected.currency,
      evidenceLocator: line.evidenceLocator ?? "",
    });
  }

  if (selectedLines.length === 0) blockers.push({ lineId: null, description: "The BOM has no included priced procurement lines." });
  if (blockers.length) return { ready: false, blockers: dedupeBlockers(blockers), snapshot: null };

  return {
    ready: true,
    blockers: [],
    snapshot: {
      schemaVersion: "completed-quote/1",
      bomId: input.bomId,
      bomVersionId: input.bomVersionId,
      bomName: input.bomName,
      currency: input.currency,
      generatedAt: now.toISOString(),
      freshnessWindowDays: freshnessDays,
      lines: selectedLines,
      subtotalMinor: selectedLines.reduce((total, line) => total + line.extendedPriceMinor, 0),
      shippingIncluded: false,
      taxIncluded: false,
    },
  };
}

function dedupeBlockers(blockers: QuoteEligibility["blockers"]): QuoteEligibility["blockers"] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = `${blocker.lineId ?? "bom"}\u0000${blocker.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
