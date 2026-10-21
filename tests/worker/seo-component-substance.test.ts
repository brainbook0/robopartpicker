import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

const origin = "https://example.com";
const now = "2026-10-20T00:00:00.000Z";

const insertComponent = (id: string, slug: string, name: string) =>
  env.DB.prepare(`INSERT INTO components
    (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
     source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
    VALUES (?1, ?2, NULL, NULL, ?3, 'widget', NULL, 'active',
     NULL, 'worker integration test', ?4, 0, 1, ?4, ?4)`)
    .bind(id, slug, name, now);

beforeAll(async () => {
  await env.DB.batch([
    // No specifications, no observed price, no project usage: a SKU stub.
    insertComponent("c-thin", "thin-stub-widget", "Thin Stub Widget"),
    // Same shape, but carries a real source specification.
    insertComponent("c-rich", "documented-widget", "Documented Widget"),
    env.DB.prepare(`INSERT INTO component_revisions (id, component_id, revision_label, status, effective_at, created_at)
      VALUES ('cr-rich', 'c-rich', 'source-current', 'published', ?1, ?1)`).bind(now),
    // value_text is the field the renderer treats as a published specification (production rows
    // carry it; only 27 catalog components hold a numeric value without one).
    env.DB.prepare(`INSERT INTO component_specs (id, component_revision_id, spec_key, label, value_text, value_number, unit, sort_order, created_at)
      VALUES ('cs-rich-torque', 'cr-rich', 'stall_torque_nm', 'Stall torque', '2.4', 2.4, 'N·m', 10, ?1)`).bind(now),
  ]);
});

describe("component substance filter", () => {
  it("does not advertise component pages that have no data behind them", async () => {
    const response = await exports.default.fetch(`${origin}/sitemap.xml`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-sitemap-entry-count")).toBeTruthy();
    const xml = await response.text();
    expect(xml).toContain(`${origin}/parts/widget/documented-widget`);
    expect(xml).not.toContain(`${origin}/parts/widget/thin-stub-widget`);
  });

  it("serves a documented component page as indexable", async () => {
    const doc = await resolveSeoDocument(env.DB, "/parts/widget/documented-widget", origin);
    expect(doc.robots).toMatch(/^index,follow/u);
    expect(doc.bodyHtml).toContain("Stall torque");
  });

  it("keeps a stub page crawlable but not indexable", async () => {
    const doc = await resolveSeoDocument(env.DB, "/parts/widget/thin-stub-widget", origin);
    expect(doc.robots).toBe("noindex,follow");
    expect(doc.canonicalUrl).toBe(`${origin}/parts/widget/thin-stub-widget`);
  });

  it("renders the query marker as a comment, never as visible text", async () => {
    const doc = await resolveSeoDocument(env.DB, "/parts/widget/documented-widget", origin);
    if (!doc.bodyHtml.includes("Related sourcing guides")) return;
    expect(doc.bodyHtml).toContain("<!--RPPGUIDE-V2-MARKER-->");
    expect(doc.bodyHtml.replace("<!--RPPGUIDE-V2-MARKER-->", "")).not.toContain("RPPGUIDE-V2-MARKER");
  });
});
