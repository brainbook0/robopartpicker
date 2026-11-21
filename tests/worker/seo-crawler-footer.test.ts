import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { resolveSeoDocument, serveGlossaryIndex, serveQueryIndex, withCrawlerFooter } from "../../worker/services/seo";

// The hub pages (/glossary, /price-index, /compared-to, /queries, /state-of-open-robotics,
// /teardowns) were reachable by sitemap and one-off cross-links alone: absent from the app
// nav, the app footer and the crawler footer, so they were orphan nodes in the crawl graph and
// stayed out of the index. Every crawler-visible document now carries a site-wide footer that
// links them. These tests pin that footer on both document shells so it cannot silently vanish
// (the same links are rendered by the React footer for JS clients).

const origin = "https://example.com";
const HUBS = ["/projects", "/boms", "/queries", "/price-index", "/glossary", "/compared-to", "/state-of-open-robotics", "/teardowns", "/developers"];

describe("crawler site-wide footer", () => {
  it("appends the internal-link footer to a SPA document body", async () => {
    const doc = await resolveSeoDocument(env.DB, "/about", origin);
    expect(doc).not.toBeNull();
    const wrapped = withCrawlerFooter(doc!, origin);
    for (const path of HUBS) {
      expect(wrapped.bodyHtml).toContain(`href="${origin}${path}"`);
    }
  });

  it("leaves a document with no crawler body untouched", () => {
    const bare = { title: "t", description: "d", canonicalUrl: `${origin}/x`, imageUrl: "", type: "website" as const, robots: "index,follow" };
    expect(withCrawlerFooter(bare, origin)).toBe(bare);
  });

  it("includes the footer in the full-SSR /queries hub", async () => {
    const res = serveQueryIndex({ env: { DB: env.DB }, req: { url: `${origin}/queries`, method: "GET" } } as unknown as Parameters<typeof serveQueryIndex>[0]);
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const path of HUBS) {
      expect(html).toContain(`href="${path}"`);
    }
  });

  it("includes the footer on the full-SSR glossary page", async () => {
    const res = serveGlossaryIndex({ env: { DB: env.DB }, req: { url: `${origin}/glossary`, method: "GET" } } as unknown as Parameters<typeof serveGlossaryIndex>[0]);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`href="/price-index"`);
    expect(html).toContain(`href="/compared-to"`);
    expect(html).toContain(`href="/state-of-open-robotics"`);
  });
});
