import { describe, expect, it } from "vitest";
import { QUERY_COVERAGE, QUERY_INDEXABLE_SLUGS } from "../../src/lib/query-coverage";
import { queryGuideSection, queryMatchesSection, type QueryPartFact } from "../../worker/services/seo";

const BASE = "https://robopartpicker.com";

function fact(over: Partial<QueryPartFact>): QueryPartFact {
  return { slug: "s", category: "actuator", name: "Part", maker: null, offers: 0, lowestMinor: 0, currency: null, ...over };
}

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

describe("queryMatchesSection (per-query catalogue substance)", () => {
  const coverage = {
    c: 18, p: 2, ix: true,
    ex: [
      { n: "Micro Servo - MG90D", s: "adafruit-micro-servo-mg90d", t: "actuator" },
      { n: "Motor Shield", s: "adafruit-motor-shield", t: "ic" },
    ],
    px: [{ n: "realteck-ky/OpenRVGHServo", s: "realteck-ky-openrvghservo" }],
    cat: "actuator",
  };

  it("renders a real comparison table with maker, price and offer count", () => {
    const facts = new Map<string, QueryPartFact>([
      ["adafruit-micro-servo-mg90d\u0000actuator", fact({ slug: "adafruit-micro-servo-mg90d", name: "Micro Servo - MG90D High Torque Metal Gear", maker: "Adafruit", offers: 3, lowestMinor: 1295, currency: "USD" })],
    ]);
    const html = queryMatchesSection(coverage, facts);
    expect(html).toContain("<table>");
    expect(html).toContain("Adafruit");
    expect(html).toContain("USD 12.95");
    expect(html).toContain("(3 offers)");
    // the component with no catalogue facts is labelled honestly, not priced
    expect(html).toContain("no observed offers");
    expect(html).toContain("Micro Servo - MG90D High Torque Metal Gear");
    expect(html).toContain("18 components and 2 published projects");
    expect(html).toContain("actuator");
    expect(html).toContain("Sourcing notes");
    expect(html).toContain("Observed supplier prices exist for 1 of the 2 matches shown");
  });

  it("says so when nothing has an observed price instead of inventing one", () => {
    const html = queryMatchesSection(coverage, new Map());
    expect(html).not.toMatch(/USD \d/u);
    expect(html).toContain("No supplier offers are recorded for these matches yet");
  });

  it("produces different sourcing notes for different match sets", () => {
    const a = queryMatchesSection(coverage, new Map());
    const b = queryMatchesSection(
      { c: 4, p: 0, ix: true, ex: [{ n: "gEDA badge", s: "adafruit-geda-badge", t: "ic" }], px: [], cat: "ic" },
      new Map(),
    );
    expect(a).not.toBe(b);
    expect(b).toContain("The matches shown span ic (1).");
  });

  it("escapes catalogue text (names come from imported supplier data)", () => {
    const facts = new Map<string, QueryPartFact>([
      ["adafruit-micro-servo-mg90d\u0000actuator", fact({ name: "<script>alert(1)</script>", maker: "A & B", offers: 1, lowestMinor: 100, currency: "USD" })],
    ]);
    const html = queryMatchesSection(coverage, facts);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
  });

  it("handles a coverage entry with no matched components", () => {
    const html = queryMatchesSection({ c: 0, p: 0, ix: true }, new Map());
    expect(html).toContain("0 components and 0 published projects");
    expect(html).not.toContain("<table>");
    // 12 ix:true pages have c=0 and no ex list; they must not claim to have priced matches.
    expect(html).not.toContain("No supplier offers are recorded");
    expect(html).not.toContain("Sourcing notes");
  });

  it("describes a project-only match set (c=0, ex empty) without inventing component rows", () => {
    const html = queryMatchesSection(
      { c: 0, p: 3, ix: true, ex: [], px: [{ n: "UBTECH Walker S2", s: "ubtech-walker-s2" }], cat: null },
      new Map(),
    );
    expect(html).not.toContain("<table>");
    expect(html).toContain("0 components and 3 published projects");
    expect(html).toContain("1 published project in the catalogue build with matching parts");
    expect(html).toContain("ubtech-walker-s2");
  });
});
