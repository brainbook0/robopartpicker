import { describe, expect, it } from "vitest";
import { bomItemDestination } from "./bom-item-destination";
import type { BomItem } from "@/shared/builds";

function item(overrides: Partial<BomItem> = {}): BomItem {
  return {
    id: "line/1",
    componentId: null,
    componentSlug: null,
    componentName: null,
    componentCategory: null,
    componentImageUrl: null,
    manufacturerPartNumber: null,
    manufacturerName: null,
    slotKey: "drive.motor",
    description: "Unresolved drive motor",
    quantity: 2,
    unit: "each",
    selectedSupplierOfferId: null,
    selectedSupplierName: null,
    selectedUnitPriceMinor: null,
    targetUnitPriceMinor: null,
    lowestUnitPriceMinor: null,
    knownOfferCount: 0,
    notes: null,
    extractionMethod: "source-table",
    completeness: "unresolved",
    evidenceLocator: "bom.csv:12",
    confidence: 0.7,
    lineClassification: "unresolved",
    included: 1,
    optional: 0,
    rawFields: "{}",
    aggregatedLocators: "[]",
    ...overrides,
  };
}

describe("bomItemDestination", () => {
  it("links exact catalog identities to their component profile", () => {
    expect(bomItemDestination("bom one", item({ componentCategory: "actuator", componentSlug: "mx-64" }))).toBe(
      "/parts/actuator/mx-64",
    );
  });

  it("links unresolved lines to a stable BOM item detail page", () => {
    expect(bomItemDestination("bom one", item())).toBe("/boms/bom%20one/items/line%2F1");
  });

  it("keeps fabricated artifacts on the stable BOM item detail page", () => {
    expect(bomItemDestination("bom one", item({ lineClassification: "fabricated", description: "Printed bracket" }))).toBe(
      "/boms/bom%20one/items/line%2F1",
    );
  });
});
