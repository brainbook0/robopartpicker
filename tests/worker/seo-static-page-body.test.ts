import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { resolveSeoDocument, serveLlmsText, serveStateOfOpenRobotics } from "../../worker/services/seo";

// /about and /marketplace are linked site-wide and advertised in the sitemap, but they were served
// by the generic one-sentence exact-page template: ~34 and ~31 words of crawler-visible body while
// every other listing page carried 150-600. These tests pin real body content and the facts it cites
// so the two pages cannot silently regress to stubs again.

const origin = "https://example.com";

const countWords = (html: string): number =>
  html.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim().split(" ").length;

describe("static page bodies", () => {
  it("serves a substantive /about body", async () => {
    const doc = await resolveSeoDocument(env.DB, "/about", origin);
    expect(doc).not.toBeNull();
    expect(doc!.robots).toContain("index,follow");
    expect(doc!.canonicalUrl).toBe(`${origin}/about`);
    expect(countWords(doc!.bodyHtml ?? "")).toBeGreaterThan(120);
    // The page must keep saying what the data does and does not claim.
    expect(doc!.bodyHtml).toContain("not a shop");
    expect(doc!.bodyHtml).toContain("unresolved");
    expect(doc!.bodyHtml).toContain(`${origin}/state-of-open-robotics`);
    expect(doc!.bodyHtml).toContain(`${origin}/developers`);
  });

  it("serves a substantive /marketplace body", async () => {
    const doc = await resolveSeoDocument(env.DB, "/marketplace", origin);
    expect(doc).not.toBeNull();
    expect(doc!.robots).toContain("index,follow");
    expect(doc!.canonicalUrl).toBe(`${origin}/marketplace`);
    expect(countWords(doc!.bodyHtml ?? "")).toBeGreaterThan(80);
    // It carries the live state honestly: the marketplace has no public listings yet.
    expect(doc!.bodyHtml).toContain("no public listings yet");
    expect(doc!.bodyHtml).toContain(`${origin}/marketplace/new`);
    expect(doc!.bodyHtml).toContain(`${origin}/boms`);
  });

  it("keeps the generic template for pages that have no bespoke body", async () => {
    const doc = await resolveSeoDocument(env.DB, "/partners", origin);
    expect(doc).not.toBeNull();
    expect(doc!.bodyHtml).toContain("<h1>Robotics project and data partnerships</h1>");
    expect(countWords(doc!.bodyHtml ?? "")).toBeLessThan(120);
  });

  // The census page is the catalog's most quotable asset. Its BOM section must state the
  // resolution gap concretely and keep the "any version" emptiness figure consistent with the
  // "published version" figure — the two must not read as a contradiction (223 carry lines, but
  // only 38 of those are served to the public).
  it("state-of-open-robotics reports the published-line resolution gap without contradiction", async () => {
    const res = await serveStateOfOpenRobotics({
      env: { DB: env.DB },
      req: { url: `${origin}/state-of-open-robotics`, method: "GET" },
    } as unknown as Parameters<typeof serveStateOfOpenRobotics>[0]);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("resolve to an identifiable");
    expect(html).toContain("explicit source locator");
    expect(html).toContain("carry them in a published version");
    expect(html).toContain("draft line items the catalog has never published");
    expect(html).toContain("index,follow");
    expect(countWords(html)).toBeGreaterThan(250);
  });

  // The two pages that quote catalogue counts must not hardcode them again: they drifted once
  // (2,453 / 35,146 / 2,414 while the live census read 2,445 / 34,760 / 2,408), and a stale figure
  // on a page whose pitch is stated evidence is a credibility defect. Both must render exactly the
  // counts the census query returns for the same database.
  it("serves live catalogue counts on /about and /marketplace", async () => {
    const row = await env.DB.prepare(`SELECT
        (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL AND is_demo = 0 AND status = 'published' AND visibility = 'public') AS projects,
        (SELECT COUNT(*) FROM components WHERE deleted_at IS NULL AND is_demo = 0) AS components,
        (SELECT COUNT(*) FROM boms WHERE is_demo = 0) AS boms`)
      .first<{ projects: number; components: number; boms: number }>();
    const about = await resolveSeoDocument(env.DB, "/about", origin);
    expect(about!.bodyHtml).toContain(`${row!.projects.toLocaleString()} open robotics projects`);
    expect(about!.bodyHtml).toContain(`${row!.components.toLocaleString()} component records`);
    expect(about!.bodyHtml).not.toContain("2,453");
    const marketplace = await resolveSeoDocument(env.DB, "/marketplace", origin);
    expect(marketplace!.bodyHtml).toContain(`${row!.projects.toLocaleString()} open designs`);
    expect(marketplace!.bodyHtml).toContain(`${row!.boms.toLocaleString()} public BOMs`);
    expect(marketplace!.bodyHtml).not.toContain("35,146");
  });

  // llms.txt is the file AI answer engines and agents read; it can only be cited as a source if it
  // carries the census numbers, so the citable statistics block must be present and current.
  it("serves citable live census statistics in llms.txt", async () => {
    const res = await serveLlmsText({
      env: { DB: env.DB },
      req: { url: `${origin}/llms.txt`, method: "GET" },
    } as unknown as Parameters<typeof serveLlmsText>[0]);
    expect(res.status).toBe(200);
    const txt = await res.text();
    expect(txt).toContain("## Key statistics");
    expect(txt).toContain("Bills of materials with no parts listed");
    expect(txt).toContain(`${origin}/state-of-open-robotics`);
  });

  // /rpps, /teardowns and /compared-to are advertised in sitemap.xml and linked from every page's
  // footer, but each was served by the generic one-sentence template (86-121 words). A specification
  // served as an 87-word stub is the worst of them. These tests pin real body content so the three
  // hubs cannot silently regress to stubs again.
  it("serves a substantive /rpps specification body, not an 87-word stub", async () => {
    const doc = await resolveSeoDocument(env.DB, "/rpps", origin);
    expect(doc).not.toBeNull();
    expect(doc!.robots).toContain("index,follow");
    expect(doc!.canonicalUrl).toBe(`${origin}/rpps`);
    expect(doc!.bodyHtml).toContain("The two files");
    expect(doc!.bodyHtml).toContain("Conformance profiles");
    // The two artifacts and the four profiles the human page documents must both be present.
    expect(doc!.bodyHtml).toContain("rpps.yaml");
    expect(doc!.bodyHtml).toContain("rpps.lock.yaml");
    for (const profile of ["Core", "Buildable", "Reproducible", "Collaborative"]) {
      expect(doc!.bodyHtml).toContain(`<strong>${profile}</strong>`);
    }
    expect(doc!.bodyHtml).toContain("Open Know-How");
    expect(doc!.bodyHtml).toContain(`${origin}/developers`);
    expect(countWords(doc!.bodyHtml ?? "")).toBeGreaterThan(200);
  });

  it("serves a substantive /teardowns body that states the evidence standard honestly", async () => {
    const doc = await resolveSeoDocument(env.DB, "/teardowns", origin);
    expect(doc).not.toBeNull();
    expect(doc!.robots).toContain("index,follow");
    expect(doc!.bodyHtml).toContain("Evidence standard");
    expect(doc!.bodyHtml).toContain("No reviewed teardowns are published yet");
    expect(doc!.bodyHtml).toContain(`${origin}/community`);
    expect(countWords(doc!.bodyHtml ?? "")).toBeGreaterThan(120);
  });

  it("serves a substantive /compared-to body that links every comparison", async () => {
    const doc = await resolveSeoDocument(env.DB, "/compared-to", origin);
    expect(doc).not.toBeNull();
    expect(doc!.robots).toContain("index,follow");
    expect(doc!.bodyHtml).toContain("How the sourcing tools differ");
    expect(doc!.bodyHtml).toContain(`${origin}/state-of-open-robotics`);
    const links = (doc!.bodyHtml ?? "").match(new RegExp(`href="${origin}/compared-to/`, "g"))?.length ?? 0;
    expect(links).toBe(5);
    expect(countWords(doc!.bodyHtml ?? "")).toBeGreaterThan(120);
  });
});
