import { describe, expect, it } from "vitest";
import { QUERIES } from "../../src/lib/queries-data";
import { QUERY_COVERAGE } from "../../src/lib/query-coverage";
import { isQueryIndexable } from "../../src/lib/query-exclusions";
import { serveQueryIndex } from "../../worker/services/seo";

// The /queries hub is the one high-authority node that links the whole advertised
// /queries set, and sitemap.xml advertises every indexable query. The hub used to
// stop at the first 300 by search volume (`.slice(0, 300)`), which silently orphaned
// the lowest-volume indexable guides from internal links even though they were
// crawlable, indexable and in the sitemap. These tests pin hub == indexable set so
// the cap cannot come back.

const indexableQueries = QUERIES.filter((q) => isQueryIndexable(q.slug, QUERY_COVERAGE[q.slug]));

async function hubHtml(): Promise<string> {
  const ctx = {
    env: {},
    req: { url: "https://example.com/queries", method: "GET" },
  } as unknown as Parameters<typeof serveQueryIndex>[0];
  return await serveQueryIndex(ctx).text();
}

describe("serveQueryIndex (/queries hub internal links)", () => {
  it("links every indexable query page (no 300 cap)", async () => {
    const html = await hubHtml();
    const hrefs = [...html.matchAll(/href="\/queries\/([^"]+)"/gu)].map((m) => decodeURIComponent(m[1]));
    // Only indexable slugs are linked...
    for (const slug of hrefs) {
      expect(isQueryIndexable(slug, QUERY_COVERAGE[slug])).toBe(true);
    }
    // ...and all of them are, so the hub matches the advertised/sitemap set.
    expect(hrefs.length).toBe(indexableQueries.length);
    // Guard against a regression to the old hard cap of 300.
    expect(indexableQueries.length).toBeGreaterThan(300);
  });

  it("does not leak a non-sourcing query into the hub", async () => {
    const html = await hubHtml();
    // A reviewed non-sourcing slug (served noindex, excluded from sitemap) must not appear.
    expect(html).not.toContain("where-to-buy-ninja-blender");
    expect(html).not.toContain("robotics-jobs");
  });
});
