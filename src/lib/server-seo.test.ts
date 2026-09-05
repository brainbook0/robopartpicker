import { describe, expect, it } from "vitest";
import { buildSitemapXml, injectSeoHtml, type SeoDocument } from "./server-seo";

const shell = `<!doctype html><html><head><title>Default</title><meta name="description" content="default"><meta name="robots" content="index,follow"><meta property="og:type" content="website"><meta property="og:title" content="Default"><meta property="og:description" content="default"><meta property="og:image" content="https://example.com/default.png"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="Default"><meta name="twitter:description" content="default"><meta name="twitter:image" content="https://example.com/default.png"><link rel="canonical" href="https://example.com/"></head><body></body></html>`;

const project: SeoDocument = {
  title: "Open Source Rover BOM and CAD | RoboPartPicker",
  description: "Build the open source rover from its files and BOM.",
  canonicalUrl: "https://robopartpicker.com/projects/open-source-rover",
  imageUrl: "https://robopartpicker.com/api/v1/files/content?id=cover",
  type: "article",
  robots: "index,follow,max-image-preview:large",
  structuredData: { "@context": "https://schema.org", "@type": "CreativeWork", name: "Open <Source> Rover" },
};

describe("injectSeoHtml", () => {
  it("replaces crawler metadata and emits safe structured data", () => {
    const html = injectSeoHtml(shell, project);
    expect(html).toContain(`<title>${project.title}</title>`);
    expect(html).toContain(`content="${project.description}"`);
    expect(html).toContain(`href="${project.canonicalUrl}"`);
    expect(html).toContain(`property="og:type" content="article"`);
    expect(html).toContain(`name="twitter:card" content="summary_large_image"`);
    expect(html).toContain(`Open \\u003cSource> Rover`);
    expect(html.match(/rel="canonical"/gu)).toHaveLength(1);
    expect(html.match(/application\/ld\+json/gu)).toHaveLength(1);
  });
});

describe("buildSitemapXml", () => {
  it("escapes entity URLs and includes last-modified dates", () => {
    const xml = buildSitemapXml([
      { url: "https://robopartpicker.com/parts/Cables & Wires/a", lastModified: "2026-08-25T00:00:00.000Z" },
    ]);
    expect(xml).toContain("https://robopartpicker.com/parts/Cables &amp; Wires/a");
    expect(xml).toContain("<lastmod>2026-08-25</lastmod>");
  });
});
