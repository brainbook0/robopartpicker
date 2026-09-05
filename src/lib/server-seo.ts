export type SeoDocument = {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  type: "website" | "article" | "product";
  robots: string;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
};

export type SitemapEntry = { url: string; lastModified?: string | null };

export function injectSeoHtml(source: string, document: SeoDocument): string {
  let html = source;
  html = replaceOrInsert(html, /<title>[^<]*<\/title>/iu, `<title>${htmlText(document.title)}</title>`);
  html = replaceOrInsert(html, /<meta\s+name=["']description["'][^>]*>/iu, meta("name", "description", document.description));
  html = replaceOrInsert(html, /<meta\s+name=["']robots["'][^>]*>/iu, meta("name", "robots", document.robots));
  html = replaceOrInsert(html, /<meta\s+property=["']og:type["'][^>]*>/iu, meta("property", "og:type", document.type));
  html = replaceOrInsert(html, /<meta\s+property=["']og:title["'][^>]*>/iu, meta("property", "og:title", document.title));
  html = replaceOrInsert(html, /<meta\s+property=["']og:description["'][^>]*>/iu, meta("property", "og:description", document.description));
  html = replaceOrInsert(html, /<meta\s+property=["']og:image["'][^>]*>/iu, meta("property", "og:image", document.imageUrl));
  html = replaceOrInsert(html, /<meta\s+property=["']og:url["'][^>]*>/iu, meta("property", "og:url", document.canonicalUrl));
  html = replaceOrInsert(html, /<meta\s+name=["']twitter:card["'][^>]*>/iu, meta("name", "twitter:card", "summary_large_image"));
  html = replaceOrInsert(html, /<meta\s+name=["']twitter:title["'][^>]*>/iu, meta("name", "twitter:title", document.title));
  html = replaceOrInsert(html, /<meta\s+name=["']twitter:description["'][^>]*>/iu, meta("name", "twitter:description", document.description));
  html = replaceOrInsert(html, /<meta\s+name=["']twitter:image["'][^>]*>/iu, meta("name", "twitter:image", document.imageUrl));
  html = replaceOrInsert(html, /<link\s+rel=["']canonical["'][^>]*>/iu, `<link rel="canonical" href="${htmlAttribute(document.canonicalUrl)}" />`);
  html = html.replace(/<script\s+id=["']seo-structured-data["'][^>]*>[\s\S]*?<\/script>/giu, "");
  if (document.structuredData) {
    const json = JSON.stringify(document.structuredData).replace(/</gu, "\\u003c");
    html = html.replace(/<\/head>/iu, `<script id="seo-structured-data" type="application/ld+json">${json}</script></head>`);
  }
  return html;
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const body = entries.map((entry) => {
    const lastModified = normalizeDate(entry.lastModified);
    return `<url><loc>${xmlText(entry.url)}</loc>${lastModified ? `<lastmod>${lastModified}</lastmod>` : ""}</url>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

function replaceOrInsert(source: string, pattern: RegExp, replacement: string): string {
  return pattern.test(source) ? source.replace(pattern, replacement) : source.replace(/<\/head>/iu, `${replacement}</head>`);
}

function meta(attribute: "name" | "property", key: string, value: string): string {
  return `<meta ${attribute}="${key}" content="${htmlAttribute(value)}" />`;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString().slice(0, 10);
}

function htmlText(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function htmlAttribute(value: string): string {
  return htmlText(value).replace(/"/gu, "&quot;");
}

function xmlText(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");
}
