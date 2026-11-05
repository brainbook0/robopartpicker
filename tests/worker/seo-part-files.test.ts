import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

// Regression cover for the 2026-11-05 prerender query rewrite (migration 0041). The part page used
// to drive its file and sibling lookups from the whole `files` table and a category-wide temp b-tree;
// the rewrite drives both from the component. These tests pin the output so the cheaper queries keep
// emitting the same sections.
const origin = "https://example.com";
const now = "2026-11-05T00:00:00.000Z";

const insertComponent = (id: string, slug: string, name: string) =>
  env.DB.prepare(`INSERT INTO components
    (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
     source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
    VALUES (?1, ?2, NULL, NULL, ?3, 'widget', ?4, 'active',
     NULL, 'worker integration test', ?5, 0, 1, ?5, ?5)`)
    .bind(id, slug, name, `${name} is a widget with a published data sheet and a correction record.`, now);

const insertFile = (id: string, name: string, status: string) =>
  env.DB.prepare(`INSERT INTO files
    (id, object_key, original_name, media_type, size_bytes, owner_user_id, visibility, status, kind, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'application/octet-stream', 1024, 'u-part-test', 'public', ?4, 'document', ?5, ?5)`)
    .bind(id, `components/${id}`, name, status, now);

const attach = (componentId: string, fileId: string, purpose: string, sortOrder: number) =>
  env.DB.prepare(`INSERT INTO component_files (component_id, component_revision_id, file_id, purpose, sort_order, created_at)
    VALUES (?1, NULL, ?2, ?3, ?4, ?5)`)
    .bind(componentId, fileId, purpose, sortOrder, now);

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('u-part-test', 'Part Test', 'part-test@example.com', 1, ?1, ?1)`).bind(now),
    insertComponent("c-part", "documented-widget-two", "Documented Widget Two"),
    insertComponent("c-part-sibling", "related-widget", "Related Widget"),
    // A published data sheet (ready) and a draft that is not ready yet; only the first may be listed.
    insertFile("f-part-ds", "widget-datasheet.pdf", "ready"),
    insertFile("f-part-draft", "widget-revision-b.pdf", "pending"),
    attach("c-part", "f-part-ds", "datasheet", 0),
    attach("c-part", "f-part-draft", "datasheet", 1),
  ]);
});

describe("part prerender files and siblings", () => {
  it("lists only usable files and links a same-category sibling", async () => {
    const doc = await resolveSeoDocument(env.DB, "/parts/widget/documented-widget-two", origin);
    expect(doc.bodyHtml).toContain("Published files (1)");
    expect(doc.bodyHtml).toContain("widget-datasheet.pdf");
    expect(doc.bodyHtml).not.toContain("widget-revision-b.pdf");
    expect(doc.bodyHtml).toContain("/parts/widget/related-widget");
  });

  it("stays crawlable (200-shape document) for a component that exists", async () => {
    const doc = await resolveSeoDocument(env.DB, "/parts/widget/documented-widget-two", origin);
    expect(doc.canonicalUrl).toBe(`${origin}/parts/widget/documented-widget-two`);
    expect(doc.robots).toBeDefined();
  });
});
