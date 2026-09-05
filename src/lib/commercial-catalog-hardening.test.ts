import { describe, expect, it } from "vitest";
import {
  validateCommercialCandidate,
  validateCommercialCandidates,
  validateCommercialProfile,
} from "./commercial-catalog";

function candidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: "unitree-g1",
    name: "Unitree G1",
    manufacturer: "Unitree Robotics",
    model: "G1",
    category: "humanoid",
    officialProductUrl: "https://www.unitree.com/g1/",
    officialDocsUrl: "https://support.unitree.com/home/en/G1_developer",
    lifecycle: "active",
    retrievedAt: "2026-08-25T00:00:00.000Z",
    aliases: ["G1 humanoid"],
    kind: "complete_robot",
    sourceAvailability: "closed_source",
    ...overrides,
  };
}

function profile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...candidate(),
    description:
      "Unitree G1 is a complete commercial humanoid platform intended for embodied-intelligence research, development, and controlled deployment workflows.",
    useCases: ["Embodied-intelligence research"],
    specs: [{
      key: "height",
      label: "Height",
      value: 1.27,
      unit: "m",
      sourceUrl: "https://www.unitree.com/g1/",
      observedAt: "2026-08-25T00:00:00.000Z",
      confidence: 0.95,
    }],
    price: {
      kind: "published_price",
      currency: "USD",
      minMinor: 1600000,
      maxMinor: 1600000,
      confidence: 0.9,
      methodVersion: "published-price-v1",
      valuedAt: "2026-08-25T00:00:00.000Z",
      expiresAt: "2026-11-25T00:00:00.000Z",
      sourceUrls: ["https://shop.unitree.com/products/unitree-g1"],
    },
    trend: {
      rank: 1,
      searchInterest: 85,
      newsVelocity: 90,
      videoViewVelocity: 88,
      officialActivity: 80,
      firstPartyTraffic: null,
      trafficSampleSufficient: false,
      compositeScore: 86,
      methodologyVersion: "trend-v1",
      windowStart: "2025-08-25T00:00:00.000Z",
      windowEnd: "2026-08-25T00:00:00.000Z",
      capturedAt: "2026-08-25T00:00:00.000Z",
    },
    evidence: [{
      title: "Official G1 product page",
      sourceType: "official_product_page",
      sourceUrl: "https://www.unitree.com/g1/",
      retrievedAt: "2026-08-25T00:00:00.000Z",
      confidence: 0.95,
    }],
    media: [{
      kind: "product_image",
      sourceUrl: "https://www.unitree.com/images/g1-product.webp",
      retrievedAt: "2026-08-25T00:00:00.000Z",
      title: "Unitree G1 official product image",
      altText: "Unitree G1 humanoid robot standing upright",
      attribution: "Unitree Robotics",
    }],
    ...overrides,
  };
}

describe("commercial candidate hardening", () => {
  it("requires lowercase kebab-case slugs", () => {
    expect(validateCommercialCandidate(candidate({ slug: "Unitree G1" })).some((error) => error.includes("slug"))).toBe(true);
  });

  it("requires an explicit closed-source classification", () => {
    expect(validateCommercialCandidate(candidate({ sourceAvailability: "open_source" })).some((error) => error.includes("closed_source"))).toBe(true);
  });

  it("rejects blank, non-string, and duplicate aliases after case/whitespace normalization", () => {
    const errors = validateCommercialCandidate(candidate({ aliases: [" G1 ", "g1", "", 7] }));
    expect(errors.some((error) => error.includes("aliases"))).toBe(true);
  });

  it("runs individual validation inside batch validation", () => {
    expect(validateCommercialCandidates([candidate({ slug: "not valid" })]).some((error) => error.includes("slug"))).toBe(true);
  });

  it("rejects alias-to-alias collisions across candidates after normalization", () => {
    const errors = validateCommercialCandidates([
      candidate({ slug: "unitree-g1", officialProductUrl: "https://example.com/g1", aliases: [" General Humanoid "] }),
      candidate({ slug: "unitree-h1", model: "H1", officialProductUrl: "https://example.com/h1", aliases: ["general humanoid"] }),
    ]);
    expect(errors.some((error) => error.includes("Alias collision"))).toBe(true);
  });

  it("rejects duplicate manufacturer/model identities even when slugs and URLs differ", () => {
    const errors = validateCommercialCandidates([
      candidate({ slug: "unitree-g1-a", officialProductUrl: "https://example.com/g1-a" }),
      candidate({ slug: "unitree-g1-b", officialProductUrl: "https://example.com/g1-b" }),
    ]);
    expect(errors.some((error) => error.includes("manufacturer/model"))).toBe(true);
  });

  it("rejects calendar-invalid and non-RFC3339 timestamps", () => {
    expect(validateCommercialCandidate(candidate({ retrievedAt: "2026-02-30T00:00:00.000Z" })).some((error) => error.includes("retrievedAt"))).toBe(true);
    expect(validateCommercialCandidate(candidate({ retrievedAt: "August 25, 2026" })).some((error) => error.includes("retrievedAt"))).toBe(true);
  });
});

describe("commercial profile hardening", () => {
  it("accepts a complete source-backed profile", () => {
    expect(validateCommercialProfile(profile())).toEqual([]);
  });

  it("requires at least one spec and substantive use-case strings", () => {
    expect(validateCommercialProfile(profile({ specs: [] })).some((error) => error.includes("specs"))).toBe(true);
    expect(validateCommercialProfile(profile({ useCases: ["  "] })).some((error) => error.includes("useCases"))).toBe(true);
  });

  it("rejects blank spec identity/value and non-finite numeric values", () => {
    const blank = profile({ specs: [{ key: " ", label: " ", value: " ", sourceUrl: "https://example.com/spec", observedAt: "2026-08-25T00:00:00.000Z", confidence: 0.9 }] });
    const nonFinite = profile({ specs: [{ key: "mass", label: "Mass", value: Number.NaN, sourceUrl: "https://example.com/spec", observedAt: "2026-08-25T00:00:00.000Z", confidence: 0.9 }] });
    expect(validateCommercialProfile(blank).some((error) => error.includes("specs"))).toBe(true);
    expect(validateCommercialProfile(nonFinite).some((error) => error.includes("value"))).toBe(true);
  });

  it("rejects non-object spec entries without throwing", () => {
    expect(() => validateCommercialProfile(profile({ specs: [null] }))).not.toThrow();
    expect(validateCommercialProfile(profile({ specs: [null] })).some((error) => error.includes("specs[0]"))).toBe(true);
  });

  it("enforces USD safe nonnegative integer minor-unit prices", () => {
    for (const price of [
      { ...profile().price as object, currency: "EUR" },
      { ...profile().price as object, minMinor: -1 },
      { ...profile().price as object, minMinor: 10.5 },
      { ...profile().price as object, maxMinor: Number.POSITIVE_INFINITY },
    ]) {
      expect(validateCommercialProfile(profile({ price })).some((error) => error.includes("price"))).toBe(true);
    }
  });

  it("requires exact published prices and validates expiry ordering", () => {
    const unequal = { ...profile().price as object, minMinor: 100, maxMinor: 200 };
    const invalidExpiry = { ...profile().price as object, expiresAt: "2026-02-30T00:00:00.000Z" };
    const reversedExpiry = { ...profile().price as object, expiresAt: "2026-01-01T00:00:00.000Z" };
    expect(validateCommercialProfile(profile({ price: unequal })).some((error) => error.includes("published_price"))).toBe(true);
    expect(validateCommercialProfile(profile({ price: invalidExpiry })).some((error) => error.includes("expiresAt"))).toBe(true);
    expect(validateCommercialProfile(profile({ price: reversedExpiry })).some((error) => error.includes("expiresAt"))).toBe(true);
  });

  it("rejects a whitespace-only price methodology version", () => {
    const price = { ...profile().price as object, methodVersion: "   " };
    expect(validateCommercialProfile(profile({ price })).some((error) => error.includes("methodVersion"))).toBe(true);
  });

  it("validates every evidence declaration field", () => {
    const evidence = [{ title: " ", sourceType: " ", sourceUrl: "not-a-url", retrievedAt: "yesterday", confidence: Number.NaN }];
    expect(validateCommercialProfile(profile({ evidence })).some((error) => error.includes("evidence"))).toBe(true);
  });

  it("validates every product-media declaration field", () => {
    const media = [{ kind: "thumbnail", sourceUrl: "not-a-url", retrievedAt: "yesterday", title: " ", altText: " ", attribution: " " }];
    expect(validateCommercialProfile(profile({ media })).some((error) => error.includes("media"))).toBe(true);
  });

  it("requires all bounded trend signals, metadata, integer rank, and an ordered window", () => {
    const trend = {
      rank: 1.5,
      searchInterest: 101,
      newsVelocity: -1,
      videoViewVelocity: Number.NaN,
      officialActivity: 50,
      firstPartyTraffic: null,
      trafficSampleSufficient: true,
      compositeScore: 101,
      methodologyVersion: " ",
      windowStart: "2026-08-25T00:00:00.000Z",
      windowEnd: "2025-08-25T00:00:00.000Z",
      capturedAt: "not-a-date",
    };
    const errors = validateCommercialProfile(profile({ trend }));
    expect(errors.filter((error) => error.includes("trend")).length).toBeGreaterThanOrEqual(6);
  });

  it("allows absent first-party traffic only while its sample is insufficient", () => {
    expect(validateCommercialProfile(profile()).filter((error) => error.includes("firstPartyTraffic"))).toEqual([]);
    const trend = { ...profile().trend as object, trafficSampleSufficient: true, firstPartyTraffic: null };
    expect(validateCommercialProfile(profile({ trend })).some((error) => error.includes("firstPartyTraffic"))).toBe(true);
  });
});
