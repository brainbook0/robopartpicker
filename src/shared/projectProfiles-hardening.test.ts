import { describe, expect, it } from "vitest";
import {
  evaluateCommercialProfileCompleteness,
  projectPriceFreshness,
  selectActiveProjectPriceEstimate,
  selectActiveTrendSnapshot,
} from "./projectProfiles";
import type { ProjectPriceEstimate, ProjectTrendSnapshot } from "./projectProfiles";

function estimate(overrides: Record<string, unknown> = {}): ProjectPriceEstimate {
  return {
    id: "estimate-1",
    project_id: "project-1",
    estimate_type: "market_estimate",
    currency: "USD",
    min_minor: 100_00,
    max_minor: 200_00,
    representative_minor: 150_00,
    confidence: "medium",
    method_version: "market-estimate-v1",
    summary: "Source-backed market range",
    valued_at: "2026-08-01T00:00:00.000Z",
    expires_at: "2026-11-01T00:00:00.000Z",
    status: "active",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  } as ProjectPriceEstimate;
}

function completeProfile() {
  return {
    identity: "Unitree G1",
    manufacturer: "Unitree Robotics",
    model: "G1",
    category: "humanoid",
    description: "A substantial source-backed commercial robot profile.",
    officialUrls: ["https://www.unitree.com/g1/"],
    lifecycle: "active",
    observedDate: "2026-08-25T00:00:00.000Z",
    specStates: ["Not publicly disclosed"],
    productMedia: [{ sourceUrl: "https://www.unitree.com/g1/image.webp" }],
    publicPriceOrEstimate: { kind: "published_price", minMinor: 1600000, maxMinor: 1600000 },
    trend: { rank: 1, compositeScore: 86 },
    evidence: [{ sourceUrl: "https://www.unitree.com/g1/" }],
  };
}

function trendSnapshot(overrides: Partial<ProjectTrendSnapshot> = {}): ProjectTrendSnapshot {
  return {
    id: "trend-1",
    project_id: "project-1",
    methodology_version: "trend-v1",
    window_start: "2025-08-25T00:00:00.000Z",
    window_end: "2026-08-25T00:00:00.000Z",
    search_score: 80,
    news_score: 70,
    video_score: 60,
    official_score: 50,
    first_party_traffic_score: null,
    traffic_sample_sufficient: false,
    composite_score: 68,
    rank: 1,
    active: true,
    captured_at: "2026-08-25T01:00:00.000Z",
    created_at: "2026-08-25T01:00:00.000Z",
    ...overrides,
  };
}

describe("project price selection hardening", () => {
  it("drops active estimates with invalid valued_at timestamps", () => {
    const valid = estimate({ id: "valid", valued_at: "2026-07-01T00:00:00.000Z" });
    const invalid = estimate({ id: "invalid", valued_at: "not-a-date" });
    expect(selectActiveProjectPriceEstimate([invalid, valid])?.id).toBe("valid");
    expect(selectActiveProjectPriceEstimate([invalid])).toBeNull();
  });

  it("ignores withdrawn estimates", () => {
    const active = estimate({ id: "active", valued_at: "2026-01-01T00:00:00.000Z" });
    const withdrawn = estimate({ id: "withdrawn", status: "withdrawn", valued_at: "2026-08-01T00:00:00.000Z" });
    expect(selectActiveProjectPriceEstimate([withdrawn, active])?.id).toBe("active");
  });

  it("marks a nullable expiry as refresh required", () => {
    expect(projectPriceFreshness(estimate({ expires_at: null }), new Date("2026-08-25T00:00:00.000Z")).freshness).toBe("refresh_required");
  });
});

describe("project trend selection", () => {
  it("returns the newest valid active snapshot and ignores newer historical snapshots", () => {
    const olderActive = trendSnapshot({ id: "active-old", captured_at: "2026-08-20T00:00:00.000Z" });
    const newerActive = trendSnapshot({ id: "active-new", captured_at: "2026-08-25T00:00:00.000Z" });
    const historical = trendSnapshot({ id: "historical", active: false, captured_at: "2026-08-26T00:00:00.000Z" });
    expect(selectActiveTrendSnapshot([historical, olderActive, newerActive])?.id).toBe("active-new");
  });

  it("returns null when active snapshots have invalid capture timestamps", () => {
    expect(selectActiveTrendSnapshot([trendSnapshot({ captured_at: "invalid" })])).toBeNull();
    expect(selectActiveTrendSnapshot([trendSnapshot({ active: false })])).toBeNull();
  });
});

describe("commercial profile completeness policy", () => {
  it("allows an explicit undisclosed technical specification state", () => {
    const result = evaluateCommercialProfileCompleteness(completeProfile());
    expect(result.complete).toBe(true);
    expect(result.fields.specStates).toBe("undisclosed");
  });

  it("does not let undisclosed markers satisfy identity, media, price, trend, or evidence", () => {
    const profile = completeProfile();
    const result = evaluateCommercialProfileCompleteness({
      ...profile,
      identity: "Not publicly disclosed",
      productMedia: "Not publicly disclosed",
      publicPriceOrEstimate: "Not publicly disclosed",
      trend: "Not publicly disclosed",
      evidence: "Not publicly disclosed",
    });
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining([
      "identity",
      "productMedia",
      "publicPriceOrEstimate",
      "trend",
      "evidence",
    ]));
  });

  it("does not let undisclosed markers satisfy manufacturer, model, category, description, URLs, lifecycle, or observation date", () => {
    const result = evaluateCommercialProfileCompleteness({
      ...completeProfile(),
      manufacturer: "Not publicly disclosed",
      model: "Not publicly disclosed",
      category: "Not publicly disclosed",
      description: "Not publicly disclosed",
      officialUrls: "Not publicly disclosed",
      lifecycle: "Not publicly disclosed",
      observedDate: "Not publicly disclosed",
    });
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining([
      "manufacturer",
      "model",
      "category",
      "description",
      "officialUrls",
      "lifecycle",
      "observedDate",
    ]));
  });

  it("does not treat structurally empty nested values as source-backed", () => {
    const result = evaluateCommercialProfileCompleteness({
      ...completeProfile(),
      officialUrls: ["  "],
      specStates: [null],
      productMedia: [{}],
      publicPriceOrEstimate: {},
      trend: { rank: null },
      evidence: [{ sourceUrl: "" }],
    });
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining([
      "officialUrls",
      "specStates",
      "productMedia",
      "publicPriceOrEstimate",
      "trend",
      "evidence",
    ]));
  });
});
