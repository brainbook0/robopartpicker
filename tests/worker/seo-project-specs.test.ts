import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

const origin = "https://example.com";
const now = "2026-10-23T00:00:00.000Z";

const insertProject = (id: string, slug: string, name: string) =>
  env.DB.prepare(`INSERT INTO projects
    (id, slug, name, summary, owner_user_id, visibility, status, is_demo, version, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, 'u-seo-specs', 'public', 'published', 0, 1, ?5, ?5)`)
    .bind(id, slug, name, `${name} is a robotics project with a published source repository.`, now);

const insertSpec = (id: string, projectId: string, key: string, label: string, opts: { text?: string; number?: number; unit?: string }) =>
  env.DB.prepare(`INSERT INTO project_specs
    (id, project_id, spec_key, label, value_text, value_number, unit, confidence, observed_at, is_current, sort_order, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0.8, ?8, 1, 0, ?8, ?8)`)
    .bind(id, projectId, key, label, opts.text ?? null, opts.number ?? null, opts.unit ?? null, now);

const insertPrice = (id: string, projectId: string, minMinor: number, maxMinor: number, currency = "USD") =>
  env.DB.prepare(`INSERT INTO project_price_estimates
    (id, project_id, estimate_type, currency, min_minor, max_minor, representative_minor, confidence, method_version, summary, valued_at, expires_at, status, created_at, updated_at)
    VALUES (?1, ?2, 'published_price', ?3, ?4, ?5, ?4, 'medium', 'project-point-estimate-v1', NULL, ?6, NULL, 'active', ?6, ?6)`)
    .bind(id, projectId, currency, minMinor, maxMinor, now);

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('u-seo-specs', 'SEO Specs Test', 'seo-specs@example.com', 1, ?1, ?1)`).bind(now),
    insertProject("p-specs", "spec-rich-robot", "Spec Rich Robot"),
    insertSpec("s-height", "p-specs", "height", "Height", { number: 1.32, unit: "m" }),
    insertSpec("s-speed", "p-specs", "max_speed", "Maximum running speed", { text: "Approx. 5m/s" }),
    insertPrice("pr-specs", "p-specs", 1350000, 1350000, "USD"),
    // A project with no normalized specs or price estimate behind it.
    insertProject("p-nospecs", "plain-robot", "Plain Robot"),
  ]);
});

describe("project prerender specs and price", () => {
  it("server-renders the source-backed specifications and the active price estimate", async () => {
    const doc = await resolveSeoDocument(env.DB, "/projects/spec-rich-robot", origin);
    expect(doc.bodyHtml).toContain("Technical specifications (2)");
    expect(doc.bodyHtml).toContain("Height: 1.32 m (source-backed, checked 2026-10-23)");
    expect(doc.bodyHtml).toContain("Maximum running speed: Approx. 5m/s (source-backed, checked 2026-10-23)");
    expect(doc.bodyHtml).toContain("Published price estimate");
    expect(doc.bodyHtml).toContain("$13,500");
    expect(doc.bodyHtml).toContain("medium confidence");
    expect(doc.robots).toMatch(/^index,follow/u);
  });

  it("omits both sections when the project has no specs or price estimate", async () => {
    const doc = await resolveSeoDocument(env.DB, "/projects/plain-robot", origin);
    expect(doc.bodyHtml).not.toContain("Technical specifications (");
    expect(doc.bodyHtml).not.toContain("Published price estimate");
  });

  it("keeps the page in the sitemap regardless", async () => {
    const response = await exports.default.fetch(`${origin}/sitemap.xml`);
    const xml = await response.text();
    expect(xml).toContain(`${origin}/projects/spec-rich-robot`);
  });
});
