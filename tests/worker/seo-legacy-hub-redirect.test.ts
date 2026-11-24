import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// The bare /parts and /finder paths were advertised by an earlier crawler template, so
// search engines still re-request them even though the app has no route there. They must
// 301 to the canonical hub the app itself links, not dead-end at a 404 (which wastes crawl
// budget and drops any accumulated signal on the floor).

const origin = "https://example.com";

describe("legacy hub URLs redirect to their canonical page", () => {
  it("301s /parts to the component catalogue", async () => {
    const res = await exports.default.fetch(new Request(`${origin}/parts`, { redirect: "manual" }));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${origin}/parts/actuator`);
  });

  it("301s /finder to the guided finder", async () => {
    const res = await exports.default.fetch(new Request(`${origin}/finder`, { redirect: "manual" }));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${origin}/finder/actuator`);
  });

  it("answers HEAD on the legacy hubs without a body", async () => {
    for (const path of ["/parts", "/finder"]) {
      const res = await exports.default.fetch(new Request(`${origin}${path}`, { method: "HEAD", redirect: "manual" }));
      expect(res.status, path).toBe(301);
      expect(await res.text(), path).toBe("");
    }
  });

  it("does not redirect the real category and finder pages", async () => {
    for (const path of ["/parts/actuator", "/finder/actuator"]) {
      const res = await exports.default.fetch(new Request(`${origin}${path}`, { redirect: "manual" }));
      // These are real app pages served by the catalogue handlers; the legacy-hub rule
      // must not hijack them.
      expect(res.status, path).not.toBe(301);
      expect(res.headers.get("location"), path).toBeNull();
    }
  });
});

// Other legacy URLs search engines still request (older SO-101 project/BOM spellings,
// the common RSS aliases and the pre-rewrite comparison slug) must 301 to the page that
// now answers them, so crawl signals consolidate on a real page instead of a 404.
describe("legacy alias URLs redirect to their canonical page", () => {
  const aliases: Array<[string, string]> = [
    ["/projects/so-101", "/projects/therobotstudio-so-arm100"],
    ["/projects/so-arm100", "/projects/therobotstudio-so-arm100"],
    ["/projects/the-robotstudio-so-arm100", "/projects/therobotstudio-so-arm100"],
    ["/boms/so-101", "/boms/therobotstudio-so-arm100-bom"],
    ["/boms/so-arm100", "/boms/therobotstudio-so-arm100-bom"],
    ["/compared-to/robopartpicker-vs-octopart", "/compared-to/vs-octopart"],
    ["/feed", "/feed.xml"],
    ["/rss.xml", "/feed.xml"],
  ];

  for (const [from, to] of aliases) {
    it(`301s ${from} to ${to}`, async () => {
      const res = await exports.default.fetch(new Request(`${origin}${from}`, { redirect: "manual" }));
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe(`${origin}${to}`);
    });
  }

  it("answers HEAD on a legacy alias without a body", async () => {
    const res = await exports.default.fetch(new Request(`${origin}/feed`, { method: "HEAD", redirect: "manual" }));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${origin}/feed.xml`);
    expect(await res.text()).toBe("");
  });

  it("does not hijack the real feed route", async () => {
    const res = await exports.default.fetch(new Request(`${origin}/feed.xml`, { redirect: "manual" }));
    expect(res.status).not.toBe(301);
    expect(res.headers.get("location")).toBeNull();
  });
});
