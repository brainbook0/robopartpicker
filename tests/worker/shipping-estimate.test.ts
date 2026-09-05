import { describe, expect, it } from "vitest";
import { estimatePreliminaryShipping } from "../../worker/services/shipping-estimate";

describe("estimatePreliminaryShipping", () => {
  it("uses known shipment weight for Canadian delivery", () => {
    const result = estimatePreliminaryShipping({ countryCode: "CA", region: "ON", shipmentCount: 1, items: [{ quantity: 1, weightGrams: 2000, category: "actuator" }] });
    expect(result).toMatchObject({ amountMinor: 1955, currency: "USD", confidence: "high", methodVersion: "preliminary-shipping-v1", dutiesTaxIncluded: false });
    expect(result.deliveryDays).toEqual([3, 8]);
  });

  it("uses conservative category weights and lowers confidence when weight is missing", () => {
    const result = estimatePreliminaryShipping({ countryCode: "CA", region: "BC", shipmentCount: 1, items: [{ quantity: 2, weightGrams: null, category: "actuator" }] });
    expect(result.amountMinor).toBe(2135);
    expect(result.estimatedWeightGrams).toBe(2400);
    expect(result.confidence).toBe("low");
  });

  it("adds multi-shipment handling and international rates deterministically", () => {
    const result = estimatePreliminaryShipping({ countryCode: "DE", region: "BE", shipmentCount: 3, items: [{ quantity: 1, weightGrams: 1000, category: "sensor" }] });
    expect(result.amountMinor).toBe(6145);
    expect(result.deliveryDays).toEqual([8, 21]);
    expect(result.disclaimer).toContain("duties and taxes are excluded");
  });

  it("rejects invalid quantities and weights", () => {
    expect(() => estimatePreliminaryShipping({ countryCode: "US", region: "NY", shipmentCount: 1, items: [{ quantity: 0, weightGrams: 10, category: "sensor" }] })).toThrow("positive quantity");
    expect(() => estimatePreliminaryShipping({ countryCode: "US", region: "NY", shipmentCount: 1, items: [{ quantity: 1, weightGrams: -1, category: "sensor" }] })).toThrow("non-negative weight");
  });
});
