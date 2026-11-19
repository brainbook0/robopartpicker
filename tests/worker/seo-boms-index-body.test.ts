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
});
