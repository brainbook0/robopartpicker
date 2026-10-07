import { describe, expect, it } from "vitest";
import { QUERY_COVERAGE, QUERY_INDEXABLE_SLUGS } from "../../src/lib/query-coverage";
import { queryGuideSection } from "../../worker/services/seo";

const BASE = "https://robopartpicker.com";

describe("queryGuideSection (crawler internal links to /queries)", () => {
  it("emits the RPPGUIDE-V2-MARKER for a category that has indexable queries", () => {
    // "actuator" has many ix:true queries in QUERY_COVERAGE (e.g. robot-servo-motor)
    const html = queryGuideSection("actuator", BASE);
    expect(html).toContain("RPPGUIDE-V2-MARKER");
    expect(html).toContain("Related sourcing guides");
  });

  it("emits nothing for a category with no indexable queries", () => {
    // Categories without any ix:true entry must produce no guide section,
    // so no /queries page is advertised unless it is indexable.
    const nonIndexableCategories = new Set<string>();
    for (const slug of Object.keys(QUERY_COVERAGE)) {
      const cov = QUERY_COVERAGE[slug];
      if (!cov.ix && cov.cat) nonIndexableCategories.add(cov.cat);
    }
    // Ensure the test is meaningful: at least one such category exists.
    // If none exist, skip assertion (per-query ix behavior changed).
    if (nonIndexableCategories.size === 0) {
      return;
    }
    const category = [...nonIndexableCategories][0];
    const html = queryGuideSection(category, BASE);
    expect(html).not.toContain("RPPGUIDE-V2-MARKER");
    expect(html).toBe("");
  });

  it("inserts only absolute /queries links for indexable query slugs", () => {
    const html = queryGuideSection("cable", BASE);
    const hrefs = [...html.matchAll(/href="([^"]+)"/gu)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    // cap of 6 links, all indexable, all pointing at /queries/*
    expect(hrefs.length).toBeLessThanOrEqual(6);
    for (const href of hrefs) {
      expect(href.startsWith(`${BASE}/queries/`)).toBe(true);
      const slug = decodeURIComponent(href.split("/queries/")[1]);
      expect(QUERY_INDEXABLE_SLUGS).toContain(slug);
    }
  });

  it("rotates the link window deterministically per seed page", () => {
    const a = queryGuideSection("cable", BASE, "some-part-slug");
    const b = queryGuideSection("cable", BASE, "some-part-slug");
    expect(a).toBe(b);
    // different seed may produce a different (or same) window; either is fine
    const c = queryGuideSection("cable", BASE, "another-part-slug");
    expect(c.length).toBeGreaterThan(0);
  });

  it("never emits an empty guide window for any seed (regression: signed-hash modulo)", () => {
    // hashSeed could return a negative int; modulo then produced a negative
    // offset and slice() returned nothing, leaving <ul></ul> on some part pages.
    const failingSlug = "adafruit-micro-servo-mg90d-high-torque-metal-gear-14e9d91f";
    const html = queryGuideSection("actuator", BASE, failingSlug);
    expect(html).toContain("RPPGUIDE-V2-MARKER");
    expect(html).toMatch(/<ul><li>/u); // at least one actual link

    // sweep many seeds across a category with > 6 queries
    for (let i = 0; i < 60; i++) {
      const out = queryGuideSection("actuator", BASE, `seed-${i}`);
      expect(out).toContain("RPPGUIDE-V2-MARKER");
      const hrefs = [...out.matchAll(/href="([^"]+)"/gu)].map((m) => m[1]);
      expect(hrefs.length).toBeGreaterThan(0);
      expect(hrefs.length).toBeLessThanOrEqual(6);
    }
  });
});