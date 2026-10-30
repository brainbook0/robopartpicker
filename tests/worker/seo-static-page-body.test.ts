import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

// /about and /marketplace are linked site-wide and advertised in the sitemap, but they were served
// by the generic one-sentence exact-page template: ~34 and ~31 words of crawler-visible body while
// every other listing page carried 150-600. These tests pin real body content and the facts it cites
// so the two pages cannot silently regress to stubs again.

const origin = "https://example.com";

const countWords = (html: string): number =>
  html.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim().split(" ").length;

describe("static page bodies", () => {
  it("serves a substantive /about body", async () => {
    const doc = await resolveSeoDocument(env.DB, "/about", origin);
    expect(doc).not.toBeNull();
    expect(doc!.robots).toContain("index,follow");
    expect(doc!.canonicalUrl).toBe(`${origin}/about`);
    expect(countWords(doc!.bodyHtml ?? "")).toBeGreaterThan(120);
    // The page must keep saying what the data does and does not claim.
    expect(doc!.bodyHtml).toContain("not a shop");
    expect(doc!.bodyHtml).toContain("unresolved");
    expect(doc!.bodyHtml).toContain(`${origin}/state-of-open-robotics`);
    expect(doc!.bodyHtml).toContain(`${origin}/developers`);
  });

  it("serves a substantive /marketplace body", async () => {
    const doc = await resolveSeoDocument(env.DB, "/marketplace", origin);
    expect(doc).not.toBeNull();
    expect(doc!.robots).toContain("index,follow");
    expect(doc!.canonicalUrl).toBe(`${origin}/marketplace`);
    expect(countWords(doc!.bodyHtml ?? "")).toBeGreaterThan(80);
    // It carries the live state honestly: the marketplace has no public listings yet.
    expect(doc!.bodyHtml).toContain("no public listings yet");
    expect(doc!.bodyHtml).toContain(`${origin}/marketplace/new`);
    expect(doc!.bodyHtml).toContain(`${origin}/boms`);
  });

  it("keeps the generic template for pages that have no bespoke body", async () => {
    const doc = await resolveSeoDocument(env.DB, "/partners", origin);
    expect(doc).not.toBeNull();
    expect(doc!.bodyHtml).toContain("<h1>Robotics project and data partnerships</h1>");
    expect(countWords(doc!.bodyHtml ?? "")).toBeLessThan(120);
  });
});
