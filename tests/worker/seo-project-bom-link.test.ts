import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

const origin = "https://example.com";
const now = "2026-11-05T00:00:00.000Z";

// The production catalogue does not guarantee that a project's BOM slug is `<project-slug>-bom`.
// Most imported BOMs carry a distinct slug (a name-derived or suffixed key), e.g. the real
// `xlerobot-bom-9402d205` for project `xlerobot`, or `open-source-rover-bom` for project
// `nasa-jpl-open-source-rover`. The project prerender used to build its "Full bill of materials"
// link as `/boms/${project.slug}-bom`, which 404s on 2,143 of 2,400 public project pages. The link
// must resolve the project's actual BOM route key instead of guessing it.
const REAL_BOM_SLUG = "deploy-bot-bom-a1b2c3d4";
const WRONG_BOM_SLUG = "deploy-bot-bom";

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('u-bomlink', 'BOM Link Test', 'bomlink@example.com', 1, ?1, ?1)`).bind(now),
    // Project whose BOM has a real slug that is NOT `<slug>-bom`.
    env.DB.prepare(`INSERT INTO projects
      (id, slug, name, summary, owner_user_id, visibility, status, is_demo, version, project_kind, created_at, updated_at)
      VALUES ('p-bomlink', 'deploy-bot', 'Deploy Bot', 'A robot with a suffixed BOM slug.', 'u-bomlink', 'public', 'published', 0, 1, 'physical_design', ?1, ?1)`).bind(now),
    env.DB.prepare(`INSERT INTO boms
      (id, project_id, owner_user_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
      VALUES ('b-bomlink', 'p-bomlink', 'u-bomlink', ?1, 'Deploy Bot BOM', 'bv-bomlink', 'public', 0, ?2, ?2)`)
      .bind(REAL_BOM_SLUG, now),
    env.DB.prepare(`INSERT INTO bom_versions
      (id, bom_id, version_label, currency, created_by_user_id, source_fingerprint,
       validation_report_json, quote_ready, publication_state, coverage_note,
       omission_report_json, compiler_version, policy_version, created_at)
      VALUES ('bv-bomlink', 'b-bomlink', '1', 'USD', 'u-bomlink', ?1, '{}', 0, 'verified',
        'All lines sourced.', '[]', 'bom-compiler/1', 'bom-publication/1', ?2)`)
      .bind("d".repeat(64), now),
    env.DB.prepare(`INSERT INTO bom_items
      (id, bom_version_id, component_id, slot_key, description, quantity, unit,
       extraction_method, completeness, evidence_locator, confidence, line_classification,
       included, optional, raw_fields_json, aggregated_locators_json, sort_order)
      VALUES ('bi-bomlink-1', 'bv-bomlink', NULL, 'servo', 'STS3215 Servo', 1, 'each', 'explicit-bom',
        'verified', 'README.md#row1', 1, 'purchased', 1, 0, '{}', '[]', 0)`),
    // Project with no BOM row at all.
    env.DB.prepare(`INSERT INTO projects
      (id, slug, name, summary, owner_user_id, visibility, status, is_demo, version, project_kind, created_at, updated_at)
      VALUES ('p-nobom', 'nomad-bot', 'Nomad Bot', 'A project without any BOM.', 'u-bomlink', 'public', 'published', 0, 1, 'robotics_software', ?1, ?1)`).bind(now),
  ]);
});

describe("project prerender links the real BOM route key", () => {
  it("points the bill-of-materials link at the project's actual BOM slug", async () => {
    const doc = await resolveSeoDocument(env.DB, "/projects/deploy-bot", origin);
    expect(doc.bodyHtml).toContain(`href="${origin}/boms/${REAL_BOM_SLUG}"`);
    // The regression: the link was derived from the project slug and 404d.
    expect(doc.bodyHtml).not.toContain(`href="${origin}/boms/${WRONG_BOM_SLUG}"`);
  });

  it("falls back to the BOM index for a project with no BOM instead of emitting a dead link", async () => {
    const doc = await resolveSeoDocument(env.DB, "/projects/nomad-bot", origin);
    expect(doc.bodyHtml).toContain(`href="${origin}/boms"`);
    expect(doc.bodyHtml).not.toContain(`href="${origin}/boms/nomad-bot-bom"`);
  });
});
