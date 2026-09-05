import { describe, expect, it } from "vitest";
import source from "../../scripts/publish-commercial-top300.ts?raw";
import gallerySource from "../../scripts/publish-commercial-galleries.ts?raw";

describe("top-300 commercial publication generator", () => {
  it("is idempotent, preserves upstream identity and publishes only normalized public data", () => {
    expect(source).toContain("ON CONFLICT(id) DO UPDATE");
    expect(source).toContain("resolveUpstreamIdentity");
    expect(source).toContain("project_price_estimates");
    expect(source).toContain("project_trend_snapshots");
    expect(source).toContain("evidence_claims");
    expect(source).toContain("project_media");
    expect(source).toContain("project_files");
    expect(source).toContain("traffic_sample_sufficient");
    expect(source).not.toContain("supplier_offers");
    expect(source).not.toContain("supplier_id");
  });

  it("requires at least three visible media records for every top-300 commercial project", () => {
    expect(gallerySource).toContain("projectsWithThree");
    expect(gallerySource).toContain("HAVING COUNT(*) >= 3");
  });
});
