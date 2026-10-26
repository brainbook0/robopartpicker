import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { QUERY_COVERAGE, QUERY_INDEXABLE_SLUGS } from "../../src/lib/query-coverage";
import { isOverbroadAnswer, isQueryIndexable, NON_SOURCING_QUERY_SLUGS } from "../../src/lib/query-exclusions";
import { staticSeo } from "../../worker/services/seo";

const origin = "https://example.com";

// A slug the catalogue genuinely answers, used as the control: it must keep behaving as before.
const INDEXABLE_CONTROL = "robot-servo-motor";
// A slug from each exclusion group, used to check the live surfaces.
const NON_SOURCING_SAMPLE = ["where-to-buy-ninja-blender", "robotics-jobs", "robotics-memes"];

describe("NON_SOURCING_QUERY_SLUGS", () => {
  it("only lists slugs that exist and are currently covered (no dead entries)", () => {
    for (const slug of NON_SOURCING_QUERY_SLUGS) {
      const coverage = QUERY_COVERAGE[slug];
      expect(coverage, `${slug} is not generated in QUERY_COVERAGE`).toBeDefined();
      // If ix ever flips to false the entry is redundant: the coverage gate already excludes it.
      expect(coverage?.ix, `${slug} is no longer ix:true, so the exclusion is dead weight`).toBe(true);
      expect(QUERY_INDEXABLE_SLUGS, `${slug} is not in QUERY_INDEXABLE_SLUGS`).toContain(slug);
    }
  });

  it("leaves the sourced query pages indexable and removes only the non-sourcing ones", () => {
    expect(isQueryIndexable(INDEXABLE_CONTROL, QUERY_COVERAGE[INDEXABLE_CONTROL])).toBe(true);
    for (const slug of NON_SOURCING_QUERY_SLUGS) {
      expect(isQueryIndexable(slug, QUERY_COVERAGE[slug])).toBe(false);
    }
    const remaining = QUERY_INDEXABLE_SLUGS.filter((slug) => isQueryIndexable(slug, QUERY_COVERAGE[slug]));
    const overbroad = QUERY_INDEXABLE_SLUGS.filter((slug) => isOverbroadAnswer(QUERY_COVERAGE[slug]));
    // Two independent gates now remove slugs from the advertised set: the reviewed non-sourcing
    // list, and the overbroad-answer guard. Measured 2026-10-23: 380 ix:true slugs, 41 excluded by
    // the reviewed list, 16 by the guard (zero overlap), leaving 323.
    expect(remaining.length).toBe(QUERY_INDEXABLE_SLUGS.length - NON_SOURCING_QUERY_SLUGS.size - overbroad.length);
    expect(remaining.length).toBe(323);
  });

  it("does not exclude any high-volume parts query", () => {
    // Guard against a future edit silencing a page that actually answers a robot-part question.
    const partWords = ["servo", "motor", "gripper", "lidar", "arduino", "raspberry", "pcb", "battery", "encoder"];
    for (const slug of NON_SOURCING_QUERY_SLUGS) {
      expect(partWords.some((word) => slug.includes(word)), `${slug} looks like a parts query`).toBe(false);
    }
  });
});

describe("query pages offered to crawlers", () => {
  it("keeps non-sourcing query pages out of sitemap.xml", async () => {
    const res = await exports.default.fetch(new Request(`${origin}/sitemap.xml`));
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain(`/queries/${INDEXABLE_CONTROL}`);
    for (const slug of NON_SOURCING_SAMPLE) {
      expect(xml, `${slug} should not be advertised`).not.toContain(`/queries/${slug}`);
    }
  });

  it("serves non-sourcing query pages noindex and the sourced ones index", async () => {
    for (const slug of NON_SOURCING_SAMPLE) {
      const res = await exports.default.fetch(new Request(`${origin}/queries/${slug}`, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
      }));
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html, `${slug} must be noindex`).toContain('content="noindex,follow"');
    }
    const control = await exports.default.fetch(new Request(`${origin}/queries/${INDEXABLE_CONTROL}`));
    expect(await control.text()).toContain('content="index,follow');
  });

  it("does not link non-sourcing pages from the /queries index", async () => {
    const res = await exports.default.fetch(new Request(`${origin}/queries`));
    const html = await res.text();
    for (const slug of NON_SOURCING_SAMPLE) {
      expect(html, `${slug} should not be listed`).not.toContain(`/queries/${slug}"`);
    }
    expect(html).toContain("/queries/");
  });
});

describe("overbroad answers are not offered to crawlers", () => {
  // Measured 2026-10-23 against the shipped coverage: two of these claimed "573 components and 537
  // published projects", and /queries/robotics claimed 1,668 projects out of 2,445 in the catalogue.
  const OVERBROAD_SAMPLE = ["where-to-buy-a-robot", "robotics", "carbon-robotics"];
  // Queries the catalogue genuinely answers, well inside p95 (90 components / 33 projects).
  const ANSWERED_SAMPLE = ["robot-servo-motor", "frc-encoder", "quadruped-robot"];

  it("flags the over-match set and leaves the answered queries alone", () => {
    for (const slug of OVERBROAD_SAMPLE) {
      expect(isOverbroadAnswer(QUERY_COVERAGE[slug]), `${slug} should read as overbroad`).toBe(true);
      expect(isQueryIndexable(slug, QUERY_COVERAGE[slug]), `${slug} must not be indexable`).toBe(false);
    }
    for (const slug of ANSWERED_SAMPLE) {
      expect(isOverbroadAnswer(QUERY_COVERAGE[slug]), `${slug} should stay answerable`).toBe(false);
      expect(isQueryIndexable(slug, QUERY_COVERAGE[slug])).toBe(true);
    }
  });

  it("does not swing at missing or empty coverage", () => {
    expect(isOverbroadAnswer(undefined)).toBe(false);
    expect(isOverbroadAnswer({})).toBe(false);
    expect(isOverbroadAnswer({ c: 400, p: 100 })).toBe(false);
    expect(isOverbroadAnswer({ c: 401, p: 0 })).toBe(true);
    expect(isOverbroadAnswer({ c: 0, p: 101 })).toBe(true);
    expect(isQueryIndexable("anything", undefined)).toBe(false);
  });

  it("drops them from sitemap.xml and serves them noindex", async () => {
    const xml = await (await exports.default.fetch(new Request(`${origin}/sitemap.xml`))).text();
    for (const slug of OVERBROAD_SAMPLE) {
      expect(xml, `${slug} should not be advertised`).not.toContain(`/queries/${slug}<`);
    }
    expect(xml).toContain(`/queries/${ANSWERED_SAMPLE[0]}<`);
    for (const slug of OVERBROAD_SAMPLE) {
      const res = await exports.default.fetch(new Request(`${origin}/queries/${slug}`, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
      }));
      expect(res.status).toBe(200);
      expect(await res.text(), `${slug} must be noindex`).toContain('content="noindex,follow"');
    }
  });
});

describe("staticSeo fallback for /parts/<unknown>", () => {
  it("is noindex: an empty category has nothing to offer a crawler", () => {
    const doc = staticSeo("/parts/nosuchcategory", origin, `${origin}/social.png`);
    expect(doc).not.toBeNull();
    expect(doc?.robots).toBe("noindex,follow");
    expect(doc?.bodyHtml).toBeUndefined();
  });

  it("still ignores paths it has no document for", () => {
    expect(staticSeo("/not-a-real-page", origin, `${origin}/social.png`)).toBeNull();
    expect(staticSeo("/parts/compare", origin, `${origin}/social.png`)).toBeNull();
  });
});
