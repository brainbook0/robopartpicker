import { describe, expect, it } from "vitest";
import { currentBomTotals, rppsBomTotals } from "./current-bom";
import type { ProjectRow } from "./projects";
import type { BomDetail } from "@/shared/builds";

function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "p1",
    slug: "nasa-jpl-open-source-rover",
    name: "nasa-jpl/open-source-rover",
    bom_id: null,
    bom_line_count: 0,
    rpps: { rpps_version: "1.0.0", name: "x", slug: "x", version: "0.1.0", bom: [] },
    ...overrides,
  } as ProjectRow;
}

function normalizedBom(overrides: Partial<BomDetail> = {}): BomDetail {
  return {
    id: "bom-21826c3cb8bf412e79c1e7a6",
    slug: null,
    name: "JPL rover BOM",
    project_id: "p1",
    current_version_id: null,
    visibility: "public",
    is_demo: 0,
    updated_at: "2026-08-21T00:00:00Z",
    line_count: 0,
    known_cost_minor: 0,
    unpriced_lines: 0,
    owner_user_id: null,
    organization_id: null,
    version: { id: "v1", label: "1", notes: null, currency: "USD", createdAt: "2026-08-21T00:00:00Z" },
    items: [],
    totals: { lines: 0, units: 0, knownCostMinor: 0, unpricedLines: 0 },
    ...overrides,
  } as BomDetail;
}

describe("currentBomTotals", () => {
  it("prefers the normalized D1 BOM as the single source of truth", () => {
    const proj = project({
      bom_id: "bom-21826c3cb8bf412e79c1e7a6",
      bom_line_count: 94,
      rpps: { rpps_version: "1.0.0", name: "x", slug: "x", version: "0.1.0", bom: Array.from({ length: 39 }, (_, i) => ({ name: `fab ${i}`, qty: 1, fabricated: true })) } as ProjectRow["rpps"],
    });
    const bom = normalizedBom({
      totals: { lines: 94, units: 118, knownCostMinor: 142125, unpricedLines: 8 },
    });

    const totals = currentBomTotals(proj, bom);
    expect(totals).toMatchObject({
      source: "normalized",
      available: true,
      lineCount: 94,
      units: 118,
      knownCostMinor: 142125,
      pricedLines: 86,
      unpricedLines: 8,
      currency: "USD",
    });
    // line count / known total / unpriced stay internally consistent.
    expect(totals.pricedLines + totals.unpricedLines).toBe(totals.lineCount);
    expect(totals.knownCostMinor).toBe(1421.25 * 100);
  });

  it("reports an unresolved state when a linked BOM has not loaded, without inventing totals", () => {
    const proj = project({ bom_id: "bom-x", bom_line_count: 94 });
    const totals = currentBomTotals(proj, null);
    expect(totals.available).toBe(false);
    expect(totals.source).toBe("normalized");
    expect(totals.lineCount).toBe(94);
    expect(totals.knownCostMinor).toBe(0);
    expect(totals.unpricedLines).toBe(0);
  });

  it("falls back to the legacy RPPS bom only when no D1 BOM is linked", () => {
    const rpps = {
      rpps_version: "1.0.0",
      name: "x",
      slug: "x",
      version: "0.1.0",
      bom: [
        { name: "priced a", qty: 2, unit_cost_usd: 5 },
        { name: "priced b", qty: 3, unit_cost_usd: 10 },
        { name: "unpriced", qty: 1, fabricated: true },
      ],
    } as ProjectRow["rpps"];
    const totals = currentBomTotals(project({ rpps }), null);
    expect(totals.source).toBe("rpps");
    expect(totals.available).toBe(true);
    expect(totals.lineCount).toBe(3);
    expect(totals.pricedLines).toBe(2);
    expect(totals.unpricedLines).toBe(1);
    // known total derives only from priced lines: 2*$5 + 3*$10 = $40.
    expect(totals.knownCostMinor).toBe(4000);
    expect(totals.units).toBe(6);
  });

  it("keeps priced + unpriced equal to line count across every path", () => {
    const normalized = normalizedBom({ totals: { lines: 10, units: 12, knownCostMinor: 500, unpricedLines: 3 } });
    const viaNormalized = currentBomTotals(project({ bom_id: "b", bom_line_count: 10 }), normalized);
    expect(viaNormalized.pricedLines + viaNormalized.unpricedLines).toBe(viaNormalized.lineCount);

    const viaRpps = currentBomTotals(project({ rpps: { rpps_version: "1.0.0", name: "x", slug: "x", version: "0.1.0", bom: [{ name: "a", qty: 1 }] } as ProjectRow["rpps"] }), null);
    expect(viaRpps.pricedLines + viaRpps.unpricedLines).toBe(viaRpps.lineCount);
  });
});

describe("rppsBomTotals", () => {
  it("derives known total and unpriced count from the flat list", () => {
    const bom = [
      { name: "motor", qty: 2, unit_cost_usd: 25.5 },
      { name: "bracket", qty: 4, fabricated: true },
      { name: "wheel", qty: 4, unit_cost_usd: 3.2 },
    ];
    const totals = rppsBomTotals(bom as ProjectRow["rpps"]["bom"]);
    // 2*$25.50 + 4*$3.20 = $51.00 + $12.80 = $63.80 -> 6380 minor.
    expect(totals.knownCostMinor).toBe(6380);
    expect(totals.pricedLines).toBe(2);
    expect(totals.unpricedLines).toBe(1);
    expect(totals.lineCount).toBe(3);
    expect(totals.units).toBe(10);
  });
});