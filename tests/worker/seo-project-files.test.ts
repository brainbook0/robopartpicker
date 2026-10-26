import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

const origin = "https://example.com";
const now = "2026-10-23T00:00:00.000Z";

const insertProject = (id: string, slug: string, name: string) =>
  env.DB.prepare(`INSERT INTO projects
    (id, slug, name, summary, owner_user_id, visibility, status, is_demo, version, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, 'u-seo-test', 'public', 'published', 0, 1, ?5, ?5)`)
    .bind(id, slug, name, `${name} is a robotics project with a published source repository.`, now);

const insertFile = (id: string, name: string, kind: string) =>
  env.DB.prepare(`INSERT INTO files
    (id, object_key, original_name, media_type, size_bytes, owner_user_id, visibility, status, kind, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'application/octet-stream', 1024, 'u-seo-test', 'public', 'ready', ?4, ?5, ?5)`)
    .bind(id, `projects/${id}`, name, kind, now);

const attach = (projectId: string, fileId: string, purpose: string, relativePath: string) =>
  env.DB.prepare(`INSERT INTO project_files (project_id, file_id, purpose, relative_path, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(projectId, fileId, purpose, relativePath, now);

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('u-seo-test', 'SEO Test', 'seo-test@example.com', 1, ?1, ?1)`).bind(now),
    // A project whose repository files RoboPartPicker actually indexed.
    insertProject("p-files", "file-rich-robot", "File Rich Robot"),
    insertFile("f-cad", "arm.stl", "cad"),
    insertFile("f-urdf", "robot.urdf", "urdf"),
    insertFile("f-photo", "assembly.jpg", "image"),
    attach("p-files", "f-cad", "cad", "hardware/arms/stl/arm.stl"),
    attach("p-files", "f-urdf", "urdf", "description/robot.urdf"),
    attach("p-files", "f-photo", "image", "docs/media/assembly.jpg"),
    // A project with nothing indexed behind it.
    insertProject("p-bare", "bare-robot", "Bare Robot"),
  ]);
});

describe("project prerender substance", () => {
  it("names the repository files indexed for the project instead of serving a bare stub", async () => {
    const doc = await resolveSeoDocument(env.DB, "/projects/file-rich-robot", origin);
    expect(doc.bodyHtml).toContain("Repository files indexed (3)");
    expect(doc.bodyHtml).toContain("hardware/arms/stl/arm.stl");
    expect(doc.bodyHtml).toContain("description/robot.urdf");
    // The summary counts every kind, including the images that are not listed one by one.
    expect(doc.bodyHtml).toContain("1 CAD model");
    expect(doc.bodyHtml).toContain("1 URDF robot description");
    expect(doc.bodyHtml).toContain("1 image");
    // An assembly photo is not promoted to a heading of its own.
    expect(doc.bodyHtml).not.toContain("<h3>image");
    expect(doc.robots).toMatch(/^index,follow/u);
  });

  it("says plainly when no repository files have been indexed", async () => {
    const doc = await resolveSeoDocument(env.DB, "/projects/bare-robot", origin);
    expect(doc.bodyHtml).toContain("No repository files have been indexed for this project yet.");
    expect(doc.bodyHtml).not.toContain("Repository files indexed (");
  });

  it("still advertises the project page in the sitemap", async () => {
    const response = await exports.default.fetch(`${origin}/sitemap.xml`);
    const xml = await response.text();
    expect(xml).toContain(`${origin}/projects/file-rich-robot`);
    expect(xml).toContain(`${origin}/projects/bare-robot`);
  });
});
