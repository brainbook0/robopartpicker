import { describe, expect, it } from "vitest";
import {
  OfferValidationError,
  freshnessLabelFromAge,
  isUsablePriceMinor,
  normalizeAvailability,
  normalizeCondition,
  normalizeFreshnessLabel,
  normalizeOfferWriteInput,
  normalizePriceBreaks,
  normalizeRiskLabel,
  shouldAppendHistory,
} from "./offer";

describe("offer normalizers", () => {
  it("normalizes enums to known values and falls back to unknown", () => {
    expect(normalizeCondition("refurb")).toBe("refurb");
    expect(normalizeCondition("wat")).toBe("unknown");
    expect(normalizeCondition(undefined)).toBe("unknown");
    expect(normalizeRiskLabel("substitute")).toBe("substitute");
    expect(normalizeRiskLabel("exact")).toBe("exact");
    expect(normalizeRiskLabel(null)).toBe("unknown");
    expect(normalizeFreshnessLabel("fresh")).toBe("fresh");
    expect(normalizeFreshnessLabel("old")).toBe("unknown");
    expect(normalizeAvailability("in_stock")).toBe("in_stock");
    expect(normalizeAvailability("nope")).toBe("unknown");
  });

  it("rejects placeholder prices", () => {
    expect(isUsablePriceMinor(0)).toBe(true);
    expect(isUsablePriceMinor(1234)).toBe(true);
    expect(isUsablePriceMinor(-1)).toBe(false);
    expect(isUsablePriceMinor(NaN)).toBe(false);
    expect(isUsablePriceMinor(Infinity)).toBe(false);
    expect(isUsablePriceMinor(null)).toBe(false);
    expect(isUsablePriceMinor(undefined)).toBe(false);
    expect(isUsablePriceMinor("100")).toBe(false);
  });

  it("parses price breaks from arrays and JSON strings, dropping junk", () => {
    expect(normalizePriceBreaks([{ quantity: 10, unitPriceMinor: 900 }, { quantity: 1, unitPriceMinor: 1200 }]))
      .toEqual([{ quantity: 1, unitPriceMinor: 1200 }, { quantity: 10, unitPriceMinor: 900 }]);
    expect(normalizePriceBreaks('[{"quantity":5,"unitPriceMinor":500}]'))
      .toEqual([{ quantity: 5, unitPriceMinor: 500 }]);
    expect(normalizePriceBreaks("not json")).toEqual([]);
    expect(normalizePriceBreaks(null)).toEqual([]);
    expect(normalizePriceBreaks([{ quantity: 0, unitPriceMinor: 100 }, { quantity: 2, unitPriceMinor: -5 }])).toEqual([]);
  });

  it("classifies freshness by age", () => {
    const now = "2026-08-13T00:00:00.000Z";
    expect(freshnessLabelFromAge("2026-08-12T00:00:00.000Z", now)).toBe("fresh");
    expect(freshnessLabelFromAge("2026-07-20T00:00:00.000Z", now)).toBe("recent");
    expect(freshnessLabelFromAge("2026-01-01T00:00:00.000Z", now)).toBe("stale");
    expect(freshnessLabelFromAge("garbage", now)).toBe("unknown");
  });

  it("appends history only when price or stock changed", () => {
    const prev = { unitPriceMinor: 100, stockQuantity: 5 };
    expect(shouldAppendHistory(prev, { unitPriceMinor: 100, stockQuantity: 5 })).toBe(false);
    expect(shouldAppendHistory(prev, { unitPriceMinor: 110, stockQuantity: 5 })).toBe(true);
    expect(shouldAppendHistory(prev, { unitPriceMinor: 100, stockQuantity: 3 })).toBe(true);
    expect(shouldAppendHistory(prev, { unitPriceMinor: 100, stockQuantity: null })).toBe(true);
  });

  it("normalizes valid offer input", () => {
    const input = normalizeOfferWriteInput({
      supplierId: "s1",
      componentId: "c1",
      currency: "usd",
      unitPriceMinor: 1234,
      condition: "new",
      riskLabel: "exact",
      freshnessLabel: "fresh",
      priceBreaks: '[{"quantity":10,"unitPriceMinor":1100}]',
      reliabilityScore: 0.8,
      stockQuantity: 12,
    });
    expect(input.currency).toBe("USD");
    expect(input.unitPriceMinor).toBe(1234);
    expect(input.minimumQuantity).toBe(1);
    expect(input.condition).toBe("new");
    expect(input.priceBreaks).toEqual([{ quantity: 10, unitPriceMinor: 1100 }]);
    expect(input.reliabilityScore).toBe(0.8);
    expect(input.stockQuantity).toBe(12);
  });

  it("rejects invalid offer input with named errors", () => {
    expect(() => normalizeOfferWriteInput({ supplierId: "s", componentId: "c", currency: "us", unitPriceMinor: 100 }))
      .toThrow(OfferValidationError);
    expect(() => normalizeOfferWriteInput({ supplierId: "s", componentId: "c", currency: "usd", unitPriceMinor: null }))
      .toThrow(/placeholder/);
    expect(() => normalizeOfferWriteInput({ supplierId: "s", componentId: "c", currency: "usd", unitPriceMinor: -1 }))
      .toThrow(OfferValidationError);
    expect(() => normalizeOfferWriteInput({ supplierId: "s", componentId: "c", currency: "usd", unitPriceMinor: 100, reliabilityScore: 1.5 }))
      .toThrow(/reliabilityScore/);
  });
});
