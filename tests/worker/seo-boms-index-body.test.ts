import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

// /boms is the catalogue's core-concept page and a tracked keyword target ("robot bill of materials"),
// but it was served as a bare ~170-word listing with no definitional content. These tests pin the
// deepened resource body and the two rules that matter: the page must define the term and the evidence
// states, and its project count must be read live from the census (never a hardcoded figure that can
// drift the way /about's once did).

const origin = "https://example.com";

const countWords = (html: string): number =>
  html.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim().split(" ").length;

describe("/boms index body", () => {
  it("serves a substantive robot-bill-of-materials body", async () => {
    const doc = await resolveSeoDocument(env.DB, "/boms", origin);
    expect(doc).not.toBeNull();
    expect(doc!.robots).toContain("index,follow");
    expect(doc!.canonicalUrl).toBe(`${origin}/boms`);
    expect(doc!.bodyHtml).toContain("<h1>Robot bill of materials</h1>");
    expect(doc!.bodyHtml).toContain("What a robot bill of materials is");
    expect(doc!.bodyHtml).toContain("How each line is labelled");
    // The evidence-state vocabulary the catalogue actually uses must be spelled out.
    expect(doc!.bodyHtml).toContain("unresolved");
    expect(doc!.bodyHtml).toContain(`${origin}/state-of-open-robotics`);
    expect(doc!.bodyHtml).toContain(`${origin}/projects`);
    expect(countWords(doc!.bodyHtml ?? "")).toBeGreaterThan(200);
  });

  it("reads the project count live from the census rather than hardcoding it", async () => {
    const row = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL AND is_demo = 0 AND status = 'published' AND visibility = 'public') AS projects`,
    ).first<{ projects: number }>();
    const doc = await resolveSeoDocument(env.DB, "/boms", origin);
    expect(doc!.bodyHtml).toContain(`${row!.projects.toLocaleString()} open robotics projects`);
    expect(doc!.bodyHtml).not.toContain("2,453");
  });

  // A LIMIT 24 once truncated this list while 39 BOMs qualified, leaving 15 of them reachable only
  // through the sitemap (no internal link equity from the index). The list must link every BOM that
  // resolved line items — the same set the sitemap advertises. The test seeds 30 resolved BOMs so it
  // actually reproduces the truncation instead of passing on an empty fixture database.
  it("links every BOM that resolved line items, not just the most recent handful", async () => {
    const projectId = "test-boms-index-project";
    await env.DB.prepare(
      `INSERT OR REPLACE INTO projects (id, slug, name, visibility, status, is_demo, version, created_at, updated_at)
       VALUES (?1, 'test-boms-index-project', 'BOM index fixture', 'public', 'published', 1, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    ).bind(projectId).run();
    for (let i = 0; i < 30; i++) {
      const bomId = `test-bom-${i}`;
      const versionId = `test-bom-version-${i}`;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO boms (id, project_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
         VALUES (?1, ?2, ?1, ?3, ?4, 'public', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      ).bind(bomId, projectId, `Fixture BOM ${i}`, versionId).run();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO bom_versions (id, bom_id, version_label, currency, created_at)
         VALUES (?1, ?2, '1', 'USD', '2026-01-01T00:00:00.000Z')`,
      ).bind(versionId, bomId).run();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO bom_items (id, bom_version_id, slot_key, description, quantity, unit, sort_order)
         VALUES (?1, ?2, 'slot-0', 'Fixture part', 1, 'each', 0)`,
      ).bind(`test-item-${i}`, versionId).run();
    }

    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM boms b WHERE b.is_demo = 0 AND b.visibility = 'public'
        AND (SELECT COUNT(*) FROM bom_items bi WHERE bi.bom_version_id = b.current_version_id) > 0`,
    ).first<{ n: number }>();
    expect(row!.n).toBeGreaterThanOrEqual(30); // otherwise the fixture did not load and the test proves nothing

    const doc = await resolveSeoDocument(env.DB, "/boms", origin);
    const links = (doc!.bodyHtml ?? "").match(new RegExp(`href="${origin}/boms/`, "g"))?.length ?? 0;
    expect(links).toBe(row!.n);
    // The heading count must match the number of linked BOMs (no silent truncation).
    expect(doc!.bodyHtml).toContain(`Bills of materials with resolved line items (${row!.n.toLocaleString()})`);
  });
});
