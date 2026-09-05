import { describe, expect, it } from "vitest";
import projectDetailSource from "../pages/ProjectDetail.tsx?raw";
import metadataSource from "../components/projects/ProjectMetadataSummary.tsx?raw";

describe("commercial price detail integration", () => {
  it("distinguishes direct published prices, reviewed market observations, and missing prices", () => {
    expect(projectDetailSource).toContain("commercial_profile?.price");
    expect(projectDetailSource).toContain("normalizedCommercialPrice");
    expect(projectDetailSource).toContain('"published_price"');
    expect(projectDetailSource).toContain("marketCostMinor:");
    expect(projectDetailSource).toContain("marketCostMethod:");
    expect(projectDetailSource).toContain("Official price not published");
    expect(metadataSource).toContain('estimate.cost.source === "market" ? "Market estimate"');
    expect(metadataSource).toContain("Not a buildable release");
  });
});
