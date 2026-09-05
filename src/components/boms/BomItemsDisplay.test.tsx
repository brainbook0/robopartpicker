import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { BomDetail } from "@/shared/builds";
import { BomItemsDisplay } from "./BomItemsDisplay";

const bom = {
  id: "bom-1",
  name: "Robot BOM",
  items: [{
    id: "line-1",
    componentId: "component-1",
    componentSlug: "motor-1",
    componentName: "Drive motor",
    componentCategory: "actuator",
    componentImageUrl: "/api/v1/files/content?id=image-1",
    manufacturerPartNumber: "MOTOR-1",
    manufacturerName: "Acme",
    slotKey: "drive.motor",
    description: "Drive motor",
    quantity: 2,
    unit: "each",
    selectedSupplierOfferId: null,
    selectedSupplierName: null,
    selectedUnitPriceMinor: 1000,
    targetUnitPriceMinor: null,
    lowestUnitPriceMinor: null,
    knownOfferCount: 1,
    notes: null,
    extractionMethod: "explicit-bom",
    completeness: "complete",
    evidenceLocator: "bom.csv:2",
    confidence: 1,
    lineClassification: "purchased",
    included: 1,
    optional: 0,
    rawFields: "{}",
    aggregatedLocators: "[]",
  }],
  version: { currency: "USD" },
  totals: { lines: 1, units: 2, knownCostMinor: 2000, unpricedLines: 0 },
} as unknown as BomDetail;

describe("BomItemsDisplay product language", () => {
  it("shows part images, plain-language identity status, and a clear line-total label", () => {
    render(<MemoryRouter><BomItemsDisplay bom={bom} /></MemoryRouter>);
    expect(screen.getAllByRole("img", { name: "Source-backed product image for Drive motor" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Commercial component").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Identity verified").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Line total").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^purchased$/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/^complete$/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Extended$/iu)).not.toBeInTheDocument();
  });
});
