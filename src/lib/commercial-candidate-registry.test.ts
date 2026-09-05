import { describe, expect, it } from "vitest";
import { validateCommercialCandidateBatches } from "./commercial-candidate-registry";

function candidate(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    slug,
    name: slug,
    manufacturer: "Example Robotics",
    model: slug,
    category: "mobile",
    officialProductUrl: `https://example.com/robots/${slug}`,
    lifecycle: "official_catalog_listing",
    retrievedAt: "2026-08-25T00:00:00.000Z",
    aliases: [],
    kind: "complete_robot",
    sourceAvailability: "closed_source",
    ...overrides,
  };
}

describe("validateCommercialCandidateBatches", () => {
  it("loads disjoint sorted batches and reports category/manufacturer counts", () => {
    const result = validateCommercialCandidateBatches([
      { name: "mobile-b.json", value: [candidate("beta", { manufacturer: "Beta Robotics" })] },
      { name: "mobile-a.json", value: [candidate("alpha", { manufacturer: "Alpha Robotics" })] },
    ], 2);
    expect(result.errors).toEqual([]);
    expect(result.files).toEqual(["mobile-a.json", "mobile-b.json"]);
    expect(result.candidateCount).toBe(2);
    expect(result.manufacturerCount).toBe(2);
    expect(result.categoryCounts).toEqual({ mobile: 2 });
  });

  it("detects duplicate identities across separate files", () => {
    const duplicate = candidate("duplicate");
    const result = validateCommercialCandidateBatches([
      { name: "a.json", value: [duplicate] },
      { name: "b.json", value: [duplicate] },
    ], 1);
    expect(result.errors.some((error) => error.includes("Duplicate case-insensitive slug"))).toBe(true);
    expect(result.errors.some((error) => error.includes("Duplicate canonical upstream identity"))).toBe(true);
  });

  it("rejects non-array batches and a registry below its minimum floor", () => {
    const result = validateCommercialCandidateBatches([
      { name: "invalid.json", value: { candidates: [candidate("alpha")] } },
    ], 400);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("must contain a JSON array"),
      expect.stringContaining("at least 400"),
    ]));
  });

  it("reports loader errors without throwing", () => {
    const result = validateCommercialCandidateBatches([
      { name: "broken.json", error: "Unexpected end of JSON input" },
    ], 1);
    expect(result.errors.some((error) => error.includes("cannot be parsed"))).toBe(true);
  });
});