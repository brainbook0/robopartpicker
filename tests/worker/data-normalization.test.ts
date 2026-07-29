import { describe, expect, it } from "vitest";
import {
  canonicalFingerprint,
  normalizeClaim,
  normalizeCurrencyAmount,
  normalizeEngineeringName,
  normalizeEngineeringRevision,
  normalizePartNumber,
} from "../../worker/services/data-normalization";


const observedAt = "2026-07-29T12:00:00.000Z";

describe("data normalization", () => {
  it("preserves original engineering values and conversion provenance", async () => {
    expect(normalizeClaim({
      claimKey: "actuator.weight",
      originalValue: "820 g",
      numericValue: 820,
      unit: "g",
      observedAt,
    })).toEqual({
      claimKey: "actuator.weight",
      originalValue: "820 g",
      normalizedValue: 0.82,
      originalUnit: "g",
      normalizedUnit: "kg",
      conversion: {
        registryVersion: "engineering-units/1",
        source: "SI exact conversion",
        observedAt,
      },
    });
    expect(normalizeClaim({
      claimKey: "actuator.current",
      originalValue: "1200 mA",
      numericValue: 1200,
      unit: "mA",
      observedAt,
    }).normalizedValue).toBe(1.2);
  });

  it("does not silently convert currency and records an explicit rate source when it does", () => {
    expect(normalizeCurrencyAmount({
      amountMinor: 10_000,
      currency: "eur",
      observedAt,
    })).toEqual({
      originalAmountMinor: 10_000,
      originalCurrency: "EUR",
      normalizedAmountMinor: 10_000,
      normalizedCurrency: "EUR",
      conversion: null,
    });

    expect(normalizeCurrencyAmount({
      amountMinor: 10_000,
      currency: "EUR",
      observedAt,
      exchangeRate: {
        targetCurrency: "USD",
        multiplier: 1.1,
        source: "ECB reference-rate fixture",
        publishedAt: "2026-07-29T00:00:00.000Z",
      },
    })).toEqual({
      originalAmountMinor: 10_000,
      originalCurrency: "EUR",
      normalizedAmountMinor: 11_000,
      normalizedCurrency: "USD",
      conversion: {
        multiplier: 1.1,
        source: "ECB reference-rate fixture",
        publishedAt: "2026-07-29T00:00:00.000Z",
        observedAt,
      },
    });
  });

  it("normalizes names and part numbers without discarding source punctuation", () => {
    expect(normalizeEngineeringName("  Mötör—Drive  X1 ")).toBe("motor drive x1");
    expect(normalizePartNumber("  xh430-w350-r  ")).toBe("XH430-W350-R");
    expect(normalizeEngineeringRevision("  Rev A / 02 ")).toBe("rev-a-02");
  });

  it("creates the same fingerprint for objects with different key order", async () => {
    const first = await canonicalFingerprint({ b: 2, a: { d: 4, c: 3 } });
    const second = await canonicalFingerprint({ a: { c: 3, d: 4 }, b: 2 });

    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(second).toBe(first);
  });

  it("rejects unsupported units and non-finite values instead of estimating", () => {
    expect(() => normalizeClaim({
      claimKey: "actuator.torque",
      originalValue: "12 mystery",
      numericValue: 12,
      unit: "mystery",
      observedAt,
    })).toThrow("Unsupported unit");
    expect(() => normalizeClaim({
      claimKey: "actuator.torque",
      originalValue: "NaN",
      numericValue: Number.NaN,
      unit: "N.m",
      observedAt,
    })).toThrow("finite");
  });
});
