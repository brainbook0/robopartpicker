import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

// Imported supplier text carries HTML entities, and some pipelines escaped it twice. Component
// NAMES used to be the one field the renderer emitted raw, so `&amp;` reached the <title>, the
// <h1> and schema.org Product.name verbatim (live 2026-11-25: names of 425 components, summaries
// of 31). This pins the decode at the render boundary so the defect cannot come back silently.
const origin = "https://example.com";
const now = "2026-11-25T00:00:00.000Z";

const insertComponent = (id: string, slug: string, name: string, summary: string | null) =>
  env.DB.prepare(`INSERT INTO components
    (id, slug, manufacturer_id, manufacturer_part_number, name, category, summary, lifecycle_status,
     source_url, provenance_label, freshness_at, is_demo, version, created_at, updated_at)
    VALUES (?1, ?2, NULL, NULL, ?3, 'widget', ?4, 'active',
     NULL, 'worker integration test', ?5, 0, 1, ?5, ?5)`)
    .bind(id, slug, name, summary, now);

beforeAll(async () => {
  await env.DB.batch([
    insertComponent(
      "c-entity",
      "at2317-entity-name",
      "AT2317 Long Shaft UAV Motor for Outdoor 3D Trainer &amp; Glider",
      "0.6Nm peak torque &amp;amp; large hollow shaft for seamless joint &amp; gimbal integration.",
    ),
  ]);
});

describe("component names with HTML entity text", () => {
  it("decodes entity text in the title, h1 and Product structured data", async () => {
    const doc = await resolveSeoDocument(env.DB, "/parts/widget/at2317-entity-name", origin);
    expect(doc).toBeTruthy();

    // Title and body carry a single, correct escaping of the literal ampersand.
    expect(doc!.title).toContain("Trainer & Glider");
    expect(doc!.title).not.toContain("&amp;");
    expect(doc!.bodyHtml).toContain("<h1>AT2317 Long Shaft UAV Motor for Outdoor 3D Trainer &amp; Glider</h1>");
    // No double-escaped entity survives anywhere in the crawler document.
    expect(doc!.bodyHtml).not.toContain("&amp;amp;");
    expect(doc!.title).not.toContain("&amp;amp;");

    // schema.org name/description hold plain text.
    const sd = doc!.structuredData as Record<string, unknown>;
    expect(sd.name).toBe("AT2317 Long Shaft UAV Motor for Outdoor 3D Trainer & Glider");
    expect(String(sd.description)).toContain("peak torque & large hollow shaft");
    expect(String(sd.description)).not.toContain("&amp;");
  });
});
