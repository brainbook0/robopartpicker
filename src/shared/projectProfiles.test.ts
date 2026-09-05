import { describe, expect, it } from "vitest";
import {
  computeTrendComposite,
  effectiveTrendWeights,
  evaluateCommercialProfileCompleteness,
  projectPriceFreshness,
  selectActiveProjectPriceEstimate,
} from "./projectProfiles";
import type { ProjectPriceEstimate, TrendWeights } from "./projectProfiles";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEstimate(overrides: Partial<ProjectPriceEstimate> = {}): ProjectPriceEstimate {
  return {
    id: "est-1",
    project_id: "proj-1",
    estimate_type: "market_estimate",
    currency: "USD",
    min_minor: 1000_00,
    max_minor: 3000_00,
    representative_minor: 2000_00,
    confidence: "medium",
    method_version: "1.0.0",
    summary: "Estimated range",
    valued_at: "2025-01-15T00:00:00.000Z",
    expires_at: "2026-01-15T00:00:00.000Z",
    status: "active",
    created_at: "2025-01-15T00:00:00.000Z",
    updated_at: "2025-01-15T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// selectActiveProjectPriceEstimate
// ---------------------------------------------------------------------------

describe("selectActiveProjectPriceEstimate", () => {
  it("returns null for an empty array", () => {
    expect(selectActiveProjectPriceEstimate([])).toBeNull();
  });

  it("returns the only active estimate", () => {
    const e = makeEstimate();
    expect(selectActiveProjectPriceEstimate([e])).toBe(e);
  });

  it("returns null when no estimates have status active", () => {
    const superseded = makeEstimate({ id: "est-2", status: "superseded" });
    const withdrawn = makeEstimate({ id: "est-3", status: "withdrawn" });
    expect(selectActiveProjectPriceEstimate([superseded, withdrawn])).toBeNull();
  });

  it("selects the newest active estimate when multiple active estimates exist", () => {
    const older = makeEstimate({
      id: "est-old",
      valued_at: "2024-06-01T00:00:00.000Z",
    });
    const newer = makeEstimate({
      id: "est-new",
      valued_at: "2025-03-01T00:00:00.000Z",
    });
    const result = selectActiveProjectPriceEstimate([older, newer]);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("est-new");
  });

  it("ignores superseded estimates when multiple statuses exist", () => {
    const active1 = makeEstimate({
      id: "est-active-1",
      valued_at: "2024-06-01T00:00:00.000Z",
    });
    const superseded = makeEstimate({
      id: "est-superseded",
      status: "superseded",
      valued_at: "2025-06-01T00:00:00.000Z",
    });
    const activeNewer = makeEstimate({
      id: "est-active-2",
      valued_at: "2025-01-01T00:00:00.000Z",
    });
    const result = selectActiveProjectPriceEstimate([active1, superseded, activeNewer]);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("est-active-2");
  });

  it("still selects an active estimate even when its expires_at is in the past", () => {
    const expiredButActive = makeEstimate({
      id: "est-expired-active",
      valued_at: "2025-01-01T00:00:00.000Z",
      expires_at: "2025-06-01T00:00:00.000Z",
    });
    const result = selectActiveProjectPriceEstimate([expiredButActive]);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("est-expired-active");
  });

  it("handles invalid valued_at dates fail-closed by sorting them last", () => {
    const valid = makeEstimate({
      id: "est-valid",
      valued_at: "2025-01-01T00:00:00.000Z",
    });
    const invalid = makeEstimate({
      id: "est-invalid",
      valued_at: "not-a-date",
    });
    const result = selectActiveProjectPriceEstimate([invalid, valid]);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("est-valid");
  });

  it("handles all invalid dates by returning null", () => {
    const a = makeEstimate({ id: "est-a", valued_at: "bad" });
    const b = makeEstimate({ id: "est-b", valued_at: "also-bad" });
    const result = selectActiveProjectPriceEstimate([a, b]);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// projectPriceFreshness
// ---------------------------------------------------------------------------

describe("projectPriceFreshness", () => {
  it("labels current when expires_at is after asOf", () => {
    const estimate = makeEstimate({
      expires_at: "2026-06-01T00:00:00.000Z",
    });
    const result = projectPriceFreshness(estimate, new Date("2026-01-01T00:00:00.000Z"));
    expect(result.estimate).toBe(estimate);
    expect(result.freshness).toBe("current");
  });

  it("labels current when expires_at equals asOf (inclusive)", () => {
    const estimate = makeEstimate({
      expires_at: "2026-01-01T00:00:00.000Z",
    });
    const result = projectPriceFreshness(estimate, new Date("2026-01-01T00:00:00.000Z"));
    expect(result.freshness).toBe("current");
  });

  it("labels refresh_required when expires_at is before asOf", () => {
    const estimate = makeEstimate({
      expires_at: "2025-06-01T00:00:00.000Z",
    });
    const result = projectPriceFreshness(estimate, new Date("2026-01-01T00:00:00.000Z"));
    expect(result.estimate).toBe(estimate);
    expect(result.freshness).toBe("refresh_required");
  });

  it("defaults asOf to now when not provided", () => {
    const farFuture = makeEstimate({
      expires_at: "2099-01-01T00:00:00.000Z",
    });
    const result = projectPriceFreshness(farFuture);
    expect(result.freshness).toBe("current");
  });

  it("handles invalid expires_at fail-closed as refresh_required", () => {
    const estimate = makeEstimate({
      expires_at: "not-a-date",
    });
    const result = projectPriceFreshness(estimate, new Date("2026-01-01T00:00:00.000Z"));
    // Fail-closed: treat unparseable date as already expired
    expect(result.freshness).toBe("refresh_required");
  });

  it("handles invalid asOf fail-closed as refresh_required", () => {
    const estimate = makeEstimate({
      expires_at: "2026-01-01T00:00:00.000Z",
    });
    const result = projectPriceFreshness(estimate, new Date("invalid"));
    // Fail-closed: invalid asOf means we cannot assert current-ness
    expect(result.freshness).toBe("refresh_required");
  });
});

// ---------------------------------------------------------------------------
// effectiveTrendWeights
// ---------------------------------------------------------------------------

describe("effectiveTrendWeights", () => {
  it("returns fixed weights when traffic sample is sufficient", () => {
    const weights: TrendWeights = effectiveTrendWeights(true);
    expect(weights).toEqual({
      search: 0.35,
      news: 0.25,
      video: 0.20,
      official: 0.10,
      firstParty: 0.10,
    });
  });

  it("redistributes firstParty weight proportionally when insufficient", () => {
    const weights = effectiveTrendWeights(false);
    // firstParty should be 0
    expect(weights.firstParty).toBe(0);
    // All other weights should be larger than base
    expect(weights.search).toBeGreaterThan(0.35);
    expect(weights.news).toBeGreaterThan(0.25);
    expect(weights.video).toBeGreaterThan(0.20);
    expect(weights.official).toBeGreaterThan(0.10);
  });

  it("weights total exactly 1 when sufficient", () => {
    const weights = effectiveTrendWeights(true);
    const total = weights.search + weights.news + weights.video + weights.official + weights.firstParty;
    expect(total).toBe(1);
  });

  it("weights total approximately 1 when insufficient (floating-point)", () => {
    const weights = effectiveTrendWeights(false);
    const total = weights.search + weights.news + weights.video + weights.official + weights.firstParty;
    expect(total).toBeCloseTo(1, 10);
  });

  it("preserves the relative proportions of the first four weights when redistributing", () => {
    const weights = effectiveTrendWeights(false);
    // The ratios between the first four weights should be preserved:
    // search/news = 0.35/0.25 = 1.4
    // search/video = 0.35/0.20 = 1.75
    // search/official = 0.35/0.10 = 3.5
    expect(weights.search / weights.news).toBeCloseTo(0.35 / 0.25, 10);
    expect(weights.search / weights.video).toBeCloseTo(0.35 / 0.20, 10);
    expect(weights.search / weights.official).toBeCloseTo(0.35 / 0.10, 10);
  });
});

// ---------------------------------------------------------------------------
// computeTrendComposite
// ---------------------------------------------------------------------------

describe("computeTrendComposite", () => {
  const sufficientWeights = effectiveTrendWeights(true);

  it("returns 0 when all signals are 0", () => {
    expect(
      computeTrendComposite(
        { search: 0, news: 0, video: 0, official: 0, firstParty: 0 },
        sufficientWeights,
      ),
    ).toBe(0);
  });

  it("returns 100 when all signals are 100", () => {
    expect(
      computeTrendComposite(
        { search: 100, news: 100, video: 100, official: 100, firstParty: 100 },
        sufficientWeights,
      ),
    ).toBe(100);
  });

  it("computes weighted sum correctly for mixed signals", () => {
    const composite = computeTrendComposite(
      { search: 80, news: 60, video: 50, official: 40, firstParty: 20 },
      sufficientWeights,
    );
    // Expected: 80*0.35 + 60*0.25 + 50*0.20 + 40*0.10 + 20*0.10
    // = 28 + 15 + 10 + 4 + 2 = 59
    expect(composite).toBeCloseTo(59, 10);
  });

  it("works with insufficient-traffic redistributed weights", () => {
    const insufficientWeights = effectiveTrendWeights(false);
    const composite = computeTrendComposite(
      { search: 80, news: 60, video: 50, official: 40, firstParty: 20 },
      insufficientWeights,
    );
    // firstParty weight is 0, so the 20 signal doesn't count
    const expected =
      80 * insufficientWeights.search +
      60 * insufficientWeights.news +
      50 * insufficientWeights.video +
      40 * insufficientWeights.official;
    expect(composite).toBeCloseTo(expected, 10);
    // Also verify it's a number between 0-100
    expect(composite).toBeGreaterThanOrEqual(0);
    expect(composite).toBeLessThanOrEqual(100);
  });

  it("scales correctly when signals are at different positions in 0-100 range", () => {
    const composite = computeTrendComposite(
      { search: 50, news: 50, video: 50, official: 50, firstParty: 50 },
      sufficientWeights,
    );
    // 50 * (0.35+0.25+0.20+0.10+0.10) = 50 * 1.0 = 50
    expect(composite).toBeCloseTo(50, 10);
  });
});

// ---------------------------------------------------------------------------
// evaluateCommercialProfileCompleteness
// ---------------------------------------------------------------------------

describe("evaluateCommercialProfileCompleteness", () => {
  it("returns complete when all required fields are source-backed", () => {
    const result = evaluateCommercialProfileCompleteness({
      identity: "Boston Dynamics Spot",
      manufacturer: "Boston Dynamics",
      model: "Spot",
      category: "Quadruped",
      description: "An agile mobile robot",
      officialUrls: ["https://bostondynamics.com/products/spot"],
      lifecycle: "active",
      observedDate: "2025-08-01",
      specStates: { payload: "14 kg", speed: "1.6 m/s" },
      productMedia: [{ url: "/media/spot.jpg", altText: "Spot robot" }],
      publicPriceOrEstimate: { type: "published_price", min: 74500, max: 74500 },
      trend: { composite: 85, rank: 1 },
      evidence: [{ claim: "price", source: "https://shop.bostondynamics.com/spot" }],
    });
    expect(result.complete).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("returns complete when technical specifications are explicitly undisclosed", () => {
    const result = evaluateCommercialProfileCompleteness({
      identity: "Secret Robot X",
      manufacturer: "Secret Corp",
      model: "X-100",
      category: "Humanoid",
      description: "A source-backed commercial robot profile.",
      officialUrls: ["https://example.com/robot-x"],
      lifecycle: "active",
      observedDate: "2026-08-25T00:00:00.000Z",
      specStates: "Not publicly disclosed",
      productMedia: [{ sourceUrl: "https://example.com/robot-x.jpg" }],
      publicPriceOrEstimate: { kind: "market_estimate" },
      trend: { composite: 0, rank: null },
      evidence: [{ sourceUrl: "https://example.com/robot-x" }],
    });
    expect(result.complete).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("marks missing fields when required fields are absent or empty", () => {
    const result = evaluateCommercialProfileCompleteness({
      identity: "",
      manufacturer: "",
      model: "",
      category: "",
      description: "",
      officialUrls: [],
      lifecycle: "",
      observedDate: "",
      specStates: {},
      productMedia: [],
      publicPriceOrEstimate: null,
      trend: null,
      evidence: [],
    });
    expect(result.complete).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it("distinguishes source-backed, undisclosed-permitted, and missing for each field", () => {
    const result = evaluateCommercialProfileCompleteness({
      identity: "Atlas",
      manufacturer: "Boston Dynamics",
      model: "Not publicly disclosed",
      category: "Humanoid",
      description: "Not publicly disclosed",
      officialUrls: ["https://bostondynamics.com/atlas"],
      lifecycle: "active",
      observedDate: "2025-08-01",
      specStates: "Not publicly disclosed",
      productMedia: "Not publicly disclosed",
      publicPriceOrEstimate: "Not publicly disclosed",
      trend: null, // missing
      evidence: ["Not publicly disclosed"], // undisclosed
    });

    expect(result.fields.identity).toBe("source-backed");
    expect(result.fields.manufacturer).toBe("source-backed");
    expect(result.fields.model).toBe("undisclosed");
    expect(result.fields.category).toBe("source-backed");
    expect(result.fields.description).toBe("undisclosed");
    expect(result.fields.officialUrls).toBe("source-backed");
    expect(result.fields.lifecycle).toBe("source-backed");
    expect(result.fields.observedDate).toBe("source-backed");
    expect(result.fields.specStates).toBe("undisclosed");
    expect(result.fields.productMedia).toBe("undisclosed");
    expect(result.fields.publicPriceOrEstimate).toBe("undisclosed");
    expect(result.fields.trend).toBe("missing");
    expect(result.fields.evidence).toBe("undisclosed");
  });

  it("returns missing list with all missing field names", () => {
    const result = evaluateCommercialProfileCompleteness({
      identity: "",
      manufacturer: "",
      model: "",
      category: "",
      description: "",
      officialUrls: null,
      lifecycle: "",
      observedDate: null,
      specStates: null,
      productMedia: null,
      publicPriceOrEstimate: null,
      trend: null,
      evidence: null,
    });
    expect(result.complete).toBe(false);
    // All required fields should be in the missing list
    const requiredFields = [
      "identity",
      "manufacturer",
      "model",
      "category",
      "description",
      "officialUrls",
      "lifecycle",
      "observedDate",
      "specStates",
      "productMedia",
      "publicPriceOrEstimate",
      "trend",
      "evidence",
    ];
    for (const field of requiredFields) {
      expect(result.missing).toContain(field);
    }
    expect(result.missing.length).toBe(requiredFields.length);
  });
});