import { describe, expect, it } from "vitest";
import { canonicalBase, DEFAULT_PRODUCTION_BASE_URL, replaceBase } from "./public-seo";

describe("public SEO canonical base", () => {
  it("defaults production builds to the active workers.dev origin", () => {
    expect(canonicalBase({ CLOUDFLARE_ENV: "production" })).toBe(DEFAULT_PRODUCTION_BASE_URL);
  });

  it("allows a configured custom origin and strips path/query/hash", () => {
    expect(canonicalBase({ VITE_CANONICAL_BASE_URL: "https://example.com/custom/?x=1#hash" })).toBe("https://example.com/custom");
  });

  it("rewrites static meta, robots, and sitemap legacy origins consistently", () => {
    const input = "https://robopartpicker.com/ https://robopartpicker-production.ludomi2502.workers.dev/sitemap.xml http://localhost:5173/placeholder.svg";
    expect(replaceBase(input, "https://example.com")).toBe("https://example.com/ https://example.com/sitemap.xml https://example.com/placeholder.svg");
  });
});
