import { describe, expect, it } from "vitest";
import { queryFaqPairs, queryIntroSection, type QueryPartFact } from "../../worker/services/seo";
import type { QueryCoverage } from "../../src/lib/query-coverage";

function fact(over: Partial<QueryPartFact>): QueryPartFact {
  return { slug: "s", category: "actuator", name: "Part", maker: null, offers: 0, lowestMinor: 0, currency: null, ...over };
}

const servoCoverage: QueryCoverage = {
  c: 3, p: 1, ix: true, cat: "actuator",
  ex: [
    { n: "Micro Servo - MG90D", s: "mg90d", t: "actuator" },
    { n: "Standard Servo SG-5010", s: "sg5010", t: "cable" },
    { n: "Servo Horn Set", s: "horn", t: "actuator" },
  ],
  px: [{ n: "OpenRVGHServo", s: "openrvghservo" }],
};

const wheelCoverage: QueryCoverage = {
  c: 2, p: 1, ix: true, cat: "mechanical",
  ex: [
    { n: "Right Mecanum Wheel 48mm", s: "mecanum", t: "mechanical" },
    { n: "TT Motor", s: "ttmotor", t: "mechanical" },
  ],
  px: [{ n: "some-wheel-project", s: "some-wheel-project" }],
};

describe("queryIntroSection (per-page unique opening)", () => {
  it("names the page's own matched components and its project count", () => {
    const facts = new Map<string, QueryPartFact>([
      ["mg90d", fact({ slug: "mg90d", name: "Micro Servo - MG90D", category: "actuator", maker: "Adafruit" })],
    ]);
    const html = queryIntroSection(servoCoverage, facts, "robot servo motor");
    expect(html).toContain("robot servo motor");
    expect(html).toContain("Micro Servo - MG90D");
    expect(html).toContain("(actuator)");
    expect(html).toContain("3 components");
    expect(html).toContain("1 published project");
  });

  it("differs between two pages whose match sets differ (de-duplication regression)", () => {
    // The shipped QUERIES[].body was identical across all 340 advertised pages with only the
    // keyword swapped, which is the duplication Google crawled and declined to index.
    const a = queryIntroSection(servoCoverage, new Map(), "robot servo motor");
    const b = queryIntroSection(wheelCoverage, new Map(), "robot wheel motor");
    expect(a).not.toBe(b);
    expect(a).toContain("Micro Servo - MG90D");
    expect(b).toContain("Right Mecanum Wheel 48mm");
    expect(b).not.toContain("Micro Servo - MG90D");
  });

  it("states plainly when the catalogue matches nothing", () => {
    const html = queryIntroSection({ c: 0, p: 0, ix: false }, new Map(), "unmatched query");
    expect(html).toContain("No component in the catalogue matches");
  });
});

describe("queryFaqPairs (data-derived Q&A)", () => {
  it("answers with the page's own components, prices and projects", () => {
    const facts = new Map<string, QueryPartFact>([
      ["mg90d", fact({ slug: "mg90d", name: "Micro Servo - MG90D", category: "actuator", offers: 2, lowestMinor: 1299, currency: "USD" })],
      ["sg5010", fact({ slug: "sg5010", name: "Standard Servo SG-5010", category: "cable", offers: 0, lowestMinor: 0 })],
    ]);
    const pairs = queryFaqPairs(servoCoverage, facts, "robot servo motor");
    expect(pairs.length).toBe(3);
    const text = pairs.map(([q, a]) => `${q} ${a}`).join(" ");
    expect(text).toContain("Micro Servo - MG90D (actuator)");
    expect(text).toContain("Standard Servo SG-5010 (cable)");
    expect(text).toContain("USD 12.99");
    expect(text).toContain("across 2 offers");
    expect(text).toContain("OpenRVGHServo");
    // None of the shipped boilerplate answers may survive.
    expect(text).not.toContain("cross-check component data against the linked product source");
  });

  it("says so honestly when no supplier offer backs a price", () => {
    const pairs = queryFaqPairs(wheelCoverage, new Map(), "robot wheel motor");
    const text = pairs.map(([q, a]) => `${q} ${a}`).join(" ");
    expect(text).toContain("No supplier offer is recorded for any of the 2 matches shown yet");
    expect(text).not.toContain("USD");
  });

  it("does not invent project usage when the match set has none", () => {
    const pairs = queryFaqPairs({ c: 1, p: 0, ix: true, ex: [{ n: "Only Part", s: "only", t: "ic" }], px: [] }, new Map(), "solo query");
    const text = pairs.map(([q, a]) => `${q} ${a}`).join(" ");
    expect(text).toContain("No published project in the catalogue uses a component from this match set yet");
  });

  it("produces different answers for different pages (no shared boilerplate)", () => {
    const a = queryFaqPairs(servoCoverage, new Map(), "robot servo motor").map(([, ans]) => ans).join(" ");
    const b = queryFaqPairs(wheelCoverage, new Map(), "robot wheel motor").map(([, ans]) => ans).join(" ");
    expect(a).not.toBe(b);
  });
});
