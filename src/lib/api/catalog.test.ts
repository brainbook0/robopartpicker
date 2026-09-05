import { describe, expect, it } from "vitest";
import { COMPONENTS_PAGE_SIZE, componentAlternativesPath, componentPath } from "./catalog";

describe("componentPath", () => {
  it("preserves live data-driven categories and API-backed page metadata", () => {
    expect(componentPath({ category: "electronics", page: 3, limit: 25 }))
      .toBe("/api/v1/components?category=electronics&page=3&limit=25");
  });

  it("clamps invalid page and oversized limits to the production contract", () => {
    const path = componentPath({ category: "connector", page: -2, limit: 500 });
    expect(path).toContain("category=connector");
    expect(path).toContain("page=1");
    expect(path).toContain(`limit=${COMPONENTS_PAGE_SIZE}`);
  });

  it("serializes server-side search, region, supplier, price, and stock filters", () => {
    const path = componentPath({
      category: "sensor",
      q: "lidar",
      manufacturerRegion: ["US", "EU"],
      supplierRegion: ["US"],
      supplier: ["supplier-1"],
      manufacturer: ["Acme Robotics"],
      minPrice: 10,
      maxPrice: 200,
      inStock: true,
    });
    expect(path).toContain("q=lidar");
    expect(path).toContain("manufacturerRegion=US%2CEU");
    expect(path).toContain("supplierRegion=US");
    expect(path).toContain("supplier=supplier-1");
    expect(path).toContain("manufacturer=Acme+Robotics");
    expect(path).toContain("minPrice=10");
    expect(path).toContain("maxPrice=200");
    expect(path).toContain("inStock=true");
  });
});

describe("componentAlternativesPath", () => {
  it("encodes the component identity and clamps the recommendation limit", () => {
    expect(componentAlternativesPath("motor/42", 50)).toBe("/api/v1/components/motor%2F42/alternatives?limit=10");
    expect(componentAlternativesPath("motor-42", 0)).toBe("/api/v1/components/motor-42/alternatives?limit=1");
  });
});
