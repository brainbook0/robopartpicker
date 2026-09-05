import { describe, expect, it } from "vitest";
import { canonicalBase, canonicalRedirectUrl, DEFAULT_PREVIEW_BASE_URL, DEFAULT_PRODUCTION_BASE_URL, replaceBase } from "./public-seo";

describe("public SEO canonical base", () => {
  it("defaults production builds to the public custom domain", () => {
    expect(canonicalBase({ CLOUDFLARE_ENV: "production" })).toBe("https://robopartpicker.com");
    expect(DEFAULT_PRODUCTION_BASE_URL).toBe("https://robopartpicker.com");
  });

  it("defaults preview builds to the preview workers.dev origin, not localhost", () => {
    expect(canonicalBase({ CLOUDFLARE_ENV: "preview" })).toBe(DEFAULT_PREVIEW_BASE_URL);
  });

  it("defaults local development to localhost", () => {
    expect(canonicalBase({})).toBe("http://localhost:5173");
  });

  it("allows a configured custom origin and strips path/query/hash", () => {
    expect(canonicalBase({ VITE_CANONICAL_BASE_URL: "https://example.com/custom/?x=1#hash" })).toBe("https://example.com/custom");
  });

  it("rewrites static meta, robots, and sitemap legacy origins consistently", () => {
    const input = "https://robopartpicker.com/ https://robopartpicker-production.ludomi2502.workers.dev/sitemap.xml http://localhost:5173/placeholder.svg";
    expect(replaceBase(input, "https://example.com")).toBe("https://example.com/ https://example.com/sitemap.xml https://example.com/placeholder.svg");
  });

  it("redirects the www alias to the canonical apex while preserving path and query", () => {
    expect(canonicalRedirectUrl("https://www.robopartpicker.com/projects/rover?source=github", "https://robopartpicker.com"))
      .toBe("https://robopartpicker.com/projects/rover?source=github");
    expect(canonicalRedirectUrl("https://robopartpicker.com/projects/rover", "https://robopartpicker.com")).toBeNull();
    expect(canonicalRedirectUrl("https://robopartpicker-production.ludomi2502.workers.dev/projects/rover", "https://robopartpicker.com")).toBeNull();
  });
});
