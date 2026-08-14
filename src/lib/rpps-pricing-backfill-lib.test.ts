import { describe, expect, it } from "vitest";
import { enrichRppsBomPricing } from "../../scripts/rpps-pricing-backfill-lib";
import { emptyRpps, type RppsPackage } from "./rpps/schema";

function packageWithBom(): RppsPackage {
  return emptyRpps({
    name: "Example robot",
    slug: "example-robot",
    version: "1.0.0",
    summary: "Example",
    license: "MIT",
    repo_url: "https://github.com/example/robot",
    bom: [
      { name: "Motor driver", manufacturer: "TI", mpn: "OLD", qty: 2 },
      { name: "100 nF capacitor", qty: 3 },
    ],
  });
}

describe("enrichRppsBomPricing", () => {
  it("updates only an exact normalized BOM position with supported RPPS fields", () => {
    const original = packageWithBom();
    const result = enrichRppsBomPricing(original, [{
      sortOrder: 0,
      description: "Motor driver",
      manufacturer: "Texas Instruments",
      manufacturerPartNumber: "DRV8871DDAR",
      unitPriceMinor: 298,
      productUrl: "https://www.digikey.com/en/products/detail/texas-instruments/DRV8871DDAR/5801228",
    }]);

    expect(result.changedLines).toBe(1);
    expect(result.rpps.bom[0]).toEqual({
      name: "Motor driver",
      manufacturer: "Texas Instruments",
      mpn: "DRV8871DDAR",
      qty: 2,
      unit_cost_usd: 2.98,
      supplier_url: "https://www.digikey.com/en/products/detail/texas-instruments/DRV8871DDAR/5801228",
    });
    expect(result.rpps.bom[1]).toEqual(original.bom[1]);
    expect(original.bom[0].mpn).toBe("OLD");
  });

  it("rejects mismatched descriptions, duplicate positions, invalid prices, and non-DigiKey URLs", () => {
    const base = {
      sortOrder: 0,
      description: "Motor driver",
      manufacturer: "Texas Instruments",
      manufacturerPartNumber: "DRV8871DDAR",
      unitPriceMinor: 298,
      productUrl: "https://www.digikey.com/en/products/detail/texas-instruments/DRV8871DDAR/5801228",
    };
    expect(() => enrichRppsBomPricing(packageWithBom(), [{ ...base, description: "Different part" }]))
      .toThrow("description mismatch");
    expect(() => enrichRppsBomPricing(packageWithBom(), [base, base]))
      .toThrow("duplicate pricing row");
    expect(() => enrichRppsBomPricing(packageWithBom(), [{ ...base, unitPriceMinor: 0 }]))
      .toThrow("invalid positive unit price");
    expect(() => enrichRppsBomPricing(packageWithBom(), [{ ...base, productUrl: "https://example.com/part" }]))
      .toThrow("unexpected supplier URL");
  });
});
