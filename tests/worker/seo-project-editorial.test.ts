import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveSeoDocument } from "../../worker/services/seo";

const origin = "https://example.com";
const now = "2026-11-01T00:00:00.000Z";

const insertProject = (id: string, slug: string, name: string) =>
  env.DB.prepare(`INSERT INTO projects
    (id, slug, name, summary, owner_user_id, visibility, status, is_demo, version, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, 'u-seo-editorial', 'public', 'published', 0, 1, ?5, ?5)`)
    .bind(id, slug, name, `${name} is a robotics project with a published source repository.`, now);

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
      VALUES ('u-seo-editorial', 'SEO Editorial', 'seo-editorial@example.com', 1, ?1, ?1)`).bind(now),
    insertProject("p-so101", "therobotstudio-so-arm100", "SO-101 Robot Arms"),
    insertProject("p-other", "some-other-robot", "Some Other Robot"),
  ]);
});

describe("curated project editorial section", () => {
  it("injects the source-backed SO-101 build notes for that project's page", async () => {
    const doc = await resolveSeoDocument(env.DB, "/projects/therobotstudio-so-arm100", origin);
    // The section the ranking page lacked: what the arm is, arm choice, gearing, cost, printing, assembly.
    expect(doc.bodyHtml).toContain("SO-101 at a glance");
    expect(doc.bodyHtml).toContain("Motors by arm and gear");
    expect(doc.bodyHtml).toContain("1/345 gear (C001)");
    expect(doc.bodyHtml).toContain("1/191 (C044)");
    expect(doc.bodyHtml).toContain("1/147 (C046)");
    expect(doc.bodyHtml).toContain("US$229.88");
    expect(doc.bodyHtml).toContain("US$121.94");
    expect(doc.bodyHtml).toContain("3D printing the frame");
    expect(doc.bodyHtml).toContain("huggingface.co/docs/lerobot/so101");
    // The guide is attributed to the upstream repository, not asserted as our own claim.
    expect(doc.bodyHtml).toContain("github.com/TheRobotStudio/SO-ARM100");
    expect(doc.robots).toMatch(/^index,follow/u);
  });

  it("does not inject the SO-101 notes into an unrelated project page", async () => {
    const doc = await resolveSeoDocument(env.DB, "/projects/some-other-robot", origin);
    expect(doc.bodyHtml).not.toContain("SO-101 at a glance");
    expect(doc.bodyHtml).toContain("Project facts");
  });
});
