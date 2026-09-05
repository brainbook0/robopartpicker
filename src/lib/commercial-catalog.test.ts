import { describe, expect, it } from "vitest";
import {
  commercialCatalogProjectId,
  commercialCatalogProfileId,
  validateCommercialCandidate,
  validateCommercialCandidates,
  validateCommercialProfile,
  assertCommercialCandidate,
  assertCommercialProfile,
  type CommercialCandidate,
  type CommercialProfile,
  type CommercialSpec,
  type CommercialPrice,
  type CommercialPricedValue,
  type CommercialTrend,
  type CommercialEvidence,
  type CommercialMediaDeclaration,
} from "./commercial-catalog";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validCandidate(overrides: Partial<CommercialCandidate> = {}): CommercialCandidate {
  return {
    slug: "spot-enterprise",
    name: "Spot Enterprise",
    manufacturer: "Boston Dynamics",
    model: "Spot Enterprise",
    category: "quadruped",
    officialProductUrl: "https://bostondynamics.com/products/spot/enterprise",
    lifecycle: "active",
    retrievedAt: "2026-08-20T12:00:00.000Z",
    aliases: ["spot", "spot-robot"],
    kind: "complete_robot",
    sourceAvailability: "closed_source",
    ...overrides,
  };
}

function validProfile(overrides: Partial<CommercialProfile> = {}): CommercialProfile {
  return {
    ...validCandidate(),
    description:
      "Boston Dynamics Spot Enterprise is a rugged quadruped robot designed for industrial inspection, remote sensing, and autonomous data collection in challenging environments such as construction sites, power plants, and offshore platforms.",
    useCases: [
      "Industrial inspection and monitoring",
      "Remote sensing and data collection",
      "Construction site progress tracking",
    ],
    specs: [
      {
        key: "payload-capacity",
        label: "Payload Capacity",
        value: "14 kg",
        unit: "kg",
        sourceUrl: "https://bostondynamics.com/products/spot/specs",
        observedAt: "2026-08-20T12:00:00.000Z",
        confidence: 0.95,
      },
    ],
    price: {
      kind: "published_price",
      currency: "USD",
      minMinor: 7450000, // $74,500.00 in minor units (cents)
      maxMinor: 7450000,
      confidence: 0.9,
      methodVersion: "1.0.0",
      valuedAt: "2026-08-20T12:00:00.000Z",
      sourceUrls: ["https://bostondynamics.com/products/spot/pricing"],
    },
    trend: {
      rank: 15,
      searchInterest: 85,
      newsVelocity: 80,
      videoViewVelocity: 75,
      officialActivity: 90,
      firstPartyTraffic: null,
      trafficSampleSufficient: false,
      compositeScore: 83,
      methodologyVersion: "weighted-composite-v1",
      windowStart: "2025-08-20T12:00:00.000Z",
      windowEnd: "2026-08-20T12:00:00.000Z",
      capturedAt: "2026-08-20T12:00:00.000Z",
    },
    evidence: [
      {
        title: "Official Spot Enterprise product page",
        sourceType: "official-vendor-page",
        sourceUrl: "https://bostondynamics.com/products/spot/enterprise",
        retrievedAt: "2026-08-20T12:00:00.000Z",
        confidence: 0.95,
      },
    ],
    media: [
      {
        kind: "product_image",
        sourceUrl: "https://bostondynamics.com/images/spot-enterprise.jpg",
        retrievedAt: "2026-08-20T12:00:00.000Z",
        title: "Spot Enterprise product photo",
        altText: "Boston Dynamics Spot Enterprise quadruped robot",
        attribution: "Boston Dynamics",
      },
    ],
    ...overrides,
  };
}

describe("commercial price truth states", () => {
  it("accepts an explicit not-published state without numeric price fields", () => {
    const record = validProfile({ price: {
      kind: "not_published",
      confidence: 0.9,
      methodVersion: "official-page-price-status-v1",
      valuedAt: "2026-08-20T12:00:00.000Z",
      sourceUrls: ["https://bostondynamics.com/products/spot/enterprise"],
      summary: "No source-backed price is recorded for this model.",
    } });
    expect(validateCommercialProfile(record)).toEqual([]);
  });

  it("rejects numeric fields on a not-published price state", () => {
    const record = validProfile({ price: {
      kind: "not_published", confidence: 0.9, methodVersion: "official-page-price-status-v1",
      valuedAt: "2026-08-20T12:00:00.000Z", sourceUrls: ["https://bostondynamics.com/products/spot/enterprise"],
      summary: "No source-backed price is recorded.", minMinor: 1,
    } as CommercialPrice });
    expect(validateCommercialProfile(record).join(" ")).toMatch(/must not contain currency or numeric price fields/iu);
  });
});

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

describe("commercialCatalogProjectId", () => {
  it("produces a deterministic stable ID from the candidate slug", () => {
    const c = validCandidate({ slug: "spot-enterprise" });
    const id = commercialCatalogProjectId(c);
    expect(id).toBeTypeOf("string");
    expect(id.startsWith("proj_")).toBe(true);
    expect(id.length).toBeLessThanOrEqual(5 + 32); // prefix_32hex
  });

  it("produces different IDs for different slugs", () => {
    const a = validCandidate({ slug: "atlas" });
    const b = validCandidate({ slug: "spot-enterprise" });
    expect(commercialCatalogProjectId(a)).not.toBe(commercialCatalogProjectId(b));
  });

  it("produces the same ID for the same slug regardless of other fields", () => {
    const a = validCandidate({ slug: "atlas" });
    const b = validCandidate({ slug: "atlas", name: "Atlas (different name)" });
    expect(commercialCatalogProjectId(a)).toBe(commercialCatalogProjectId(b));
  });
});

describe("commercialCatalogProfileId", () => {
  it("produces a deterministic stable ID from the project ID", () => {
    const projectId = commercialCatalogProjectId(validCandidate({ slug: "spot-enterprise" }));
    const profileId = commercialCatalogProfileId(projectId);
    expect(profileId).toBeTypeOf("string");
    expect(profileId.startsWith("prof_")).toBe(true);
  });

  it("produces different IDs for different project IDs", () => {
    const p1 = commercialCatalogProjectId(validCandidate({ slug: "atlas" }));
    const p2 = commercialCatalogProjectId(validCandidate({ slug: "spot-enterprise" }));
    expect(commercialCatalogProfileId(p1)).not.toBe(commercialCatalogProfileId(p2));
  });
});

// ---------------------------------------------------------------------------
// validateCommercialCandidate
// ---------------------------------------------------------------------------

describe("validateCommercialCandidate", () => {
  it("accepts a fully valid candidate with no errors", () => {
    expect(validateCommercialCandidate(validCandidate())).toEqual([]);
  });

  it("rejects null / non-object input", () => {
    expect(validateCommercialCandidate(null)).toContainEqual(
      expect.stringContaining("non-null object"),
    );
    expect(validateCommercialCandidate(undefined)).toContainEqual(
      expect.stringContaining("non-null object"),
    );
    expect(validateCommercialCandidate("not an object")).toContainEqual(
      expect.stringContaining("non-null object"),
    );
  });

  it("rejects missing slug", () => {
    const c = validCandidate({ slug: "" });
    expect(validateCommercialCandidate(c)).toContainEqual(
      expect.stringContaining("slug"),
    );
  });

  it("rejects missing name", () => {
    const c = validCandidate({ name: "" });
    expect(validateCommercialCandidate(c)).toContainEqual(
      expect.stringContaining("name"),
    );
  });

  it("rejects missing manufacturer", () => {
    const c = validCandidate({ manufacturer: "" });
    expect(validateCommercialCandidate(c)).toContainEqual(
      expect.stringContaining("manufacturer"),
    );
  });

  it("rejects missing model", () => {
    const c = validCandidate({ model: "" });
    expect(validateCommercialCandidate(c)).toContainEqual(
      expect.stringContaining("model"),
    );
  });

  it("rejects invalid category (not in ROBOT_CATEGORIES)", () => {
    const c = validCandidate({ category: "spaceship" as never });
    expect(validateCommercialCandidate(c)).toContainEqual(
      expect.stringContaining("category"),
    );
  });

  it("accepts every valid ROBOT_CATEGORY", () => {
    const categories = [
      "humanoid", "manipulator", "gripper", "quadruped", "hexapod",
      "mobile", "aerial", "biped", "exoskeleton", "head",
      "actuator", "underwater", "other",
    ] as const;
    for (const cat of categories) {
      expect(validateCommercialCandidate(validCandidate({ category: cat }))).toEqual([]);
    }
  });

  it("rejects kind that is not complete_robot", () => {
    const c = validCandidate({ kind: "component" as never });
    const errors = validateCommercialCandidate(c);
    expect(errors.some((e) => e.includes("complete_robot"))).toBe(true);
  });

  it("rejects invalid officialProductUrl (not HTTP/HTTPS)", () => {
    const c = validCandidate({ officialProductUrl: "ftp://example.com/product" });
    expect(validateCommercialCandidate(c)).toContainEqual(
      expect.stringContaining("officialProductUrl"),
    );
  });

  it("rejects empty officialProductUrl", () => {
    const c = validCandidate({ officialProductUrl: "" });
    expect(validateCommercialCandidate(c)).toContainEqual(
      expect.stringContaining("officialProductUrl"),
    );
  });

  it("accepts missing officialDocsUrl", () => {
    const c: Record<string, unknown> = { ...validCandidate() } as unknown as Record<string, unknown>;
    delete c.officialDocsUrl;
    expect(validateCommercialCandidate(c)).toEqual([]);
  });

  it("accepts valid officialDocsUrl", () => {
    const c = validCandidate({ officialDocsUrl: "https://docs.example.com/spot" });
    expect(validateCommercialCandidate(c)).toEqual([]);
  });

  it("rejects invalid officialDocsUrl", () => {
    const c = validCandidate({ officialDocsUrl: "not-a-url" });
    expect(validateCommercialCandidate(c)).toContainEqual(
      expect.stringContaining("officialDocsUrl"),
    );
  });

  it("rejects missing lifecycle", () => {
    const c = validCandidate({ lifecycle: "" });
    expect(validateCommercialCandidate(c)).toContainEqual(
      expect.stringContaining("lifecycle"),
    );
  });

  it("rejects missing retrievedAt", () => {
    const c = validCandidate({ retrievedAt: "" });
    expect(validateCommercialCandidate(c)).toContainEqual(
      expect.stringContaining("retrievedAt"),
    );
  });

  it("rejects malformed retrievedAt date", () => {
    const c = validCandidate({ retrievedAt: "not-a-date" });
    expect(validateCommercialCandidate(c)).toContainEqual(
      expect.stringContaining("retrievedAt"),
    );
  });

  it("rejects non-array aliases", () => {
    const c = validCandidate({ aliases: "not-array" as never });
    expect(validateCommercialCandidate(c)).toContainEqual(
      expect.stringContaining("aliases"),
    );
  });
});

// ---------------------------------------------------------------------------
// validateCommercialCandidates (batch)
// ---------------------------------------------------------------------------

describe("validateCommercialCandidates", () => {
  it("accepts a single valid candidate", () => {
    expect(validateCommercialCandidates([validCandidate()])).toEqual([]);
  });

  it("accepts multiple distinct valid candidates", () => {
    expect(
      validateCommercialCandidates([
        validCandidate({ slug: "atlas", model: "Atlas", officialProductUrl: "https://example.com/atlas", aliases: ["atlas-electric"] }),
        validCandidate({ slug: "spot-enterprise", model: "Spot Enterprise", officialProductUrl: "https://example.com/spot", aliases: ["spot-robot"] }),
      ]),
    ).toEqual([]);
  });

  it("rejects non-array input", () => {
    expect(validateCommercialCandidates(null)).toContainEqual(
      expect.stringContaining("array"),
    );
  });

  it("rejects duplicate case-insensitive slug", () => {
    const errors = validateCommercialCandidates([
      validCandidate({ slug: "spot", officialProductUrl: "https://a.example.com" }),
      validCandidate({ slug: "SPOT", officialProductUrl: "https://b.example.com" }),
    ]);
    expect(errors.some((e) => e.includes("Duplicate") && e.includes("slug"))).toBe(true);
  });

  it("rejects duplicate canonical upstream identity (same URL)", () => {
    const url = "https://bostondynamics.com/products/spot";
    const errors = validateCommercialCandidates([
      validCandidate({ slug: "spot-v1", officialProductUrl: url }),
      validCandidate({ slug: "spot-v2", officialProductUrl: url }),
    ]);
    expect(errors.some((e) => e.includes("Duplicate") && e.includes("upstream"))).toBe(true);
  });

  it("rejects duplicate canonical upstream identity (trailing slash normalised)", () => {
    const errors = validateCommercialCandidates([
      validCandidate({
        slug: "a",
        officialProductUrl: "https://example.com/product/",
      }),
      validCandidate({
        slug: "b",
        officialProductUrl: "https://example.com/product",
      }),
    ]);
    expect(errors.some((e) => e.includes("Duplicate") && e.includes("upstream"))).toBe(true);
  });

  it("rejects duplicate canonical upstream identity (query stripped)", () => {
    const errors = validateCommercialCandidates([
      validCandidate({
        slug: "a",
        officialProductUrl: "https://example.com/product?ref=home",
      }),
      validCandidate({
        slug: "b",
        officialProductUrl: "https://example.com/product?ref=search",
      }),
    ]);
    expect(errors.some((e) => e.includes("Duplicate") && e.includes("upstream"))).toBe(true);
  });

  it("rejects alias collision (alias matches another candidate slug)", () => {
    const errors = validateCommercialCandidates([
      validCandidate({
        slug: "atlas",
        officialProductUrl: "https://a.example.com",
        aliases: [],
      }),
      validCandidate({
        slug: "other",
        officialProductUrl: "https://b.example.com",
        aliases: ["atlas"],
      }),
    ]);
    expect(errors.some((e) => e.includes("Alias"))).toBe(true);
  });

  it("allows material variants with distinct slug AND distinct official URL", () => {
    expect(
      validateCommercialCandidates([
        validCandidate({
          slug: "ur5",
          manufacturer: "Universal Robots",
          model: "UR5",
          officialProductUrl: "https://example.com/ur5",
          aliases: ["ur-5"],
        }),
        validCandidate({
          slug: "ur5e",
          manufacturer: "Universal Robots",
          model: "UR5e",
          officialProductUrl: "https://example.com/ur5e",
          aliases: ["ur-5e"],
        }),
      ]),
    ).toEqual([]);
  });

  it("rejects material variants with same manufacturer+model and identical slug", () => {
    const errors = validateCommercialCandidates([
      validCandidate({
        slug: "ur5",
        manufacturer: "Universal Robots",
        model: "UR5",
        officialProductUrl: "https://a.example.com",
      }),
      validCandidate({
        slug: "ur5",
        manufacturer: "Universal Robots",
        model: "UR5",
        officialProductUrl: "https://b.example.com",
      }),
    ]);
    // Same slug = already caught by duplicate slug check
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects material variants with same manufacturer+model and identical upstream", () => {
    const errors = validateCommercialCandidates([
      validCandidate({
        slug: "ur5-v1",
        manufacturer: "Universal Robots",
        model: "UR5",
        officialProductUrl: "https://example.com/ur5",
      }),
      validCandidate({
        slug: "ur5-v2",
        manufacturer: "Universal Robots",
        model: "UR5",
        officialProductUrl: "https://example.com/ur5",
      }),
    ]);
    expect(errors.some((e) => e.includes("variant"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateCommercialProfile
// ---------------------------------------------------------------------------

describe("validateCommercialProfile", () => {
  it("accepts a fully valid profile with no errors", () => {
    expect(validateCommercialProfile(validProfile())).toEqual([]);
  });

  // Candidate-level checks still apply
  it("rejects a profile whose candidate fields are invalid", () => {
    const p = validProfile({ slug: "" });
    expect(validateCommercialProfile(p).length).toBeGreaterThan(0);
  });

  it("rejects short description (under 50 characters)", () => {
    const p = validProfile({ description: "Too short." });
    expect(validateCommercialProfile(p)).toContainEqual(
      expect.stringContaining("description"),
    );
  });

  it("rejects missing description", () => {
    const p = validProfile({ description: "" });
    expect(validateCommercialProfile(p)).toContainEqual(
      expect.stringContaining("description"),
    );
  });

  it("rejects empty useCases", () => {
    const p = validProfile({ useCases: [] });
    expect(validateCommercialProfile(p)).toContainEqual(
      expect.stringContaining("useCases"),
    );
  });

  it("rejects missing useCases", () => {
    const p: Record<string, unknown> = { ...validProfile() } as unknown as Record<string, unknown>;
    p.useCases = undefined;
    expect(validateCommercialProfile(p)).toContainEqual(
      expect.stringContaining("useCases"),
    );
  });

  it("rejects missing product media", () => {
    const p = validProfile({ media: [] });
    expect(validateCommercialProfile(p)).toContainEqual(
      expect.stringContaining("media"),
    );
  });

  it("accepts a labeled identity illustration when an exact product image is unavailable", () => {
    const p = validProfile();
    p.media[0] = { ...p.media[0], kind: "identity_illustration", title: "Identity illustration", altText: "Identity illustration, not a product photograph" };
    expect(validateCommercialProfile(p)).toEqual([]);
  });

  it("rejects missing evidence", () => {
    const p = validProfile({ evidence: [] });
    expect(validateCommercialProfile(p)).toContainEqual(
      expect.stringContaining("evidence"),
    );
  });

  describe("spec validation", () => {
    it("rejects spec with both value and undisclosed=true", () => {
      const p = validProfile({
        specs: [
          {
            key: "payload",
            label: "Payload",
            value: "10kg",
            undisclosed: true,
            sourceUrl: "https://example.com",
            observedAt: "2026-08-20T12:00:00.000Z",
            confidence: 0.9,
          },
        ],
      });
      expect(validateCommercialProfile(p)).toContainEqual(
        expect.stringContaining("both value and undisclosed"),
      );
    });

    it("rejects spec with neither value nor undisclosed", () => {
      const p = validProfile({
        specs: [
          {
            key: "payload",
            label: "Payload",
            sourceUrl: "https://example.com",
            observedAt: "2026-08-20T12:00:00.000Z",
            confidence: 0.9,
          } as CommercialSpec,
        ],
      });
      expect(validateCommercialProfile(p)).toContainEqual(
        expect.stringContaining("either value or undisclosed"),
      );
    });

    it("accepts explicit undisclosed spec", () => {
      const p = validProfile({
        specs: [
          {
            key: "payload",
            label: "Payload Capacity",
            undisclosed: true,
            sourceUrl: "https://example.com",
            observedAt: "2026-08-20T12:00:00.000Z",
            confidence: 0.9,
          },
        ],
      });
      const errors = validateCommercialProfile(p);
      expect(errors.filter((e) => e.includes("spec"))).toEqual([]);
    });

    it("rejects spec with missing sourceUrl", () => {
      const p = validProfile({
        specs: [
          {
            key: "payload",
            label: "Payload",
            value: "10kg",
            sourceUrl: "",
            observedAt: "2026-08-20T12:00:00.000Z",
            confidence: 0.9,
          },
        ],
      });
      expect(
        validateCommercialProfile(p).some((e) => e.includes("sourceUrl")),
      ).toBe(true);
    });

    it("rejects spec with invalid confidence", () => {
      const p = validProfile({
        specs: [
          {
            key: "payload",
            label: "Payload",
            value: "10kg",
            sourceUrl: "https://example.com",
            observedAt: "2026-08-20T12:00:00.000Z",
            confidence: 1.5,
          },
        ],
      });
      expect(
        validateCommercialProfile(p).some((e) => e.includes("confidence")),
      ).toBe(true);
    });

    it("rejects spec with confidence <= 0", () => {
      const p = validProfile({
        specs: [
          {
            key: "payload",
            label: "Payload",
            value: "10kg",
            sourceUrl: "https://example.com",
            observedAt: "2026-08-20T12:00:00.000Z",
            confidence: 0,
          },
        ],
      });
      expect(
        validateCommercialProfile(p).some((e) => e.includes("confidence")),
      ).toBe(true);
    });

    it("rejects spec with malformed observedAt", () => {
      const p = validProfile({
        specs: [
          {
            key: "payload",
            label: "Payload",
            value: "10kg",
            sourceUrl: "https://example.com",
            observedAt: "not-a-date",
            confidence: 0.9,
          },
        ],
      });
      expect(
        validateCommercialProfile(p).some((e) => e.includes("observedAt")),
      ).toBe(true);
    });
  });

  describe("price validation", () => {
    it("rejects price with minMinor > maxMinor", () => {
      const p = validProfile({
        price: {
          ...(validProfile().price as CommercialPricedValue),
          minMinor: 10000,
          maxMinor: 5000,
        },
      });
      expect(
        validateCommercialProfile(p).some((e) => e.includes("minMinor")),
      ).toBe(true);
    });

    it("rejects price with missing sourceUrls", () => {
      const p = validProfile({
        price: {
          ...(validProfile().price as CommercialPricedValue),
          sourceUrls: [],
        },
      });
      expect(
        validateCommercialProfile(p).some(
          (e) => e.includes("sourceUrls") && e.includes("price"),
        ),
      ).toBe(true);
    });

    it("rejects price with invalid confidence", () => {
      const p = validProfile({
        price: {
          ...(validProfile().price as CommercialPricedValue),
          confidence: 2.0,
        },
      });
      expect(
        validateCommercialProfile(p).some(
          (e) => e.includes("price") && e.includes("confidence"),
        ),
      ).toBe(true);
    });

    it("rejects price with malformed valuedAt", () => {
      const p = validProfile({
        price: {
          ...(validProfile().price as CommercialPricedValue),
          valuedAt: "yesterday",
        },
      });
      expect(
        validateCommercialProfile(p).some(
          (e) => e.includes("valuedAt"),
        ),
      ).toBe(true);
    });

    it("rejects price with invalid sourceUrl", () => {
      const p = validProfile({
        price: {
          ...(validProfile().price as CommercialPricedValue),
          sourceUrls: ["not-a-url"],
        },
      });
      expect(
        validateCommercialProfile(p).some(
          (e) => e.includes("price") && e.includes("sourceUrls"),
        ),
      ).toBe(true);
    });

    it("rejects price with invalid kind", () => {
      const p = validProfile({
        price: {
          ...(validProfile().price as CommercialPricedValue),
          kind: "made_up" as never,
        },
      });
      expect(
        validateCommercialProfile(p).some(
          (e) => e.includes("price") && e.includes("kind"),
        ),
      ).toBe(true);
    });
  });

  describe("trend validation", () => {
    it("rejects rank below 1", () => {
      const p = validProfile({
        trend: { ...validProfile().trend, rank: 0 },
      });
      expect(
        validateCommercialProfile(p).some((e) => e.includes("rank")),
      ).toBe(true);
    });

    it("rejects rank above 300", () => {
      const p = validProfile({
        trend: { ...validProfile().trend, rank: 301 },
      });
      expect(
        validateCommercialProfile(p).some((e) => e.includes("rank")),
      ).toBe(true);
    });

    it("accepts rank at boundary 1", () => {
      const p = validProfile({
        trend: { ...validProfile().trend, rank: 1 },
      });
      expect(validateCommercialProfile(p)).toEqual([]);
    });

    it("accepts rank at boundary 300", () => {
      const p = validProfile({
        trend: { ...validProfile().trend, rank: 300 },
      });
      expect(validateCommercialProfile(p)).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// assert helpers
// ---------------------------------------------------------------------------

describe("assertCommercialCandidate", () => {
  it("does not throw for a valid candidate", () => {
    expect(() => assertCommercialCandidate(validCandidate())).not.toThrow();
  });

  it("throws an Error with validation messages for an invalid candidate", () => {
    expect(() => assertCommercialCandidate(validCandidate({ slug: "" }))).toThrow(
      "Invalid commercial candidate",
    );
  });
});

describe("assertCommercialProfile", () => {
  it("does not throw for a valid profile", () => {
    expect(() => assertCommercialProfile(validProfile())).not.toThrow();
  });

  it("throws an Error with validation messages for an invalid profile", () => {
    expect(() =>
      assertCommercialProfile(validProfile({ description: "x" })),
    ).toThrow("Invalid commercial profile");
  });
});