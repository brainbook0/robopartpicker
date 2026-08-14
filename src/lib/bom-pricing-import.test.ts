import { describe, expect, it } from "vitest";
import { canonicalImportedPriceBreaks, IMPORTED_EXACT_MATCH_RISK_LABEL } from "./bom-pricing-import";
import { normalizePriceBreaks } from "../shared/offer";

describe("BOM pricing import normalization", () => {
  it("persists supplier tiers in the canonical optimizer shape", () => {
    const imported = canonicalImportedPriceBreaks([
      { quantity: 1, unitPriceUsd: 1.23, packaging: "Cut Tape" },
      { quantity: 10, unitPriceUsd: 0.987, packaging: "Reel" },
    ]);

    expect(imported).toEqual([
      { quantity: 1, unitPriceMinor: 123, packaging: "Cut Tape" },
      { quantity: 10, unitPriceMinor: 99, packaging: "Reel" },
    ]);
    expect(normalizePriceBreaks(JSON.stringify(imported))).toEqual([
      { quantity: 1, unitPriceMinor: 123 },
      { quantity: 10, unitPriceMinor: 99 },
    ]);
  });

  it("classifies exact MPN product-page matches as exact", () => {
    expect(IMPORTED_EXACT_MATCH_RISK_LABEL).toBe("exact");
  });
});
