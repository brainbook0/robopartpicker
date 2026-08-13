import { describe, expect, it } from "vitest";
import type { SourcingOffer } from "./offer";
import { applyPriceBreaks, optimizeSourcing } from "./sourcing";

const offer = (overrides: Partial<SourcingOffer> = {}): SourcingOffer => ({
  id: "o1",
  supplierId: "s1",
  supplierName: "Supplier One",
  componentId: "c1",
  currency: "USD",
  unitPriceMinor: 1000,
  minimumQuantity: 1,
  stockQuantity: 10,
  leadTimeDays: 7,
  availability: "in_stock",
  condition: "new",
  priceBreaks: [],
  reliabilityScore: 0.9,
  riskLabel: "exact",
  freshnessLabel: "fresh",
  observedAt: "2026-08-13T00:00:00.000Z",
  isDemo: false,
  ...overrides,
});

const line = (overrides: Partial<{ id: string; componentId: string | null; name: string; quantity: number; fabricated: boolean; optional: boolean; mpn: string | null }> = {}) => ({
  id: "line-1",
  componentId: "c1",
  name: "Motor",
  quantity: 2,
  fabricated: false,
  optional: false,
  mpn: "M-1",
  ...overrides,
});

describe("sourcing optimizer", () => {
  it("prices every line and lists unpriced lines rather than hiding them", () => {
    const result = optimizeSourcing(
      [line(), line({ id: "line-2", componentId: "c-missing", name: "Mystery part" })],
      [offer()],
    );
    expect(result.basket).toHaveLength(2);
    const priced = result.basket.find((b) => b.lineId === "line-1")!;
    expect(priced.unitPriceMinor).toBe(1000);
    expect(priced.subtotalMinor).toBe(2000);
    const unpriced = result.basket.find((b) => b.lineId === "line-2")!;
    expect(unpriced.unpriced).toBe(true);
    expect(unpriced.exclusionReason).toBe("no-usable-offer");
    expect(result.assumptions.unpricedLines).toBe(1);
    expect(result.assumptions.partsTotalMinor).toBe(2000);
  });

  it("changes the basket with the objective", () => {
    const cheap = offer({ id: "cheap", unitPriceMinor: 500, leadTimeDays: 30 });
    const fast = offer({ id: "fast", unitPriceMinor: 900, leadTimeDays: 2 });
    const costBasket = optimizeSourcing([line()], [cheap, fast], { objective: "lowest-cost" });
    expect(costBasket.basket[0].selectedOfferId).toBe("cheap");
    const fastBasket = optimizeSourcing([line()], [cheap, fast], { objective: "fastest-delivery" });
    expect(fastBasket.basket[0].selectedOfferId).toBe("fast");
  });

  it("honors constraints: excluded suppliers, exact-parts-only, and owned parts", () => {
    const excluded = optimizeSourcing([line()], [offer({ supplierId: "blocked" })], { excludedSupplierIds: ["blocked"] });
    expect(excluded.basket[0].unpriced).toBe(true);

    const substitute = offer({ riskLabel: "substitute" });
    const exactOnly = optimizeSourcing([line()], [substitute], { exactPartsOnly: true });
    expect(exactOnly.basket[0].unpriced).toBe(true);

    const owned = optimizeSourcing([line()], [offer()], { ownedComponentIds: ["c1"] });
    expect(owned.basket[0].exclusionReason).toBe("owned-part");
    expect(owned.assumptions.ownedPartLines).toBe(1);
    expect(owned.assumptions.partsTotalMinor).toBe(0);
  });

  it("applies quantity price breaks", () => {
    expect(applyPriceBreaks(1000, [{ quantity: 10, unitPriceMinor: 800 }, { quantity: 5, unitPriceMinor: 900 }], 12)).toBe(800);
    expect(applyPriceBreaks(1000, [{ quantity: 10, unitPriceMinor: 800 }], 4)).toBe(1000);
    expect(applyPriceBreaks(1000, undefined, 20)).toBe(1000);
  });

  it("always returns a non-quote disclaimer and delivery/freshness signals", () => {
    const result = optimizeSourcing([line()], [offer({ leadTimeDays: 3, freshnessLabel: "recent" })]);
    expect(result.assumptions.disclaimer).toContain("not a binding quote");
    expect(result.assumptions.shippingIncluded).toBe(false);
    expect(result.assumptions.taxDutiesIncluded).toBe(false);
    expect(result.assumptions.deliveryRangeDays).toEqual([3, 3]);
    expect(result.assumptions.freshness).toBe("recent");
    expect(result.totalRangeMinor).toEqual([2000, 2000]);
  });
});
