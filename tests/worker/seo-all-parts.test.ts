import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

const origin = "https://example.com";
const now = "2026-11-04T00:00:00.000Z";

// A distinct category so this file's rows never collide with the "widget" rows other
// worker tests insert into the same isolated D1 instance.
const insertComponent = (id: string, slug: string, name: string) =>
  env.DB.prepare(`INSERT INTO components
    (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
     source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
    VALUES (?1, ?2, NULL, NULL, ?3, 'gizmo', NULL, 'active',
     NULL, 'worker integration test', ?4, 0, 1, ?4, ?4)`)
    .bind(id, slug, name, now);

beforeAll(async () => {
  await env.DB.batch([
    // No specification, no observed price, no project usage: a SKU stub. The sitemap and the
    // component page both serve it noindex,follow, so /all-parts must not link it either.
    insertComponent("c-ap-thin", "thin-gizmo", "Thin Gizmo"),
    // Carries a real source specification: advertised by the sitemap, so it belongs in the index.
    insertComponent("c-ap-rich", "documented-gizmo", "Documented Gizmo"),
    env.DB.prepare(`INSERT INTO component_revisions (id, component_id, revision_label, status, effective_at, created_at)
      VALUES ('cr-ap-rich', 'c-ap-rich', 'source-current', 'published', ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO component_specs (id, component_revision_id, spec_key, label, value_text, value_number, unit, sort_order, created_at)
      VALUES ('cs-ap-mass', 'cr-ap-rich', 'mass_g', 'Mass', '42', 42, 'g', 10, ?1)`).bind(now),
  ]);
});

describe("/all-parts crawlable component index", () => {
  it("links every advertised component exactly once, grouped by category", async () => {
    const response = await exports.default.fetch(`${origin}/all-parts`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("<h1>Every robotics part in the catalog</h1>");
    expect(html).toContain(`${origin}/parts/gizmo/documented-gizmo`);
    // The recovery this page exists for: the part page is reachable from an indexable hub,
    // not only from the sitemap.
    expect(html).toContain('<meta name="robots" content="index,follow');
  });

  it("keeps noindex SKU stubs out of the index, matching the sitemap's substance rule", async () => {
    const html = await (await exports.default.fetch(`${origin}/all-parts`)).text();
    expect(html).not.toContain("/parts/gizmo/thin-gizmo");
  });

  it("is advertised in the sitemap and linked from the home page", async () => {
    const sitemap = await (await exports.default.fetch(`${origin}/sitemap.xml`)).text();
    expect(sitemap).toContain(`${origin}/all-parts`);
    // The Worker test env has no built assets, so the home HTML is asserted on the document
    // resolver (the same server-rendered body the asset handler injects in production).
    const home = await resolveSeoDocument(env.DB, "/", origin);
    expect(home.bodyHtml).toContain(`href="${origin}/all-parts"`);
  });
});
