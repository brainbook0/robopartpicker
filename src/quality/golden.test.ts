// Semantic regression suite over golden Projects A (clean), B (messy) and C
// (user derivative). Every completion floor from REQ-QUALITY-FLOORS is asserted
// with a named failure: no silently missing required field, no dropped BOM
// line, no placeholder price, no synthetic data as real, and no approval
// bypass. Runs under `npm run test:unit` and in CI via the quality workflow.

import { describe, expect, it } from "vitest";
import { buildBomLine, COMPLETENESS_BUCKETS, EXTRACTION_METHODS } from "@/lib/rpps/bom";
import { optimizeSourcing } from "@/shared/sourcing";
import { reachesState, canApprove, transitionRfq } from "@/shared/rfq";
import { computePublishability } from "@/shared/provenance";
import { isSyntheticPart } from "@/lib/catalogWorkspace";
import { goldenA, goldenALines, goldenAOffers, goldenB, goldenC, type GoldenBomRow } from "./golden-fixtures";

const compile = (rows: GoldenBomRow[], sourcePath: string) =>
  rows.map((row, index) => buildBomLine({ ...row, sourcePath, rowIndex: index }));

describe("golden Project A (clean)", () => {
  const compiled = compile(goldenA.bom, "bom.csv");

  it("compiles near-completely with every required per-line field", () => {
    expect(compiled).toHaveLength(goldenA.bom.length);
    for (const line of compiled) {
      expect(line.name, "every line keeps a name").toBeTruthy();
      expect(line.quantity, "every line keeps a quantity").toBeGreaterThan(0);
      expect(line.evidenceLocator, "every line keeps an evidence locator").toBeTruthy();
      expect(EXTRACTION_METHODS, "every line keeps an extraction method").toContain(line.extractionMethod);
      expect(COMPLETENESS_BUCKETS, "every line keeps a completeness bucket").toContain(line.completeness);
      expect(line.confidence, "every line keeps a confidence").toBeGreaterThanOrEqual(0);
      expect(line.completeness, "golden A lines are verified or probable").not.toBe("unresolved");
    }
  });

  it("prices every line and never leaves a placeholder price", () => {
    const estimate = optimizeSourcing(goldenALines, goldenAOffers, { objective: "lowest-cost" });
    expect(estimate.assumptions.unpricedLines).toBe(0);
    expect(estimate.assumptions.partsTotalMinor).toBeGreaterThan(0);
    for (const line of estimate.basket) {
      expect(line.unitPriceMinor, "every priced line has a usable price").toBeGreaterThanOrEqual(0);
      expect(line.unitPriceMinor, "no placeholder price").not.toBeNull();
    }
    expect(estimate.assumptions.disclaimer).toContain("not a binding quote");
  });

  it("is publishable with complete provenance", () => {
    expect(computePublishability({ name: goldenA.name, slug: goldenA.slug, version: goldenA.version, license: goldenA.license, maintainer: goldenA.maintainer, repositoryUrl: goldenA.repoUrl, revision: goldenA.revision })).toBe("ready");
  });
});

describe("golden Project B (messy)", () => {
  const compiled = compile(goldenB.bom, "README.md");

  it("retains unresolved lines instead of dropping them", () => {
    expect(compiled).toHaveLength(goldenB.bom.length);
    const buckets = compiled.map((line) => line.completeness);
    expect(buckets, "messy lines are retained with explicit uncertainty").toEqual(expect.arrayContaining(["missing-qty", "unresolved"]));
  });

  it("leaves unpriced lines visible rather than pretending a price", () => {
    const estimate = optimizeSourcing(
      goldenB.bom.map((row, index) => ({ id: `b-${index}`, componentId: null, name: row.name, quantity: row.quantity ?? 1, fabricated: false, optional: false })),
      [],
    );
    expect(estimate.assumptions.unpricedLines).toBe(goldenB.bom.length);
    expect(estimate.assumptions.partsTotalMinor).toBe(0);
  });
});

describe("golden Project C (user derivative)", () => {
  const compiled = compile(goldenC.bom, "bom.csv");

  it("preserves lineage and flags the fabricated part", () => {
    expect(goldenC.upstreamProjectId).toBe("project:golden-a");
    expect(goldenC.upstreamRevision).toBe("1.0.0");
    expect(compiled.find((line) => line.fabricated)?.completeness).toBe("custom-fabricated");
  });

  it("excludes fabricated parts from procurement and still prices the rest", () => {
    const lines = goldenC.bom.map((row, index) => ({
      id: `c-${index}`,
      componentId: row.fabricated ? null : `component:${index}`,
      name: row.name,
      quantity: row.quantity ?? 1,
      fabricated: row.fabricated === true,
      optional: false,
    }));
    const offers = [{ ...goldenAOffers[0], id: "sub", componentId: "component:1", riskLabel: "substitute", unitPriceMinor: 1800 } as const];
    const estimate = optimizeSourcing(lines, offers);
    const fabricated = estimate.basket.find((line) => line.name.includes("wrist"));
    expect(fabricated?.exclusionReason).toBe("fabricated");
    const motor = estimate.basket.find((line) => line.name.includes("NEMA 23"));
    expect(motor?.isSubstitute).toBe(true);
  });
});

describe("quote workflow floors", () => {
  it("reaches user_review_required only through the spine", () => {
    expect(reachesState(["request", "prepare", "send", "receive_partial", "reconcile", "review"], "user_review_required")).toBe(true);
  });

  it("requires explicit approval before any handoff", () => {
    expect(canApprove("user_review_required")).toBe(true);
    expect(canApprove("quotes_reconciled")).toBe(false);
    expect(transitionRfq("user_review_required", "approve")).toBe("option_selected");
    expect(transitionRfq("estimate_ready", "approve")).toBe(null);
  });
});

describe("catalog floors", () => {
  it("never presents synthetic data as a real supplier record", () => {
    expect(isSyntheticPart({ isDemo: true, provenanceLabel: "manufacturer" })).toBe(true);
    expect(isSyntheticPart({ isDemo: false, provenanceLabel: "demo" })).toBe(true);
    expect(isSyntheticPart({ isDemo: false, provenanceLabel: "manufacturer" })).toBe(false);
  });
});
