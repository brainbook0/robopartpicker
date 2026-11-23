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
