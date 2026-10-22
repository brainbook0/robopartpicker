import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

// A component's category is part of its URL. Curation corrects categories (see migration
// 0034), so the URL a part used to live at has to keep resolving. These tests pin the rule:
// the slug alone identifies the part; the category only decides the canonical path.

const origin = "https://example.com";
const now = "2026-10-22T00:00:00.000Z";

beforeAll(async () => {
  await env.DB.prepare(`INSERT INTO components
    (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
     source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
    VALUES ('c-moved', 'moved-widget', NULL, NULL, 'Moved Widget', 'widget', NULL, 'active',
     NULL, 'worker integration test', ?1, 0, 1, ?1, ?1)`).bind(now).run();
});

describe("part URL follows the corrected category", () => {
  it("redirects an old category path to the canonical one", async () => {
    const doc = await resolveSeoDocument(env.DB, "/parts/inductor/moved-widget", origin);
    expect(doc.redirectTo).toBe(`${origin}/parts/widget/moved-widget`);
    expect(doc.canonicalUrl).toBe(`${origin}/parts/widget/moved-widget`);
    expect(doc.robots).toBe("noindex,follow");
  });

  it("serves the canonical path without a redirect", async () => {
    const doc = await resolveSeoDocument(env.DB, "/parts/widget/moved-widget", origin);
    expect(doc.redirectTo).toBeUndefined();
    expect(doc.canonicalUrl).toBe(`${origin}/parts/widget/moved-widget`);
  });

  it("does not invent a redirect for a slug that does not exist", async () => {
    const doc = await resolveSeoDocument(env.DB, "/parts/inductor/no-such-part-zzz9", origin);
    expect(doc.redirectTo).toBeUndefined();
    expect(doc.robots).toBe("noindex,follow");
  });
});
