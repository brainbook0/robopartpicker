import { describe, expect, it } from "vitest";
import { estimateProjectProfile } from "./projectEstimate";

describe("estimateProjectProfile", () => {
  it("prefers published cost and time", () => {
    const result = estimateProjectProfile({
      projectKind: "physical_design",
      category: "mobile",
      publishedCostUsd: 1250,
      publishedTimeHours: 18.5,
      knownCostMinor: 40_000,
      pricedLines: 2,
      totalLines: 4,
      units: 8,
      assemblyDurationMinutes: 0,
      assemblySteps: 0,
      difficulty: "intermediate",
      valuedAt: "2026-08-25T00:00:00Z",
    });

    expect(result.cost).toMatchObject({ amountMinor: 125_000, source: "published", confidence: "high" });
    expect(result.time).toMatchObject({ minutes: 1_110, source: "published", confidence: "high" });
    expect(result.valuedAt).toBe("2026-08-25T00:00:00Z");
  });

  it("rejects a synthetic commercial category baseline and does not invent build time", () => {
    const result = estimateProjectProfile({
      projectKind: "commercial_showcase",
      category: "humanoid",
      publishedCostUsd: null,
      marketCostMinor: 25_000_000,
      marketCostMethod: "category-baseline-v1",
      publishedTimeHours: null,
      knownCostMinor: 0,
      pricedLines: 0,
      totalLines: 0,
      units: 0,
      assemblyDurationMinutes: 0,
      assemblySteps: 0,
      difficulty: null,
      valuedAt: "2026-08-25T19:37:00.000Z",
    });

    expect(result.cost).toBeNull();
    expect(result.time).toBeNull();
  });

  it("preserves a source-reviewed commercial market point without calling it published", () => {
    const result = estimateProjectProfile({
      projectKind: "commercial_showcase", category: "humanoid", publishedCostUsd: null,
      marketCostMinor: 1_350_000, marketCostMethod: "official-offer-observation-v1",
      publishedTimeHours: null, knownCostMinor: 0, pricedLines: 0, totalLines: 0, units: 0,
      assemblyDurationMinutes: 0, assemblySteps: 0, difficulty: null, valuedAt: "2026-08-25",
    });
    expect(result.cost).toMatchObject({ amountMinor: 1_350_000, source: "market", confidence: "low" });
    expect(result.time).toBeNull();
  });

  it("extrapolates a partial priced BOM deterministically", () => {
    const result = estimateProjectProfile({
      projectKind: "physical_design",
      category: "manipulator",
      publishedCostUsd: null,
      publishedTimeHours: null,
      knownCostMinor: 20_000,
      pricedLines: 2,
      totalLines: 4,
      units: 9,
      assemblyDurationMinutes: 360,
      assemblySteps: 7,
      difficulty: "advanced",
      valuedAt: "2026-08-25",
    });

    expect(result.cost).toMatchObject({ amountMinor: 43_200, source: "calculated", confidence: "low" });
    expect(result.cost.method).toContain("priced BOM coverage");
    expect(result.time).toMatchObject({ minutes: 360, source: "calculated", confidence: "medium" });
  });

  it("uses conservative category baselines when source data is absent", () => {
    const result = estimateProjectProfile({
      projectKind: "physical_design",
      category: "mobile",
      publishedCostUsd: null,
      publishedTimeHours: null,
      knownCostMinor: 0,
      pricedLines: 0,
      totalLines: 0,
      units: 0,
      assemblyDurationMinutes: 0,
      assemblySteps: 0,
      difficulty: null,
      valuedAt: "2026-08-25",
    });

    expect(result.cost).toMatchObject({ amountMinor: 90_000, source: "inferred", confidence: "low" });
    expect(result.time).toMatchObject({ minutes: 1_440, source: "inferred", confidence: "low" });
    expect(result.methodVersion).toBe("project-point-estimate-v1");
  });

  it("always returns positive point values for an applicable project", () => {
    const result = estimateProjectProfile({
      projectKind: "unknown",
      category: null,
      publishedCostUsd: null,
      publishedTimeHours: null,
      knownCostMinor: 0,
      pricedLines: 0,
      totalLines: 0,
      units: 0,
      assemblyDurationMinutes: 0,
      assemblySteps: 0,
      difficulty: "expert",
      valuedAt: "invalid date retained as source label",
    });

    expect(result.cost.amountMinor).toBeGreaterThan(0);
    expect(result.time.minutes).toBeGreaterThan(0);
    expect(result.cost.source).toBe("inferred");
    expect(result.time.source).toBe("inferred");
  });
});
