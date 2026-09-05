import { describe, expect, it } from "vitest";
import collectorSource from "../../scripts/collect-commercial-sources.ts?raw";
import publisherSource from "../../scripts/publish-commercial-top300.ts?raw";
import projectDetailSource from "../pages/ProjectDetail.tsx?raw";

describe("commercial pricing pipeline truth contract", () => {
  it("records absent pricing explicitly instead of generating category values", () => {
    expect(collectorSource).toContain('kind: "not_published"');
    expect(collectorSource).not.toContain("categoryMarketEstimateMinor");
    expect(collectorSource).not.toContain('methodVersion: "category-baseline-v1"');
  });

  it("prevents cached category baselines from being republished", () => {
    expect(publisherSource).toContain('profile.price.methodVersion !== "category-baseline-v1"');
    expect(publisherSource).toContain("estimated_cost_minor=excluded.estimated_cost_minor");
    expect(publisherSource).toContain("status='withdrawn'");
  });

  it("renders direct published commercial prices without treating them as build costs", () => {
    expect(projectDetailSource).toContain('["market_estimate", "published_price", "published_range"]');
    expect(projectDetailSource).toContain('label="Price"');
    expect(projectDetailSource).toContain('"Not a buildable release"');
  });
});
