import type { Context } from "hono";
import { buildSitemapXml, injectSeoHtml, type SeoDocument, type SitemapEntry } from "../../src/lib/server-seo";
import { LEGAL_DOCUMENT_IDS, LEGAL_DOCUMENTS } from "../../src/lib/legal-documents";
import { QUERIES, QUERIES_BY_VOLUME } from "../../src/lib/queries-data";
import { QUERY_COVERAGE, QUERY_INDEXABLE_SLUGS, type QueryCoverage } from "../../src/lib/query-coverage";
import { isQueryIndexable, NON_SOURCING_QUERY_SLUGS } from "../../src/lib/query-exclusions";
import { GLOSSARY_TERMS } from "../../src/lib/glossary-data";
import { normalizeCatalogText } from "../../src/lib/catalogText";
import { COMPARISONS } from "../../src/lib/comparisons-data";
import type { AppBindings, Env } from "../env";
import { fileContentUrl } from "./file-urls";
import { isKnownAppRoute } from "./app-routes";

const SOCIAL_IMAGE_PATH = "/robopartpicker-social.png";
const LOGO_PATH = "/robopartpicker-logo.png";
const INDEX_ROBOTS = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
// Project pages used to reach a crawler as a ~70-word stub: title, four facts and "no BOM lines
// have been resolved yet". The visitor meanwhile gets 3D viewers and a managed-artifacts panel
// built from the repository files RoboPartPicker actually indexed. Listing those files here gives
// the page the unique, per-project content a search engine can use, and it is the same evidence a
// reader sees. Labels are the human names for the `files.kind` enum values.
const PROJECT_FILE_KIND_LABELS: Record<string, string> = {
  cad: "CAD model",
  urdf: "URDF robot description",
  mjcf: "MuJoCo description",
  bom: "bill-of-materials file",
  firmware: "firmware file",
  configuration: "configuration file",
  document: "document",
  test_evidence: "test-evidence file",
  attachment: "attachment",
  image: "image",
  other: "other file",
};
// Most useful to a builder first; `image` is last so assembly photos never crowd out CAD and firmware.
const PROJECT_FILE_KIND_ORDER = ["cad", "urdf", "mjcf", "bom", "firmware", "configuration", "document", "test_evidence", "attachment", "image", "other"];

/** `CAD model` -> `CAD model` (1) / `CAD models` (2). Keeps counts grammatical in headings and summaries. */
function projectFileKindLabel(kind: string, count: number): string {
  const base = PROJECT_FILE_KIND_LABELS[kind] ?? PROJECT_FILE_KIND_LABELS.other;
  return count === 1 ? base : `${base}s`;
}
// Date the /queries server-rendered template last changed. Every query page's intro, catalogue
// table and Q&A block are regenerated from live data on each request, so this is the honest
// freshness signal for the section — and /queries was the one substantial sitemap section
// advertised without a <lastmod> at all. Bump it only when the template or its data changes.
const QUERY_CONTENT_UPDATED = "2026-10-22";

// Internal crawl paths from part pages (which Googlebot actually fetches) into the
// programmatic /queries inventory (which has zero crawl allocation otherwise).
// The category->query mapping is built once from QUERY_COVERAGE: a query is only
// linked when the catalog can answer it (ix) and it targets the same part category.
const QUERY_KW_BY_SLUG: Record<string, string> = {};
const QUERY_SLUGS_BY_CATEGORY: Record<string, string[]> = {};
for (const entry of QUERIES) {
  QUERY_KW_BY_SLUG[entry.slug] = entry.kw;
  const cov = QUERY_COVERAGE[entry.slug];
  if (isQueryIndexable(entry.slug, cov) && cov.cat) {
    (QUERY_SLUGS_BY_CATEGORY[cov.cat] ??= []).push(entry.slug);
  }
}
for (const slugs of Object.values(QUERY_SLUGS_BY_CATEGORY)) {
  slugs.sort((a, b) => QUERY_KW_BY_SLUG[a].localeCompare(QUERY_KW_BY_SLUG[b]));
}

export function queryGuideSection(category: string, base: string, seed = ""): string {
  const all = QUERY_SLUGS_BY_CATEGORY[category] ?? [];
  if (!all.length) return "";
  // Rotate the window by page so every guide page in a category gets linked
  // from somewhere, instead of only the first six alphabetically.
  const limit = Math.min(6, all.length);
  const offset = all.length <= limit ? 0 : (hashSeed(seed) % (all.length - limit + 1));
  const slugs = all.slice(offset, offset + limit);
  const items = slugs
    .map((slug) => `<li><a href="${base}/queries/${encodeURIComponent(slug)}">${esc(QUERY_KW_BY_SLUG[slug] ?? slug)}</a></li>`)
    .join("");
  // The marker is an HTML comment: tests anchor on it, readers must never see it.
  return `<h2>Related sourcing guides</h2><!--RPPGUIDE-V2-MARKER--><ul>${items}</ul>`;
}

// Small deterministic string hash (FNV-1a) to spread link windows per page.
function hashSeed(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = (h * 0x01000193) & 0xffffffff;
  }
  // & on a negative accumulator yields a signed int; force unsigned so the
  // caller's modulo always lands in [0, n) and never produces an empty window.
  return h >>> 0;
}

export async function serveSeoAsset(c: Context<AppBindings>): Promise<Response> {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (c.req.method !== "GET" || !asset.headers.get("content-type")?.includes("text/html")) return asset;
  const base = publicBase(c.env, c.req.url);
  // The built index.html answers every unknown path because Cloudflare serves the SPA
  // fallback first. Routes the React app really owns keep that 200; everything else gets a
  // real 404 so crawlers stop treating scanner probes (/google-service-account.json,
  // /package.json, /wp-admin/...) as pages worth fetching.
  const knownRoute = isKnownAppRoute(c.req.path);
  const document = knownRoute
    ? await resolveSeoDocument(c.env.DB, c.req.path, base)
    : notFoundDocument(base);
  if (document?.redirectTo) {
    return new Response(null, {
      status: 301,
      headers: { location: document.redirectTo, "cache-control": "public, max-age=86400" },
    });
  }
  const headers = new Headers(asset.headers);
  headers.delete("content-length");
  headers.delete("etag");
  // A known route that resolved to the not-found document is a dead record, not a page:
  // 404 it so crawlers drop it instead of re-fetching a 24-word "Page not found" 200.
  const status = document?.httpStatus ?? (knownRoute ? asset.status : 404);
  headers.set("cache-control", status === 404 ? "public, max-age=60" : "public, max-age=300, stale-while-revalidate=3600");
  return new Response(injectSeoHtml(await asset.text(), document), { status, headers });
}

/** Server-rendered body for a URL the app does not own. Real links, no invented content. */
export function notFoundDocument(base: string): SeoDocument {
  return {
    title: "Page not found | RoboPartPicker",
    description: "This URL is not part of RoboPartPicker. Browse robotics projects, bills of materials, or the component catalogue instead.",
    canonicalUrl: `${base}/`,
    imageUrl: `${base}${SOCIAL_IMAGE_PATH}`,
    type: "website",
    robots: "noindex,follow",
    httpStatus: 404,
    bodyHtml: `<article><h1>Page not found</h1><p>There is no RoboPartPicker page at this address. It may have been renamed, or the link may be wrong.</p><ul><li><a href="${base}/projects">Robotics projects</a></li><li><a href="${base}/boms">Bills of materials</a></li><li><a href="${base}/marketplace">Parts marketplace</a></li><li><a href="${base}/queries">Sourcing guides</a></li><li><a href="${base}/">Home</a></li></ul></article>`,
  };
}

export async function serveSitemap(c: Context<AppBindings>): Promise<Response> {
  const base = publicBase(c.env, c.req.url);
  const [projects, components, boms, categories, specComponents, pricedComponents, usedComponents] = await Promise.all([
    collectRows<{ slug: string; updated_at: string }>(c.env.DB, `SELECT slug, updated_at FROM projects WHERE deleted_at IS NULL AND is_demo = 0 AND status = 'published' AND visibility = 'public' ORDER BY id`),
    collectRows<{ id: string; slug: string; category: string; updated_at: string }>(c.env.DB, `SELECT id, slug, category, updated_at FROM components WHERE deleted_at IS NULL AND is_demo = 0 ORDER BY id`),
    collectRows<{ route_key: string; updated_at: string; lines: number }>(c.env.DB, `SELECT COALESCE(b.slug, b.id) AS route_key, b.updated_at,
        (SELECT COUNT(*) FROM bom_items bi WHERE bi.bom_version_id = b.current_version_id) AS lines
      FROM boms b WHERE b.is_demo = 0 AND b.visibility = 'public' ORDER BY b.id`),
    collectRows<{ category: string; updated_at: string }>(c.env.DB, `SELECT category, MAX(updated_at) AS updated_at FROM components WHERE deleted_at IS NULL AND is_demo = 0 GROUP BY category ORDER BY category`),
    // Substance sets for the component filter below. Three flat DISTINCT scans rather than one
    // correlated subquery per component: on production D1 the correlated form exceeds the
    // per-query CPU limit, and this route has to stay cheap enough to serve on every crawl.
    collectRows<{ id: string }>(c.env.DB, `SELECT DISTINCT r.component_id AS id FROM component_specs s
      JOIN component_revisions r ON r.id = s.component_revision_id
      WHERE s.spec_key NOT IN ('category', 'measurement_units', 'manufacturer_slug', 'source')
        AND s.value_text IS NOT NULL AND TRIM(s.value_text) <> ''`),
    collectRows<{ id: string }>(c.env.DB, `SELECT DISTINCT component_id AS id FROM supplier_offers WHERE is_demo = 0 AND unit_price_minor > 0`),
    collectRows<{ id: string }>(c.env.DB, `SELECT DISTINCT bi.component_id AS id FROM bom_items bi
      JOIN bom_versions bv ON bv.id = bi.bom_version_id
      JOIN boms b ON b.id = bv.bom_id
      JOIN projects p ON p.id = b.project_id
      WHERE b.is_demo = 0 AND p.deleted_at IS NULL AND p.is_demo = 0 AND p.status = 'published' AND p.visibility = 'public'`),
  ]);
  const entries: SitemapEntry[] = [
    "", "/projects", "/all-projects", "/boms", "/marketplace", "/community", "/teardowns", "/about", "/partners", "/developers", "/rpps", "/feed.xml", "/llms.txt", "/queries", "/glossary", "/compared-to", "/price-index", "/state-of-open-robotics",
    ...LEGAL_DOCUMENT_IDS.map((id) => LEGAL_DOCUMENTS[id].path),
  ].map((path) => ({ url: `${base}${path}` }));
  // Only the query pages the catalog can actually answer are advertised. The rest
  // are served noindex, so listing them here would just be a duplicate-content
  // invitation with no unique value behind it.
  const indexable = new Set(QUERY_INDEXABLE_SLUGS.filter((slug) => isQueryIndexable(slug, QUERY_COVERAGE[slug])));
  entries.push(...QUERIES.filter((query) => indexable.has(query.slug)).map((query) => ({ url: `${base}/queries/${query.slug}`, lastModified: QUERY_CONTENT_UPDATED })));
  entries.push(...COMPARISONS.map((comp) => ({ url: `${base}/compared-to/${comp.slug}` })));
  entries.push(...categories.map((row) => ({ url: `${base}/parts/${encodeURIComponent(row.category)}`, lastModified: row.updated_at })));
  // Guided finder pages exist in the app for these six categories but were never advertised or
  // server-rendered. Sitemap only carries categories that actually have catalog rows.
  entries.push(...categories.filter((row) => FINDER_CATEGORIES.includes(row.category))
    .map((row) => ({ url: `${base}/finder/${encodeURIComponent(row.category)}`, lastModified: row.updated_at })));
  entries.push(...projects.map((row) => ({ url: `${base}/projects/${encodeURIComponent(row.slug)}`, lastModified: row.updated_at })));
  // Only components with something a reader can use are advertised: source specifications, an
  // observed price, or real usage in a published project. 26,000 of the 34,760 catalog components
  // have none of the three and render a stub that literally says no specifications have been
  // published — advertising them spent the whole crawl budget (Googlebot: 10-34 requests a day
  // across 42,231 URLs, 1,860 indexed) on pages that cannot rank. They stay reachable through
  // category listings and sibling links as noindex,follow, and return here once they gain data.
  const substantive = new Set<string>([
    ...specComponents.map((row) => row.id),
    ...pricedComponents.map((row) => row.id),
    ...usedComponents.map((row) => row.id),
  ]);
  entries.push(...components.filter((row) => substantive.has(row.id)).map((row) => ({ url: `${base}/parts/${encodeURIComponent(row.category)}/${encodeURIComponent(row.slug)}`, lastModified: row.updated_at })));
  // Only BOMs that actually resolved line items are advertised. 2,370 of the 2,408 public
  // BOMs have zero lines, and a page whose whole purpose is a bill of materials that is empty
  // is thin content at scale — the same liability the /queries pages had. Those pages are
  // served noindex,follow instead, and go back into the sitemap as their BOMs get populated.
  entries.push(...boms.filter((row) => Number(row.lines) > 0).map((row) => ({ url: `${base}/boms/${encodeURIComponent(row.route_key)}`, lastModified: row.updated_at })));
  const body = c.req.method === "HEAD" ? null : buildSitemapXml(entries);
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400", "x-sitemap-entry-count": String(entries.length) } });
}

export function serveRobots(c: Context<AppBindings>): Response {
  const base = publicBase(c.env, c.req.url);
  const text = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth\nDisallow: /builder\nDisallow: /notifications\nDisallow: /organizations\nDisallow: /completed-quotes/\n\nSitemap: ${base}/sitemap.xml\n`;
  return new Response(c.req.method === "HEAD" ? null : text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

export async function serveProjectFeed(c: Context<AppBindings>): Promise<Response> {
  const base = publicBase(c.env, c.req.url);
  const rows = await c.env.DB.prepare(`SELECT slug, name, summary, updated_at FROM projects
    WHERE deleted_at IS NULL AND is_demo = 0 AND status = 'published' AND visibility = 'public'
    ORDER BY updated_at DESC LIMIT 100`).all<{ slug: string; name: string; summary: string | null; updated_at: string }>();
  const items = rows.results.map((row) => {
    const link = `${base}/projects/${encodeURIComponent(row.slug)}`;
    return `<item><title>${xml(row.name)}</title><link>${xml(link)}</link><guid isPermaLink="true">${xml(link)}</guid><description>${xml(row.summary ?? "Source-linked robotics project on RoboPartPicker.")}</description><pubDate>${new Date(row.updated_at).toUTCString()}</pubDate></item>`;
  }).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>RoboPartPicker projects</title><link>${xml(`${base}/projects`)}</link><description>Recently updated robotics projects, BOMs and build files.</description><language>en</language>${items}</channel></rss>`;
  return new Response(c.req.method === "HEAD" ? null : body, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=900, stale-while-revalidate=3600" } });
}

export async function serveLlmsText(c: Context<AppBindings>): Promise<Response> {
  const base = publicBase(c.env, c.req.url);
  const rows = await c.env.DB.prepare(`SELECT slug, name, summary FROM projects
    WHERE deleted_at IS NULL AND is_demo = 0 AND status = 'published' AND visibility = 'public'
    ORDER BY github_stars DESC, updated_at DESC LIMIT 100`).all<{ slug: string; name: string; summary: string | null }>();
  const projects = rows.results.map((row) => `- [${plain(row.name)}](${base}/projects/${encodeURIComponent(row.slug)}): ${plain(row.summary ?? "Source-linked robotics project.")}`).join("\n");
  const body = `# RoboPartPicker\n\n> Source-linked robotics projects, bills of materials, parts, CAD and reproducible build evidence.\n\n## Core pages\n\n- [Project catalog](${base}/projects)\n- [Bills of materials](${base}/boms)\n- [Component catalog](${base}/parts/actuator)\n- [Sourcing questions](${base}/queries)\n- [Component price index](${base}/price-index)\n- [Robotics glossary](${base}/glossary)\n- [Comparisons](${base}/compared-to)\n- [RPPS specification](${base}/rpps)\n- [Developer API and MCP](${base}/developers)\n\n## Machine interfaces\n\n- Public API base: ${base}/api/v1\n- Public read-only MCP: ${base}/mcp\n- MCP discovery: ${base}/.well-known/mcp.json\n- Sitemap: ${base}/sitemap.xml\n- RSS feed: ${base}/feed.xml\n\n## Popular robotics projects\n\n${projects}\n`;
  return new Response(c.req.method === "HEAD" ? null : body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400" } });
}

export async function serveProjectBadge(c: Context<AppBindings>): Promise<Response> {
  // Hono captures the whole ":slug.svg" segment, so strip the extension here.
  const slug = safeDecode(c.req.param("slug") ?? "").replace(/\.svg$/iu, "");
  const row = await c.env.DB.prepare(`SELECT p.name,
      (SELECT COUNT(*) FROM boms b JOIN bom_items bi ON bi.bom_version_id = b.current_version_id WHERE b.project_id = p.id AND b.is_demo = 0) AS bom_lines
    FROM projects p WHERE p.slug = ?1 AND p.deleted_at IS NULL AND p.is_demo = 0 AND p.status = 'published' AND p.visibility = 'public'`)
    .bind(slug).first<{ name: string; bom_lines: number }>();
  if (!row) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  const value = Number(row.bom_lines) > 0 ? `${Number(row.bom_lines).toLocaleString()} BOM lines` : "source linked";
  const leftWidth = 112;
  const rightWidth = Math.max(92, Math.min(170, value.length * 7 + 18));
  const total = leftWidth + rightWidth;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="28" role="img" aria-label="RoboPartPicker: ${xml(value)}"><title>${xml(row.name)} on RoboPartPicker</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".08"/></linearGradient><clipPath id="r"><rect width="${total}" height="28" rx="4"/></clipPath><g clip-path="url(#r)"><rect width="${leftWidth}" height="28" fill="#20242a"/><rect x="${leftWidth}" width="${rightWidth}" height="28" fill="#ffd000"/><rect width="${total}" height="28" fill="url(#s)"/></g><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><text x="9" y="18">RoboPartPicker</text></g><g fill="#111" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" font-weight="600"><text x="${leftWidth + 9}" y="18">${xml(value)}</text></g></svg>`;
  return new Response(c.req.method === "HEAD" ? null : svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400", "x-content-type-options": "nosniff" } });
}

// BOM line descriptions and component names are imported from repository READMEs, CSVs and
// spreadsheets, so they carry whatever markup the source used (`<sup>2</sup>` footnote markers,
// `**bold**`, `&amp;` entities). esc() escapes that markup instead of rendering it, so a name like
// `... (C001) <sup>2</sup>` published the literal characters `&lt;sup&gt;2&lt;/sup&gt;` to crawlers
// and to anyone reading the prerendered body. Strip the markup first, then escape the plain text.
// Falls back to the raw value only if normalising would empty a non-empty string.
function importedText(value: string | null | undefined): string {
  const raw = String(value ?? "");
  return normalizeCatalogText(raw) || raw;
}

function esc(value: string): string {
  return String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
}

/** Minor units (cents) to a display currency string. Mirrors the app's price label. Falls back to `CODE 123` for unknown codes. */
// Deterministic formatting: the Cloudflare edge runtime's Intl.NumberFormat(style:"currency")
// produced a wrong value for the same minor amount that workerd and Node format correctly
// (1350000 USD rendered as "3,500" instead of "13,500" in production, 2026-10-29). Money on a page
// that promises honesty must not depend on edge ICU, so group the digits ourselves.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "CN¥", CAD: "CA$", AUD: "A$", CHF: "CHF ",
  INR: "₹", KRW: "₩", SEK: "kr ", NOK: "kr ", DKK: "kr ", NZD: "NZ$", SGD: "S$", HKD: "HK$",
};
function formatMoney(minor: number, currency: string): string {
  const amount = Math.round(Number(minor)) / 100;
  const [intPart, fracPart] = Math.abs(amount).toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  const frac = fracPart === "00" ? "" : `.${fracPart}`;
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${amount < 0 ? "-" : ""}${symbol}${grouped}${frac}`;
}

// Guided finder categories the app actually routes (src/pages/Finder.tsx validCategories).
const FINDER_CATEGORIES: readonly string[] = ["actuator", "hand", "sensor", "compute", "driver", "reducer"];

export async function resolveSeoDocument(db: D1Database, path: string, base: string): Promise<SeoDocument> {
  const fallbackImage = `${base}${SOCIAL_IMAGE_PATH}`;
  const projectMatch = path.match(/^\/projects\/([^/]+)$/u);
  if (projectMatch) {
    const slug = safeDecode(projectMatch[1]);
    const row = await db.prepare(`SELECT p.id, p.name, p.summary, p.description, p.project_kind, p.robot_category,
        p.license_spdx, p.repository_url, p.github_stars, p.updated_at,
        (SELECT f.id FROM project_media pm JOIN files f ON f.id = pm.file_id
          WHERE pm.project_id = p.id AND f.status = 'ready' AND f.visibility = 'public' AND f.deleted_at IS NULL
          ORDER BY pm.sort_order LIMIT 1) AS image_file_id,
        (SELECT COUNT(*) FROM boms b JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
          WHERE b.project_id = p.id AND b.is_demo = 0) AS bom_lines
      FROM projects p WHERE p.slug = ?1 AND p.deleted_at IS NULL AND p.is_demo = 0 AND p.status = 'published' AND p.visibility = 'public'`).bind(slug).first<{
        id: string; name: string; summary: string | null; description: string | null; project_kind: string; robot_category: string | null;
        license_spdx: string | null; repository_url: string | null; github_stars: number; updated_at: string; image_file_id: string | null; bom_lines: number;
      }>();
    if (row) {
      const description = concise(row.summary || row.description || `Explore ${row.name}, its source repository, technical files, parts, and bill of materials on RoboPartPicker.`);
      const canonicalUrl = `${base}/projects/${encodeURIComponent(slug)}`;
      const facts = [
        row.robot_category ? `<li>Category: ${esc(row.robot_category)}</li>` : "",
        row.project_kind ? `<li>Kind: ${esc(row.project_kind.replace(/_/gu, " "))}</li>` : "",
        row.license_spdx ? `<li>License: ${esc(row.license_spdx)}</li>` : "",
        `<li>GitHub stars: ${Number(row.github_stars || 0).toLocaleString()}</li>`,
        `<li>BOM lines indexed: ${Number(row.bom_lines || 0).toLocaleString()}</li>`,
        `<li>Last updated: ${esc(String(row.updated_at).slice(0, 10))}</li>`,
      ].filter(Boolean).join("");
      const repoLink = row.repository_url ? `<p>Source repository: <a href="${esc(row.repository_url)}">${esc(row.repository_url)}</a></p>` : "";
      // Normalized, source-backed specifications and the active published price estimate. The visitor
      // reads these in the app's "Product details" panel, built from `project_specs` and
      // `project_price_estimates`; crawlers were reaching the page without them because the prerender
      // never queried those tables. Every value here carries the source and the date it was observed,
      // and the price is labelled an estimate (catalog data, not a quote) exactly as the app does.
      const specRows = await db.prepare(`SELECT label, value_text, value_number, unit, observed_at
        FROM project_specs WHERE project_id = ?1 AND is_current = 1
        ORDER BY sort_order, label, id LIMIT 40`).bind(row.id).all<{
          label: string; value_text: string | null; value_number: number | null; unit: string | null; observed_at: string;
        }>();
      const specItems = specRows.results.map((s) => {
        const value = s.value_number !== null && s.value_number !== undefined ? String(s.value_number) : (s.value_text ?? "");
        const unit = s.unit ? ` ${s.unit}` : "";
        const checked = String(s.observed_at ?? "").slice(0, 10);
        return `<li>${esc(importedText(s.label))}: ${esc(value)}${esc(unit)} (source-backed, checked ${esc(checked)})</li>`;
      }).join("");
      const specSection = specRows.results.length
        ? `<h2>Technical specifications (${specRows.results.length.toLocaleString()})</h2><p>Values published by the manufacturer or another cited project source.</p><ul>${specItems}</ul>`
        : "";
      const price = await db.prepare(`SELECT currency, min_minor, max_minor, confidence, valued_at
        FROM project_price_estimates WHERE project_id = ?1 AND status = 'active'
          AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
        ORDER BY valued_at DESC LIMIT 1`).bind(row.id).first<{
          currency: string; min_minor: number; max_minor: number; confidence: string; valued_at: string;
        }>();
      const priceSection = price
        ? `<h2>Published price estimate</h2><p>${esc(formatMoney(price.min_minor, price.currency))}${price.min_minor === price.max_minor ? "" : `–${esc(formatMoney(price.max_minor, price.currency))}`} (${esc(price.confidence)} confidence, valued ${esc(String(price.valued_at ?? "").slice(0, 10))}). Estimates are observed catalog data, not supplier quotes.</p>`
        : "";
      const bomLines = await db.prepare(`SELECT bi.description, bi.quantity, bi.unit, bi.line_classification,
          bi.completeness, c.name AS component_name, c.slug AS component_slug, c.category AS component_category
        FROM boms b JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
        LEFT JOIN components c ON c.id = bi.component_id
        WHERE b.project_id = ?1 AND b.is_demo = 0 ORDER BY bi.sort_order LIMIT 60`).bind(row.id).all<{
          description: string; quantity: number; unit: string; line_classification: string; completeness: string;
          component_name: string | null; component_slug: string | null; component_category: string | null;
        }>();
      const lineItems = bomLines.results.map((l) => {
        const label = l.component_name && l.component_slug && l.component_category
          ? `<a href="${base}/parts/${encodeURIComponent(l.component_category)}/${encodeURIComponent(l.component_slug)}">${esc(importedText(l.component_name))}</a>`
          : esc(importedText(l.description));
        return `<li>${label} — ${Number(l.quantity)} ${esc(l.unit)}${l.line_classification ? ` (${esc(l.line_classification)}, ${esc(l.completeness)})` : ""}</li>`;
      }).join("");
      const bomSection = lineItems
        ? `<h2>Bill of materials (${Number(row.bom_lines).toLocaleString()} lines)</h2><ul>${lineItems}</ul>`
        : "<h2>Bill of materials</h2><p>No BOM lines have been resolved for this project yet.</p>";
      // Mirrors the "Related robotics projects" list the client renders (same kind and category), so the
      // crawler sees the same internal links a visitor does instead of a page that links nowhere.
      const related = await db.prepare(`SELECT p.slug, p.name FROM projects p
        WHERE p.deleted_at IS NULL AND p.is_demo = 0 AND p.status = 'published' AND p.visibility = 'public'
          AND p.id != ?1 AND p.project_kind = ?2 AND (?3 = '' OR p.robot_category = ?3)
        ORDER BY p.github_stars DESC, p.updated_at DESC LIMIT 6`)
        .bind(row.id, row.project_kind, row.robot_category ?? "").all<{ slug: string; name: string }>();
      const relatedSection = related.results.length
        ? `<h2>Related robotics projects</h2><ul>${related.results.map((p) => `<li><a href="${base}/projects/${encodeURIComponent(p.slug)}">${esc(p.name)}</a></li>`).join("")}</ul>`
        : "";
      // The repository files RoboPartPicker indexed for this project. Deliberately capped: this runs
      // on every project prerender, a few projects carry hundreds of anonymous attachments, and the
      // cheapest honest page is the one that names the CAD, URDF, firmware and BOM files a builder
      // would look for plus a count of everything else.
      const fileRows = await db.prepare(`SELECT f.kind, f.original_name, pf.relative_path
        FROM project_files pf JOIN files f ON f.id = pf.file_id
        WHERE pf.project_id = ?1 AND f.status = 'ready' AND f.visibility = 'public' AND f.deleted_at IS NULL
        ORDER BY pf.relative_path LIMIT 200`).bind(row.id).all<{
          kind: string; original_name: string | null; relative_path: string | null;
        }>();
      const filesByKind = new Map<string, string[]>();
      for (const f of fileRows.results) {
        const path = (f.relative_path || f.original_name || "").trim();
        if (!path) continue;
        const kind = Object.prototype.hasOwnProperty.call(PROJECT_FILE_KIND_LABELS, f.kind) ? f.kind : "other";
        const bucket = filesByKind.get(kind);
        if (bucket) bucket.push(path);
        else filesByKind.set(kind, [path]);
      }
      const kindsPresent = PROJECT_FILE_KIND_ORDER.filter((kind) => filesByKind.has(kind));
      const fileCount = fileRows.results.length;
      let fileBudget = 36;
      const fileGroups = kindsPresent
        .filter((kind) => kind !== "image" && fileBudget > 0)
        .map((kind) => {
          const all = filesByKind.get(kind) ?? [];
          const shown = all.slice(0, Math.min(6, fileBudget));
          fileBudget -= shown.length;
          if (!shown.length) return "";
          const rest = all.length - shown.length;
          const more = rest > 0 ? `<li>${rest.toLocaleString()} more ${esc(projectFileKindLabel(kind, rest))} are indexed in the catalogue.</li>` : "";
          return `<h3>${esc(projectFileKindLabel(kind, all.length))} (${all.length.toLocaleString()})</h3><ul>${shown.map((path) => `<li>${esc(path)}</li>`).join("")}${more}</ul>`;
        })
        .join("");
      const fileSummary = kindsPresent.map((kind) => `${(filesByKind.get(kind) ?? []).length.toLocaleString()} ${projectFileKindLabel(kind, (filesByKind.get(kind) ?? []).length)}`).join(", ");
      const fileSection = fileCount
        ? `<h2>Repository files indexed (${fileCount.toLocaleString()})</h2><p>${esc(fileSummary)}. Paths are exactly as they appear in the project's repository; RoboPartPicker lists only files it has actually indexed.</p>${fileGroups}`
        : "<h2>Repository files indexed</h2><p>No repository files have been indexed for this project yet.</p>";
      return {
        title: conciseTitle(`${row.name}: BOM, files and build data | RoboPartPicker`),
        description,
        canonicalUrl,
        imageUrl: row.image_file_id ? `${base}${fileContentUrl(row.image_file_id)}` : fallbackImage,
        type: "article",
        robots: INDEX_ROBOTS,
        bodyHtml: `<article><h1>${esc(row.name)}</h1><p>${esc(description)}</p>${repoLink}<h2>Project facts</h2><ul>${facts}</ul>${specSection}${priceSection}${bomSection}${fileSection}${relatedSection}<p><a href="${base}/projects">Browse all robotics projects</a> · <a href="${base}/boms/${encodeURIComponent(slug)}-bom">Full bill of materials</a> · <a href="${base}/community">Community evidence</a></p></article>`,
        structuredData: compact({ "@context": "https://schema.org", "@type": "SoftwareSourceCode", name: row.name, description, url: canonicalUrl, codeRepository: row.repository_url, license: row.license_spdx, programmingLanguage: "Robotics", interactionStatistic: row.github_stars ? { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: row.github_stars } : undefined, additionalProperty: [{ "@type": "PropertyValue", name: "BOM lines", value: Number(row.bom_lines) }, ...(price ? [{ "@type": "PropertyValue", name: "Published price estimate", value: `${price.currency} ${price.min_minor / 100}${price.min_minor === price.max_minor ? "" : `-${price.max_minor / 100}`}`, minValue: price.min_minor / 100, maxValue: price.max_minor / 100, unitText: price.currency }] : [])] }),
      };
    }
  }

  const partMatch = path.match(/^\/parts\/([^/]+)\/([^/]+)$/u);
  if (partMatch && partMatch[1] !== "compare") {
    const category = safeDecode(partMatch[1]);
    const slug = safeDecode(partMatch[2]);
    const row = await db.prepare(`SELECT c.id, c.name, c.summary, c.category, c.manufacturer_id, c.manufacturer_part_number, c.source_url,
        c.updated_at, m.name AS maker,
        (SELECT f.id FROM component_files cf JOIN files f ON f.id = cf.file_id
          WHERE cf.component_id = c.id AND cf.purpose = 'image' AND f.status = 'ready' AND f.visibility = 'public' AND f.deleted_at IS NULL
          ORDER BY cf.sort_order LIMIT 1) AS image_file_id,
        (SELECT MIN(so.unit_price_minor) FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.unit_price_minor > 0) AS price_minor,
        (SELECT so.currency FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.unit_price_minor > 0 ORDER BY so.unit_price_minor LIMIT 1) AS currency
      FROM components c LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
      WHERE c.slug = ?1 AND c.category = ?2 AND c.deleted_at IS NULL AND c.is_demo = 0`).bind(slug, category).first<{
        id: string; name: string; summary: string | null; category: string; manufacturer_id: string | null; manufacturer_part_number: string | null; source_url: string | null;
        updated_at: string; maker: string | null; image_file_id: string | null; price_minor: number | null; currency: string | null;
      }>();
    if (row) {
      const identity = [row.maker, row.manufacturer_part_number ? `MPN ${row.manufacturer_part_number}` : null].filter(Boolean).join(" · ");
      const description = concise(row.summary || `${row.name}${identity ? ` by ${identity}` : ""}. Compare source-backed specifications, prices, project usage, files and product links.`);
      const canonicalUrl = `${base}/parts/${encodeURIComponent(row.category)}/${encodeURIComponent(slug)}`;
      const offer = row.price_minor != null ? { "@type": "Offer", price: (Number(row.price_minor) / 100).toFixed(2), priceCurrency: row.currency ?? "USD", availability: "https://schema.org/InStock" } : undefined;
      const partFacts = [
        `<li>Category: ${esc(row.category)}</li>`,
        row.maker ? `<li>Manufacturer: ${esc(row.maker)}</li>` : "",
        row.manufacturer_part_number ? `<li>Manufacturer part number: ${esc(row.manufacturer_part_number)}</li>` : "",
        row.price_minor != null ? `<li>Observed catalog price: ${esc(row.currency ?? "USD")} ${(Number(row.price_minor) / 100).toFixed(2)} (observed estimate, not a binding quote)</li>` : "<li>Observed price: not available</li>",
        `<li>Last updated: ${esc(String(row.updated_at).slice(0, 10))}</li>`,
      ].filter(Boolean).join("");
      const sourceLink = row.source_url ? `<p>Product source: <a href="${esc(row.source_url)}">${esc(row.source_url)}</a></p>` : "";
      const usage = await db.prepare(`SELECT DISTINCT p.slug, p.name FROM bom_items bi
        JOIN bom_versions bv ON bv.id = bi.bom_version_id
        JOIN boms b ON b.id = bv.bom_id
        JOIN projects p ON p.id = b.project_id
        WHERE bi.component_id = ?1 AND b.is_demo = 0 AND p.deleted_at IS NULL AND p.is_demo = 0
          AND p.status = 'published' AND p.visibility = 'public' LIMIT 12`).bind(row.id).all<{ slug: string; name: string }>();
      const usageSection = usage.results.length
        ? `<h2>Used in these robotics projects</h2><ul>${usage.results.map((p) => `<li><a href="${base}/projects/${encodeURIComponent(p.slug)}">${esc(p.name)}</a></li>`).join("")}</ul>`
        : "";
      // Source-recorded specifications. Catalog bookkeeping keys (category, units, provenance) are not
      // specifications a reader can use, so they are excluded rather than padded into the table.
      const specRows = await db.prepare(`SELECT DISTINCT s.spec_key, s.label, s.value_text, s.value_number, s.unit
        FROM component_specs s JOIN component_revisions r ON r.id = s.component_revision_id
        WHERE r.component_id = ?1 AND s.spec_key NOT IN ('category', 'measurement_units', 'manufacturer_slug', 'source')
          AND (s.value_text IS NOT NULL AND TRIM(s.value_text) <> '')
        ORDER BY s.spec_key LIMIT 40`).bind(row.id).all<{
          spec_key: string; label: string | null; value_text: string | null; value_number: number | null; unit: string | null;
        }>();
      const specSection = specRows.results.length
        ? `<h2>Source specifications (${specRows.results.length})</h2><table><tbody>${specRows.results.map((s) => {
            const label = s.label || titleCase(s.spec_key);
            const value = `${esc(String(s.value_text ?? ""))}${s.unit ? ` ${esc(s.unit)}` : ""}`.trim();
            return `<tr><th>${esc(label)}</th><td>${value}</td></tr>`;
          }).join("")}</tbody></table>`
        : "<h2>Source specifications</h2><p>No structured source specifications have been published for this component yet.</p>";
      const fileRows = await db.prepare(`SELECT f.id, f.original_name, cf.purpose FROM component_files cf JOIN files f ON f.id = cf.file_id
        WHERE cf.component_id = ?1 AND f.status = 'ready' AND f.visibility = 'public' AND f.deleted_at IS NULL
        ORDER BY cf.sort_order LIMIT 20`).bind(row.id).all<{ id: string; original_name: string | null; purpose: string | null }>();
      const fileSection = fileRows.results.length
        ? `<h2>Published files (${fileRows.results.length})</h2><ul>${fileRows.results.map((f) => `<li><a href="${base}${fileContentUrl(f.id)}">${esc(f.original_name || `${row.name} file`)}</a>${f.purpose ? ` (${esc(f.purpose)})` : ""}</li>`).join("")}</ul>`
        : "";
      // Crawlable sibling links. Deliberately the cheap same-category lookup rather than the client's
      // scored alternatives CTE: this runs for every one of the 34,760 component pages a crawler may
      // request, and the expensive query would multiply D1 work on the busiest prerender path.
      const siblingRows = await db.prepare(`SELECT c.slug, c.name, c.category, m.name AS maker
        FROM components c LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
        WHERE c.category = ?1 AND c.id != ?2 AND c.deleted_at IS NULL AND c.is_demo = 0
        ORDER BY CASE WHEN c.manufacturer_id = ?3 THEN 0 ELSE 1 END, c.name COLLATE NOCASE LIMIT 6`)
        .bind(row.category, row.id, row.manufacturer_id ?? "").all<{ slug: string; name: string; category: string; maker: string | null }>();
      const siblingSection = siblingRows.results.length
        ? `<h2>Related components in ${esc(row.category)}</h2><ul>${siblingRows.results.map((c) => `<li><a href="${base}/parts/${encodeURIComponent(c.category)}/${encodeURIComponent(c.slug)}">${esc(c.name)}</a>${c.maker ? ` — ${esc(c.maker)}` : ""}</li>`).join("")}</ul>`
        : "";
      // Same substance rule as sitemap.xml: a component page with no source specifications, no
      // observed price and no published-project usage is a SKU stub. It stays crawlable
      // (follow) so the catalogue graph remains connected, but it must not be indexed.
      const substantive = specRows.results.length > 0 || row.price_minor != null || usage.results.length > 0;
      const bodyHtml = `<article><h1>${esc(row.name)}</h1><p>${esc(description)}</p>${sourceLink}<h2>Component facts</h2><ul>${partFacts}</ul>${specSection}${fileSection}${usageSection}${siblingSection}${queryGuideSection(row.category, base, slug)}<p><a href="${base}/parts/${encodeURIComponent(row.category)}">More ${esc(row.category)} components</a> · <a href="${base}/projects">Robotics projects</a></p></article>`;
      return {
        title: conciseTitle(`${row.name}${row.maker ? ` by ${row.maker}` : ""} | RoboPartPicker`),
        description,
        canonicalUrl,
        imageUrl: row.image_file_id ? `${base}${fileContentUrl(row.image_file_id)}` : fallbackImage,
        type: "product",
        robots: substantive ? INDEX_ROBOTS : "noindex,follow",
        bodyHtml,
        structuredData: compact({ "@context": "https://schema.org", "@type": "Product", name: row.name, description, url: canonicalUrl, mpn: row.manufacturer_part_number, manufacturer: row.maker ? { "@type": "Organization", name: row.maker } : undefined, category: row.category, offers: offer, additionalProperty: specRows.results.slice(0, 12).map((s) => ({ "@type": "PropertyValue", name: s.label || titleCase(s.spec_key), value: `${s.value_text ?? ""}${s.unit ? ` ${s.unit}` : ""}`.trim() })) }),
      };
    }
    // A part's category is a filing decision, not its identity: curation sometimes moves a
    // component (a mecanum wheel filed under `inductor`) to the category it belongs in, which
    // changes its URL. Resolve the slug on its own and send the old URL to the canonical path
    // with a permanent redirect instead of letting it decay into the SPA shell.
    const moved = await db.prepare(`SELECT category FROM components WHERE slug = ?1 AND deleted_at IS NULL AND is_demo = 0`)
      .bind(slug).first<{ category: string }>();
    if (moved && moved.category !== category) {
      const target = `${base}/parts/${encodeURIComponent(moved.category)}/${encodeURIComponent(slug)}`;
      return {
        title: "Redirecting | RoboPartPicker",
        description: "This part has moved to its correct category.",
        canonicalUrl: target,
        imageUrl: fallbackImage,
        type: "product",
        robots: "noindex,follow",
        redirectTo: target,
      };
    }
  }

  const bomMatch = path.match(/^\/boms\/([^/]+)$/u);
  if (bomMatch) {
    const routeKey = safeDecode(bomMatch[1]);
    const row = await db.prepare(`SELECT b.id, b.slug, b.name, b.updated_at, b.current_version_id, p.name AS project_name,
        bv.currency, bv.confirmed_at,
        COUNT(bi.id) AS line_count, COALESCE(SUM(bi.quantity), 0) AS unit_count,
        COALESCE(SUM(CASE WHEN bi.evidence_locator IS NOT NULL THEN 1 ELSE 0 END), 0) AS evidence_lines
      FROM boms b LEFT JOIN projects p ON p.id = b.project_id LEFT JOIN bom_versions bv ON bv.id = b.current_version_id
      LEFT JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
      WHERE (b.id = ?1 OR b.slug = ?1) AND b.is_demo = 0 AND b.visibility = 'public' GROUP BY b.id`).bind(routeKey).first<{
        id: string; slug: string | null; name: string; updated_at: string; current_version_id: string | null; project_name: string | null; currency: string | null; confirmed_at: string | null;
        line_count: number; unit_count: number; evidence_lines: number;
      }>();
    if (row) {
      const canonicalKey = row.slug ?? row.id;
      const canonicalUrl = `${base}/boms/${encodeURIComponent(canonicalKey)}`;
      const description = concise(`${row.name} contains ${Number(row.line_count).toLocaleString()} line items and ${Number(row.unit_count).toLocaleString()} total units${row.project_name ? ` for ${row.project_name}` : ""}. Inspect identities, quantities, evidence and observed pricing.`);
      const bomFacts = [
        `<li>Line items: ${Number(row.line_count).toLocaleString()}</li>`,
        `<li>Total units: ${Number(row.unit_count).toLocaleString()}</li>`,
        `<li>Lines with source evidence: ${Number(row.evidence_lines).toLocaleString()}</li>`,
        row.project_name ? `<li>Project: ${esc(row.project_name)}</li>` : "",
        row.currency ? `<li>Currency: ${esc(row.currency)}</li>` : "",
        row.confirmed_at ? `<li>Confirmed: ${esc(String(row.confirmed_at).slice(0, 10))}</li>` : "<li>Not yet confirmed by a maintainer</li>",
      ].filter(Boolean).join("");
      const bomItemRows = await db.prepare(`SELECT bi.description, bi.quantity, bi.unit, bi.line_classification,
          bi.completeness, bi.evidence_locator, c.name AS component_name, c.slug AS component_slug, c.category AS component_category
        FROM bom_items bi LEFT JOIN components c ON c.id = bi.component_id
        WHERE bi.bom_version_id = ?1 ORDER BY bi.sort_order LIMIT 100`).bind(row.current_version_id ?? "").all<{
          description: string; quantity: number; unit: string; line_classification: string; completeness: string;
          evidence_locator: string | null; component_name: string | null; component_slug: string | null; component_category: string | null;
        }>();
      const bomItemHtml = bomItemRows.results.map((l) => {
        const label = l.component_name && l.component_slug && l.component_category
          ? `<a href="${base}/parts/${encodeURIComponent(l.component_category)}/${encodeURIComponent(l.component_slug)}">${esc(importedText(l.component_name))}</a>`
          : esc(importedText(l.description));
        return `<li>${label} — ${Number(l.quantity)} ${esc(l.unit)} (${esc(l.line_classification)}, ${esc(l.completeness)})${l.evidence_locator ? ` — evidence: ${esc(l.evidence_locator)}` : ""}</li>`;
      }).join("");
      const bomItemSection = bomItemHtml ? `<h2>Line items</h2><ul>${bomItemHtml}</ul>` : "";
      // An empty BOM page exists only to show a bill of materials that has not been resolved. It is
      // served noindex,follow rather than dropped: the URL stays valid and linked, and it re-enters
      // the index on its own the moment line items land. Same reasoning as the empty /queries pages.
      const emptyBom = Number(row.line_count) === 0;
      return {
        title: conciseTitle(`${row.name}: ${row.line_count} line bill of materials | RoboPartPicker`),
        description,
        canonicalUrl,
        imageUrl: fallbackImage,
        type: "article",
        robots: emptyBom ? "noindex,follow" : INDEX_ROBOTS,
        bodyHtml: `<article><h1>${esc(row.name)}</h1><p>${esc(description)}</p>${emptyBom ? `<p>No line items have been resolved for this bill of materials yet, so this page is not offered to search engines. The catalog only indexes BOMs once real lines exist.</p>` : ""}<h2>Bill of materials facts</h2><ul>${bomFacts}</ul>${bomItemSection}<p><a href="${base}/boms">Browse all bills of materials</a> · <a href="${base}/projects">Robotics projects</a></p></article>`,
        structuredData: compact({ "@context": "https://schema.org", "@type": "Dataset", name: row.name, description, url: canonicalUrl, dateModified: row.updated_at, variableMeasured: ["Part identity", "Quantity", "Source evidence", "Observed price"], size: Number(row.line_count), isBasedOn: row.project_name || undefined }),
      };
    }
  }

  const listingDocument = await listingSeo(db, path, base, fallbackImage);
  if (listingDocument) return listingDocument;

  const staticDocument = staticSeo(path, base, fallbackImage);
  if (staticDocument) return staticDocument;
  // A route shape the app owns whose record is gone (stale project slug, renamed part).
  // Return the shared not-found document so the asset handler answers 404, not a 200
  // that merely reads "Page not found".
  return notFoundDocument(base);
}

/** Server-rendered content for catalog listing pages (home, projects, parts, boms). */
async function listingSeo(db: D1Database, path: string, base: string, fallbackImage: string): Promise<SeoDocument | null> {
  // /finder/:category is a real catalogue page in the app (Guided Finder, src/pages/Finder.tsx) but
  // had no entry here, so crawlers received the fallback document below: <title>Page not found</title>
  // with robots noindex,follow, for a URL that sitemap.xml advertises and that /queries, /parts/hand
  // and the site header all link to. Server-render the same catalogue slice a visitor sees.
  const finderMatch = path.match(/^\/finder\/([a-z0-9-]+)$/u);
  if (finderMatch && FINDER_CATEGORIES.includes(safeDecode(finderMatch[1]))) {
    const category = safeDecode(finderMatch[1]);
    const label = titleCase(category);
    const title = conciseTitle(`${label} finder: compare robotics parts and observed prices | RoboPartPicker`);
    const description = concise(`Filter ${label.toLowerCase()} components from the live RoboPartPicker catalog by observed price, number of supplier offers, open-source status and ROS support.`);
    const rows = await db.prepare(`SELECT c.name, c.slug, c.category, m.name AS maker,
        (SELECT COUNT(*) FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.unit_price_minor > 0) AS offers,
        COALESCE((SELECT MIN(so.unit_price_minor) FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.unit_price_minor > 0), 0) AS lowest_minor,
        (SELECT so.currency FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.unit_price_minor > 0 ORDER BY so.unit_price_minor LIMIT 1) AS currency
      FROM components c LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
      WHERE c.deleted_at IS NULL AND c.is_demo = 0 AND c.category = ?1
      ORDER BY offers DESC, c.name LIMIT 40`).bind(category).all<{ name: string; slug: string; category: string; maker: string | null; offers: number; lowest_minor: number; currency: string | null }>();
    const items = rows.results.map((r) => {
      const price = Number(r.offers) > 0 && Number(r.lowest_minor) > 0
        ? ` — from ${esc(r.currency ?? "USD")} ${(Number(r.lowest_minor) / 100).toFixed(2)} (${Number(r.offers)} observed offer${Number(r.offers) === 1 ? "" : "s"})`
        : " — no observed supplier offers yet";
      // Relative hrefs match the rest of the prerendered body (and keep the internal-link graph
      // readable to link auditors that never rewrite absolute same-host URLs).
      return `<li><a href="/parts/${encodeURIComponent(r.category)}/${encodeURIComponent(r.slug)}">${esc(r.name)}</a>${r.maker ? ` by ${esc(r.maker)}` : ""}${price}</li>`;
    }).join("");
    const others = FINDER_CATEGORIES.filter((entry) => entry !== category)
      .map((entry) => `<a href="/finder/${entry}">${titleCase(entry)} finder</a>`).join(" · ");
    const finderFooter = `<p><a href="/parts/${encodeURIComponent(category)}">All ${esc(label.toLowerCase())} components</a> · ${others} · <a href="/queries">Sourcing guides</a> · <a href="/developers">API and MCP</a></p>`;
    return {
      title,
      description,
      canonicalUrl: `${base}/finder/${encodeURIComponent(category)}`,
      imageUrl: fallbackImage,
      type: "website",
      // An empty catalogue slice is thin content: keep it crawlable but out of the index until
      // the category has real rows (matches the emptyBom pattern above).
      robots: rows.results.length > 0 ? INDEX_ROBOTS : "noindex,follow",
      bodyHtml: items
        ? `<article><h1>Find ${esc(label.toLowerCase())}</h1><p>${esc(description)}</p><h2>${esc(label)} components in the live catalog (${rows.results.length} shown)</h2><ul>${items}</ul>${finderFooter}</article>`
        : `<article><h1>Find ${esc(label.toLowerCase())}</h1><p>${esc(description)}</p><p>No ${esc(label.toLowerCase())} components are in the catalog yet.</p>${finderFooter}</article>`,
      structuredData: { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url: `${base}/finder/${encodeURIComponent(category)}` },
    };
  }

  const categoryMatch = path.match(/^\/parts\/([^/]+)$/u);
  if (path === "/" || path === "/projects") {
    const [stats, rows] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS total FROM projects WHERE deleted_at IS NULL AND is_demo = 0 AND status = 'published' AND visibility = 'public'`).first<{ total: number }>(),
      db.prepare(`SELECT p.slug, p.name, p.summary, p.robot_category FROM projects p
        WHERE p.deleted_at IS NULL AND p.is_demo = 0 AND p.status = 'published' AND p.visibility = 'public'
        ORDER BY p.github_stars DESC LIMIT 24`).all<{ slug: string; name: string; summary: string | null; robot_category: string | null }>(),
    ]);
    const items = rows.results.map((r) => `<li><a href="${base}/projects/${encodeURIComponent(r.slug)}">${esc(r.name)}</a>${r.robot_category ? ` — ${esc(r.robot_category)}` : ""}${r.summary ? `: ${esc(concise(r.summary))}` : ""}</li>`).join("");
    const total = Number(stats?.total ?? 0).toLocaleString();
    const isHome = path === "/";
    const description = isHome
      ? `Discover ${total} source-linked robotics projects, compile their bills of materials, compare parts and suppliers, and plan reproducible builds.`
      : `Browse ${total} source-linked open robotics projects with bills of materials, files, licenses and evidence state kept explicit.`;
    return {
      title: isHome ? "RoboPartPicker | Build real robots from proven designs" : "Discover robotics projects | RoboPartPicker",
      description,
      canonicalUrl: `${base}${path}`,
      imageUrl: fallbackImage,
      type: "website",
      robots: INDEX_ROBOTS,
      bodyHtml: `<article><h1>${isHome ? "Build real robots from proven designs" : "Discover robotics projects"}</h1><p>${esc(description)}</p><h2>Popular robotics projects</h2><ul>${items}</ul><p><a href="${base}/all-projects">Browse every project</a> · <a href="${base}/state-of-open-robotics">The state of open robotics hardware</a> · <a href="${base}/boms">Bills of materials</a> · <a href="${base}/parts/actuator">Component catalog</a> · <a href="${base}/community">Community</a> · <a href="${base}/developers">API and MCP</a></p></article>`,
      structuredData: compact({ "@context": "https://schema.org", "@type": "CollectionPage", name: isHome ? "RoboPartPicker" : "Robotics projects", description, url: `${base}${path}`, isPartOf: { "@type": "WebSite", name: "RoboPartPicker", url: base } }),
    };
  }
  if (categoryMatch) {
    const category = safeDecode(categoryMatch[1]);
    const stats = await db.prepare(`SELECT COUNT(*) AS total FROM components WHERE category = ?1 AND deleted_at IS NULL AND is_demo = 0`).bind(category).first<{ total: number }>();
    const rows = await db.prepare(`SELECT c.slug, c.name, c.summary FROM components c
      WHERE c.category = ?1 AND c.deleted_at IS NULL AND c.is_demo = 0 ORDER BY c.name COLLATE NOCASE LIMIT 24`).bind(category).all<{ slug: string; name: string; summary: string | null }>();
    if (Number(stats?.total ?? 0) > 0) {
      const items = rows.results.map((r) => `<li><a href="${base}/parts/${encodeURIComponent(category)}/${encodeURIComponent(r.slug)}">${esc(r.name)}</a>${r.summary ? `: ${esc(concise(r.summary))}` : ""}</li>`).join("");
      const total = Number(stats?.total ?? 0).toLocaleString();
      const description = `${total} ${category} components with source-backed identity, technical profiles, engineering files, project usage and explicit unknowns.`;
      return {
        title: `${category.charAt(0).toUpperCase()}${category.slice(1)} components | RoboPartPicker`,
        description,
        canonicalUrl: `${base}/parts/${encodeURIComponent(category)}`,
        imageUrl: fallbackImage,
        type: "website",
        robots: INDEX_ROBOTS,
        bodyHtml: `<article><h1>${esc(category)} components</h1><p>${esc(description)}</p><h2>Components in this category</h2><ul>${items}</ul>${queryGuideSection(category, base)}<p><a href="${base}/parts/actuator">Component catalog</a> · <a href="${base}/projects">Robotics projects</a></p></article>`,
        structuredData: compact({ "@context": "https://schema.org", "@type": "CollectionPage", name: `${category} components`, description, url: `${base}/parts/${encodeURIComponent(category)}` }),
      };
    }
  }
  if (path === "/boms") {
    const stats = await db.prepare(`SELECT
        (SELECT COUNT(*) FROM boms WHERE is_demo = 0 AND visibility = 'public') AS total,
        (SELECT COUNT(*) FROM boms b WHERE b.is_demo = 0 AND b.visibility = 'public'
          AND (SELECT COUNT(*) FROM bom_items bi WHERE bi.bom_version_id = b.current_version_id) > 0) AS resolved`).first<{ total: number; resolved: number }>();
    // Only BOMs with real line items are listed. Most records are referenced archives that have not
    // been resolved yet, and presenting those as complete bills of materials would overstate the data.
    const rows = await db.prepare(`SELECT COALESCE(b.slug, b.id) AS k, b.name, (SELECT COUNT(*) FROM bom_items bi WHERE bi.bom_version_id = b.current_version_id) AS lines
      FROM boms b WHERE b.is_demo = 0 AND b.visibility = 'public'
        AND (SELECT COUNT(*) FROM bom_items bi WHERE bi.bom_version_id = b.current_version_id) > 0
      ORDER BY b.updated_at DESC LIMIT 24`).all<{ k: string; name: string; lines: number }>();
    const items = rows.results.map((r) => `<li><a href="${base}/boms/${encodeURIComponent(r.k)}">${esc(r.name)}</a> — ${Number(r.lines).toLocaleString()} lines</li>`).join("");
    const resolved = Number(stats?.resolved ?? 0).toLocaleString();
    const total = Number(stats?.total ?? 0).toLocaleString();
    const description = `${resolved} bills of materials with resolved line items and per-line identity, quantity, source evidence and observed pricing. ${total} further BOM records are archived in the catalog; those are published with noindex until their lines are resolved.`;
    return {
      title: "Versioned bills of materials | RoboPartPicker",
      description,
      canonicalUrl: `${base}/boms`,
      imageUrl: fallbackImage,
      type: "website",
      robots: INDEX_ROBOTS,
      bodyHtml: `<article><h1>Versioned bills of materials</h1><p>${esc(description)}</p><h2>Recently updated BOMs</h2><ul>${items}</ul><p><a href="${base}/projects">Robotics projects</a> · <a href="${base}/parts/actuator">Component catalog</a></p></article>`,
      structuredData: compact({ "@context": "https://schema.org", "@type": "CollectionPage", name: "Bills of materials", description, url: `${base}/boms` }),
    };
  }
  const threadMatch = path.match(/^\/community\/t\/([^/]+)$/u);
  if (path === "/community" || threadMatch) {
    if (threadMatch) {
      const threadId = safeDecode(threadMatch[1]);
      const row = await db.prepare(`SELECT t.id, t.title, t.body, t.thread_type, t.status, t.tags_json,
          t.reply_count, t.created_at, p.display_name AS author_name
        FROM forum_threads t LEFT JOIN profiles p ON p.id = t.user_id WHERE t.id = ?1`).bind(threadId).first<{
          id: string; title: string; body: string; thread_type: string; status: string; tags_json: string;
          reply_count: number; created_at: string; author_name: string | null;
        }>();
      if (row) {
        let tags: string[] = [];
        try { tags = JSON.parse(row.tags_json) as string[]; } catch { tags = []; }
        const description = concise(row.body.replace(/[#*_>`]/gu, " ").replace(/\s+/gu, " ").trim());
        const replies = await db.prepare(`SELECT p.body, pr.display_name AS author_name FROM forum_posts p
          LEFT JOIN profiles pr ON pr.id = p.user_id WHERE p.thread_id = ?1 AND p.deleted_at IS NULL
          ORDER BY p.created_at LIMIT 20`).bind(row.id).all<{ body: string; author_name: string | null }>();
        const replyHtml = replies.results.map((r) => `<li>${esc(concise(r.body))}${r.author_name ? ` — ${esc(r.author_name)}` : ""}</li>`).join("");
        return {
          title: conciseTitle(`${row.title} | RoboPartPicker community`),
          description,
          canonicalUrl: `${base}/community/t/${encodeURIComponent(row.id)}`,
          imageUrl: fallbackImage,
          type: "article",
          robots: INDEX_ROBOTS,
          bodyHtml: `<article><h1>${esc(row.title)}</h1><p>${esc(row.thread_type.replace(/_/gu, " "))} · ${esc(row.status)} · ${Number(row.reply_count).toLocaleString()} replies · ${esc(String(row.created_at).slice(0, 10))}${row.author_name ? ` · ${esc(row.author_name)}` : ""}</p><div>${esc(row.body).replace(/\n/gu, "<br />")}</div>${tags.length ? `<p>Tags: ${tags.map((t) => esc(t)).join(", ")}</p>` : ""}${replyHtml ? `<h2>Replies</h2><ul>${replyHtml}</ul>` : ""}<p><a href="${base}/community">All community discussions</a> · <a href="${base}/projects">Robotics projects</a></p></article>`,
          structuredData: compact({ "@context": "https://schema.org", "@type": "DiscussionForumPosting", headline: row.title, text: description, url: `${base}/community/t/${encodeURIComponent(row.id)}`, datePublished: row.created_at, interactionStatistic: { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: Number(row.reply_count) } }),
        };
      }
    } else {
      const rows = await db.prepare(`SELECT t.id, t.title, t.thread_type, t.reply_count FROM forum_threads t
        ORDER BY t.pinned DESC, t.last_activity_at DESC LIMIT 30`).all<{ id: string; title: string; thread_type: string; reply_count: number }>();
      const items = rows.results.map((r) => `<li><a href="${base}/community/t/${encodeURIComponent(r.id)}">${esc(r.title)}</a> — ${esc(r.thread_type.replace(/_/gu, " "))}, ${Number(r.reply_count)} replies</li>`).join("");
      const description = "Source-linked robotics discussions: build logs, integration reports, teardowns, BOM corrections and supplier reports.";
      return {
        title: "Robotics community | RoboPartPicker",
        description,
        canonicalUrl: `${base}/community`,
        imageUrl: fallbackImage,
        type: "website",
        robots: INDEX_ROBOTS,
        bodyHtml: `<article><h1>Robotics community</h1><p>${esc(description)}</p><h2>Recent discussions</h2><ul>${items}</ul><p><a href="${base}/projects">Robotics projects</a> · <a href="${base}/boms">Bills of materials</a></p></article>`,
        structuredData: compact({ "@context": "https://schema.org", "@type": "CollectionPage", name: "Robotics community", description, url: `${base}/community` }),
      };
    }
  }
  if (path === "/glossary") {
    const items = GLOSSARY_TERMS.map((g) => `<li><strong>${esc(g.term)}</strong> — ${esc(g.definition)}</li>`).join("");
    const description = `${GLOSSARY_TERMS.length} plain-language definitions of robotics, BOM and sourcing terms, with links to live RoboPartPicker data.`;
    return {
      title: "AI and robotics pricing glossary | RoboPartPicker",
      description,
      canonicalUrl: `${base}/glossary`,
      imageUrl: fallbackImage,
      type: "website",
      robots: INDEX_ROBOTS,
      bodyHtml: `<article><h1>Robotics and sourcing glossary</h1><p>${esc(description)}</p><ul>${items}</ul><p><a href="${base}/projects">Robotics projects</a> · <a href="${base}/boms">Bills of materials</a> · <a href="${base}/queries">Sourcing questions</a></p></article>`,
      structuredData: compact({ "@context": "https://schema.org", "@type": "DefinedTermSet", name: "Robotics and sourcing glossary", url: `${base}/glossary`, hasDefinedTerm: GLOSSARY_TERMS.slice(0, 40).map((g) => ({ "@type": "DefinedTerm", name: g.term, description: g.definition })) }),
    };
  }
  if (path === "/compared-to") {
    const items = COMPARISONS.map((c) => `<li><a href="${base}/compared-to/${encodeURIComponent(c.slug)}">${esc(c.title)}</a> — ${esc(c.desc)}</li>`).join("");
    const description = `Source-backed comparisons of RoboPartPicker with ${COMPARISONS.length} alternative robotics and component sourcing tools.`;
    return {
      title: "Compare robotics sourcing tools | RoboPartPicker",
      description,
      canonicalUrl: `${base}/compared-to`,
      imageUrl: fallbackImage,
      type: "website",
      robots: INDEX_ROBOTS,
      bodyHtml: `<article><h1>Compare robotics sourcing tools</h1><p>${esc(description)}</p><ul>${items}</ul><p><a href="${base}/projects">Robotics projects</a> · <a href="${base}/parts/actuator">Component catalog</a></p></article>`,
      structuredData: compact({ "@context": "https://schema.org", "@type": "CollectionPage", name: "Robotics sourcing comparisons", description, url: `${base}/compared-to` }),
    };
  }
  const compMatch = path.match(/^\/compared-to\/([^/]+)$/u);
  if (compMatch) {
    const slug = safeDecode(compMatch[1]);
    const comp = COMPARISONS.find((c) => c.slug === slug);
    if (comp) {
      const rows = comp.rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join("");
      return {
        title: conciseTitle(comp.title),
        description: comp.desc,
        canonicalUrl: `${base}/compared-to/${encodeURIComponent(comp.slug)}`,
        imageUrl: fallbackImage,
        type: "article",
        robots: INDEX_ROBOTS,
        bodyHtml: `<article><h1>${esc(comp.title)}</h1><p>${esc(comp.desc)}</p><p><strong>Verdict:</strong> ${esc(comp.verdict)}</p><table><thead><tr><th>Dimension</th><th>RoboPartPicker</th><th>${esc(comp.subject)}</th></tr></thead><tbody>${rows}</tbody></table><p><a href="${base}/compared-to">All comparisons</a> · <a href="${base}/projects">Robotics projects</a></p></article>`,
        structuredData: compact({ "@context": "https://schema.org", "@type": "Article", headline: comp.title, description: comp.desc, url: `${base}/compared-to/${encodeURIComponent(comp.slug)}` }),
      };
    }
  }
  if (path === "/robots") {
    const rows = await db.prepare(`SELECT slug, name, robot_category FROM projects
      WHERE deleted_at IS NULL AND is_demo = 0 AND status = 'published' AND visibility = 'public'
      ORDER BY github_stars DESC LIMIT 40`).all<{ slug: string; name: string; robot_category: string | null }>();
    const items = rows.results.map((r) => `<li><a href="${base}/projects/${encodeURIComponent(r.slug)}">${esc(r.name)}</a>${r.robot_category ? ` — ${esc(r.robot_category)}` : ""}</li>`).join("");
    const description = "Robots catalogued from source-linked open robotics projects, with parts, BOMs and build evidence.";
    return {
      title: "Robots | RoboPartPicker",
      description, canonicalUrl: `${base}/robots`, imageUrl: fallbackImage, type: "website", robots: INDEX_ROBOTS,
      bodyHtml: `<article><h1>Robots</h1><p>${esc(description)}</p><ul>${items}</ul><p><a href="${base}/projects">All robotics projects</a></p></article>`,
      structuredData: compact({ "@context": "https://schema.org", "@type": "CollectionPage", name: "Robots", description, url: `${base}/robots` }),
    };
  }
  if (path === "/price-index") {
    const rows = await db.prepare(`SELECT c.name, c.slug, c.category, MIN(so.unit_price_minor) AS price, so.currency
      FROM supplier_offers so JOIN components c ON c.id = so.component_id
      WHERE so.is_demo = 0 AND so.unit_price_minor > 0 AND c.deleted_at IS NULL AND c.is_demo = 0
      GROUP BY c.id ORDER BY price LIMIT 40`).all<{ name: string; slug: string; category: string; price: number; currency: string | null }>();
    const items = rows.results.map((r) => `<li><a href="${base}/parts/${encodeURIComponent(r.category)}/${encodeURIComponent(r.slug)}">${esc(r.name)}</a> — ${esc(r.currency ?? "USD")} ${(Number(r.price) / 100).toFixed(2)} (observed estimate)</li>`).join("");
    const description = "Observed catalog prices for robotics components from source-backed supplier records. Prices are estimates, not binding quotes.";
    return {
      title: "Component price index | RoboPartPicker",
      description, canonicalUrl: `${base}/price-index`, imageUrl: fallbackImage, type: "website", robots: INDEX_ROBOTS,
      bodyHtml: `<article><h1>Component price index</h1><p>${esc(description)}</p>${items ? `<ul>${items}</ul>` : "<p>No priced components are indexed yet.</p>"}<p><a href="${base}/parts/actuator">Component catalog</a> · <a href="${base}/projects">Robotics projects</a></p></article>`,
      structuredData: compact({ "@context": "https://schema.org", "@type": "Dataset", name: "RoboPartPicker component price index", description, url: `${base}/price-index` }),
    };
  }
  return null;
}

export function staticSeo(path: string, base: string, imageUrl: string): SeoDocument | null {
  const legalDocument = LEGAL_DOCUMENT_IDS.map((id) => LEGAL_DOCUMENTS[id]).find((document) => document.path === path);
  if (legalDocument) {
    return {
      title: `${legalDocument.title} | RoboPartPicker`,
      description: legalDocument.description,
      canonicalUrl: `${base}${legalDocument.path}`,
      imageUrl,
      type: "website",
      robots: INDEX_ROBOTS,
      bodyHtml: `<article><h1>${esc(legalDocument.title)}</h1><p>${esc(legalDocument.description)}</p>${(legalDocument.sections ?? []).map((s) => `<h2>${esc(s.title)}</h2>${(s.paragraphs ?? []).map((p) => `<p>${esc(p)}</p>`).join("")}${s.bullets?.length ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}`).join("")}<p><a href="${base}/legal">Legal center</a> · <a href="${base}/contact">Contact</a> · <a href="${base}/projects">Robotics projects</a></p></article>`,
      structuredData: { "@context": "https://schema.org", "@type": "WebPage", name: legalDocument.title, description: legalDocument.description, url: `${base}${legalDocument.path}` },
    };
  }
  if (path === "/auth") {
    return {
      title: "Sign in or create an account | RoboPartPicker",
      description: "Sign in to save builds, publish projects and marketplace listings, manage organizations, and participate in the RoboPartPicker community.",
      canonicalUrl: `${base}/auth`,
      imageUrl,
      type: "website",
      robots: "noindex,follow",
    };
  }
  const privateBetaPages: Record<string, [string, string]> = {
    "/assistant": ["AI Build Assistant Beta | RoboPartPicker", "Use the Beta AI assistant to explore source-linked robotics projects, components, BOMs, and build questions."],
    "/builder": ["Build and reproduction workspace Beta | RoboPartPicker", "Create and manage private robot builds, build passports, component selections, files, and reproduction progress."],
    "/projects/new": ["Import a robotics project Beta | RoboPartPicker", "Import a robotics repository or project package, review extracted identity and BOM evidence, and publish an RPPS project."],
    "/marketplace/new": ["Publish a marketplace listing Beta | RoboPartPicker", "Create a private draft and publish a source-backed robotics part, design, robot, kit, or service listing."],
  };
  const privatePath = path.startsWith("/assistant/") ? "/assistant" : path;
  const privatePage = privateBetaPages[privatePath];
  if (privatePage) return { title: privatePage[0], description: privatePage[1], canonicalUrl: `${base}${privatePath}`, imageUrl, type: "website", robots: "noindex,follow" };
  // /developers is the documentation URL published in every machine-readable manifest
  // (.well-known/mcp.json, server-card.json, api-catalog, llms.txt) and the page MCP
  // directories link to. A one-sentence body made it useless to both readers and the
  // directory crawlers that grade a listing on its documentation.
  const developersBody = `<article>
<h1>RoboPartPicker API and MCP for robotics agents</h1>
<p>RoboPartPicker publishes a read-only Model Context Protocol server over public, source-linked robotics data: projects, bills of materials, components and RPPS package validation. No account, API key or OAuth token is required for the public tools.</p>
<h2>Public MCP endpoint</h2>
<ul>
<li>Endpoint: <code>${base}/mcp</code></li>
<li>Transport: Streamable HTTP (JSON-RPC 2.0). The server negotiates the protocol version the client asks for and currently accepts <code>2025-03-26</code> and <code>2025-06-18</code>.</li>
<li>Authentication: none for public read-only tools.</li>
<li>Discovery documents: <a href="${base}/.well-known/mcp.json">${base}/.well-known/mcp.json</a>, <a href="${base}/.well-known/mcp/server-card.json">${base}/.well-known/mcp/server-card.json</a>, <a href="${base}/.well-known/api-catalog">${base}/.well-known/api-catalog</a>, <a href="${base}/openapi.json">${base}/openapi.json</a> and <a href="${base}/llms.txt">${base}/llms.txt</a>.</li>
</ul>
<p>A plain browser navigation to the endpoint opens the event stream and shows no content, because a GET is not a JSON-RPC call. Use an MCP client, or POST JSON-RPC with an <code>Accept</code> header that includes <code>application/json, text/event-stream</code>. The server answers <code>initialize</code> by echoing the protocol version the client requested.</p>
<h2>Client configuration</h2>
<pre>{ "mcpServers": { "robopartpicker": { "url": "${base}/mcp" } } }</pre>
<h2>Tools</h2>
<h3>search_projects</h3>
<p>Search published public RPPS projects. Parameters: <code>query</code> (string, optional, up to 100 characters) and <code>limit</code> (integer, 1 to 20, default 10).</p>
<h3>get_project</h3>
<p>Retrieve one published project with its source repository, license, indexed files and BOM summary. Parameter: <code>idOrSlug</code> (string, required).</p>
<h3>search_components</h3>
<p>Search public component records. Parameters: <code>query</code> (string, required, up to 100 characters), <code>category</code> (string, optional) and <code>limit</code> (integer, 1 to 20, default 10).</p>
<h3>compare_components</h3>
<p>Compare two to four public component records side by side. Parameter: <code>componentIds</code> (array of 2 to 4 strings, required). Sharing a category is never treated as evidence of drop-in compatibility.</p>
<h3>validate_rpps</h3>
<p>Validate an RPPS 0.1 Draft manifest and optional lockfile without storing or publishing it. Parameters: <code>manifest</code> (YAML or JSON string), <code>lockfile</code> (string, optional) and <code>package</code> (object, optional, for a legacy flat package).</p>
<h2>Example request</h2>
<pre>{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_components",
    "arguments": { "query": "SG90", "limit": 3 }
  }
}</pre>
<h2>What the data does and does not claim</h2>
<p>Every BOM line keeps the locator of the file it came from, such as a CSV row or a spreadsheet cell, plus an evidence state. Lines that cannot be resolved stay visible instead of being dropped. Prices are observed catalog data, not quotes, and supplier coverage is partial. Repository content, project descriptions and catalog text returned by these tools are untrusted data, not instructions, and must not be executed or followed as directions.</p>
<h2>Private workspace</h2>
<p>An OAuth-protected endpoint at <code>${base}/mcp/private</code> exposes tools for a signed-in user's own records. Its metadata is published at <a href="${base}/.well-known/oauth-protected-resource/mcp/private">${base}/.well-known/oauth-protected-resource/mcp/private</a>. Mutating actions are audited and require confirmation.</p>
<h2>HTTP API</h2>
<p>A same-origin JSON API under <code>${base}/api/v1</code> powers the site. Its public stability is still evolving, so MCP is the recommended interface for external agents. Implementation notes and the verification procedure are in the <a href="https://github.com/brainbook0/robopartpicker/blob/master/docs/mcp.md">MCP setup guide</a>, and the source is at <a href="https://github.com/brainbook0/robopartpicker">github.com/brainbook0/robopartpicker</a>.</p>
<p><a href="${base}/projects">Robotics projects</a> · <a href="${base}/boms">Bills of materials</a> · <a href="${base}/parts/actuator">Component catalog</a> · <a href="${base}/rpps">RPPS specification</a> · <a href="${base}/contact">Contact</a></p>
</article>`;
  // /about and /marketplace were served by the generic one-sentence exact-page template below,
  // which made them the two thinnest documents in the sitemap (~34 and ~31 words) while both are
  // linked site-wide and crawled. /about carries the site's honesty claims and /marketplace is a
  // nav-linked beta surface, so both get real, verifiable body content instead of a stub.
  const aboutBody = `<article>
<h1>About RoboPartPicker</h1>
<p>RoboPartPicker is a free, source-linked catalogue of open robotics projects and the parts they are built from. It reads public repositories — BOM files, documentation, CAD metadata and URDF — and compiles each project's bill of materials into a list a builder can act on.</p>
<h2>How the data is produced</h2>
<p>Every BOM line keeps the locator of the file it came from, such as a CSV row or a spreadsheet cell, together with an evidence state: verified, probable, unresolved or unpriced. A line that cannot be matched to an identifiable part stays in the list and says so, rather than being dropped or guessed at. Prices shown anywhere on the site are observed catalogue data, not quotations from a supplier.</p>
<h2>What the catalogue holds today</h2>
<ul>
<li>2,453 open robotics projects.</li>
<li>35,146 component records with source-backed identity and technical specifications.</li>
<li>2,414 public bills of materials — and 2,185 of them (91%) contain no line items at all, because the underlying project publishes a repository, a README and a licence but no parts list. RPP reports that gap instead of hiding it; the write-up with the method and the counts is at <a href="${base}/state-of-open-robotics">${base}/state-of-open-robotics</a>.</li>
</ul>
<h2>What it is not</h2>
<p>RoboPartPicker is not a shop and does not sell parts. It does not treat a shared category as evidence that two parts are interchangeable, and it does not fill in a missing price with an estimate. Supplier coverage is partial, so an absent price means "not observed here", not "unavailable".</p>
<h2>Corrections and contributions</h2>
<p>The catalogue improves fastest when the people who have built these robots correct it. Corrections, additional sourcing evidence, removal requests and partnership inquiries are welcome through <a href="${base}/partners">${base}/partners</a> and <a href="${base}/contact">${base}/contact</a>. An open-source project that would rather not be listed can ask and it will be removed.</p>
<h2>Using the data programmatically</h2>
<p>The catalogue is published read-only through a public MCP server and a JSON API, documented at <a href="${base}/developers">${base}/developers</a>.</p>
<p><a href="${base}/projects">Robotics projects</a> · <a href="${base}/boms">Bills of materials</a> · <a href="${base}/parts/actuator">Component catalogue</a> · <a href="${base}/community">Community</a> · <a href="${base}/queries">Sourcing guides</a> · <a href="${base}/developers">API and MCP</a> · <a href="${base}/contact">Contact</a></p>
</article>`;
  const marketplaceBody = `<article>
<h1>Robotics parts and project marketplace</h1>
<p>The RoboPartPicker marketplace is a beta surface for publishing and finding source-backed robotics listings: parts, designs, robots, kits, fabrication and services, alongside "wanted" requests.</p>
<h2>Current state</h2>
<p>There are no public listings yet. The marketplace is live but empty, and listings will appear here as sellers and makers publish them. RoboPartPicker itself is not a seller and does not stock parts.</p>
<h2>While it is empty, use these</h2>
<ul>
<li><a href="${base}/projects">Robotics projects</a> — 2,453 open designs with repositories, technical files and licences.</li>
<li><a href="${base}/boms">Bills of materials</a> — 2,414 public BOMs with per-line quantities, part identity and source evidence.</li>
<li><a href="${base}/parts/actuator">Component catalogue</a> — 35,146 components with source-backed identity, specifications and observed prices where they exist.</li>
<li><a href="${base}/queries">Sourcing guides</a> — what the catalogue actually holds for a given query, including where it holds nothing.</li>
</ul>
<h2>Publishing a listing</h2>
<p>Sellers and makers can draft a listing at <a href="${base}/marketplace/new">${base}/marketplace/new</a>. Listings are reviewed against their source evidence before they become public.</p>
</article>`;
  const pages: Record<string, [string, string]> = {
    "/": ["RoboPartPicker | Build real robots from proven designs", "Discover robotics projects, inspect source-linked BOMs, compare parts, preview CAD, and plan reproducible robot builds."],
    "/projects": ["Open robotics projects with BOMs and build files | RoboPartPicker", "Browse open-source robots, hardware projects and robotics software with repositories, technical files, BOMs and build evidence."],
    "/boms": ["Robotics bills of materials | RoboPartPicker", "Browse robotics BOMs with quantities, part identities, source evidence and observed prices."],
    "/marketplace": ["Robotics parts and project marketplace | RoboPartPicker", "Browse source-linked robotics parts, designs, services and wanted requests."],
    "/suppliers": ["Completed quote method Beta | RoboPartPicker", "Learn how RoboPartPicker produces a completed itemized quote from a confirmed BOM using fresh internal price observations."],
    "/community": ["Robotics build community | RoboPartPicker", "Discuss robot builds, component integrations, BOM corrections, teardowns and reproducibility evidence."],
    "/teardowns": ["Robot teardowns and component evidence | RoboPartPicker", "Explore reviewed robot teardowns linked to exact systems, components and BOM corrections."],
    "/about": ["About RoboPartPicker", "RoboPartPicker connects robotics designs, technical files, bills of materials, parts, pricing evidence and reproducible builds."],
    "/partners": ["Robotics project and data partnerships | RoboPartPicker", "Contribute robotics projects, source-backed product records, technical files and commercial partnership inquiries."],
    "/developers": ["RoboPartPicker API and MCP for robotics agents", "Connect software and AI agents to public robotics projects, components, BOMs and RPPS validation tools."],
    "/rpps": ["Robotics Project Package Specification (RPPS)", "Validate and publish portable robotics project packages with identity, files, BOMs, build procedures and evidence."],
  };
  const exact = pages[path];
  if (exact) {
    const logoUrl = `${base}${LOGO_PATH}`;
    const structuredData: Record<string, unknown> = {
      "@context": "https://schema.org", "@type": "WebPage", name: exact[0], description: exact[1], url: `${base}${path}`,
    };
    if (path === "/") {
      structuredData["potentialAction"] = { "@type": "SearchAction", target: `${base}/projects?q={search_term_string}`, "query-input": "required name=search_term_string" };
    }
    return { title: exact[0], description: exact[1], canonicalUrl: `${base}${path}`, imageUrl, type: "website", robots: INDEX_ROBOTS,
      bodyHtml: path === "/developers" ? developersBody : path === "/about" ? aboutBody : path === "/marketplace" ? marketplaceBody : `<article><h1>${esc(exact[0].split(" | ")[0])}</h1><p>${esc(exact[1])}</p><p><a href="${base}/projects">Robotics projects</a> · <a href="${base}/boms">Bills of materials</a> · <a href="${base}/parts/actuator">Component catalog</a> · <a href="${base}/community">Community</a> · <a href="${base}/developers">API and MCP</a> · <a href="${base}/contact">Contact</a></p></article>`,
      structuredData: [
      structuredData,
      { "@context": "https://schema.org", "@type": "WebSite", name: "RoboPartPicker", url: `${base}`, image: logoUrl },
      { "@context": "https://schema.org", "@type": "Organization", name: "RoboPartPicker", url: `${base}`, logo: logoUrl, image: logoUrl, description: "Open robotics project discovery, BOM generation and parts sourcing." },
    ] };
  }
  const categoryMatch = path.match(/^\/parts\/([^/]+)$/u);
  if (categoryMatch && categoryMatch[1] !== "compare") {
    const category = safeDecode(categoryMatch[1]);
    const label = titleCase(category);
    const title = `${label} robotics parts and components | RoboPartPicker`;
    const description = `Browse ${label.toLowerCase()} components with manufacturer identity, source-backed prices, product links, specifications and robotics project usage.`;
    // Reaching this branch means listingSeo found no catalogue rows for the category (it returns
    // first whenever the category exists). Before this, any /parts/<anything> answered 200 with
    // index,follow and no body at all: an open-ended indexable-empty space that also swallowed
    // legacy single-segment part URLs. Nothing is being offered to a crawler here, so it is not
    // advertised: crawlable, noindex, still reachable by link for humans.
    return { title, description, canonicalUrl: `${base}/parts/${encodeURIComponent(category)}`, imageUrl, type: "website", robots: "noindex,follow", structuredData: { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url: `${base}/parts/${encodeURIComponent(category)}` } };
  }
  return null;
}

async function collectRows<T>(db: D1Database, query: string): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 5_000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await db.prepare(`${query} LIMIT ?1 OFFSET ?2`).bind(pageSize, offset).all<T>();
    rows.push(...page.results);
    if (page.results.length < pageSize) return rows;
  }
}

function publicBase(env: Env, requestUrl: string): string {
  return (env.PUBLIC_BASE_URL?.trim() || new URL(requestUrl).origin).replace(/\/+$/u, "");
}

function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function concise(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= 158 ? normalized : `${normalized.slice(0, 155).trimEnd()}…`;
}

function conciseTitle(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= 68 ? normalized : `${normalized.slice(0, 65).trimEnd()}…`;
}

function titleCase(value: string): string {
  return value.replace(/[-_]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== "")) as T;
}

function xml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");
}

function plain(value: string): string {
  return value.replace(/[\r\n]+/gu, " ").replace(/[<>]/gu, "").trim();
}

// ---------------------------------------------------------------------------
// Programmatic /queries pages (robot-sourcing long-tail content, from
// DataForSEO keyword research via OpenSEO MCP). Server-rendered full HTML so
// every URL is a real crawler-readable document, not an SPA shell.
// ---------------------------------------------------------------------------

const QUERY_CACHE_TTL = "public, max-age=3600, stale-while-revalidate=86400";

function htmlAttribute(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
}

function queryShell(title: string, description: string, canonical: string, body: string, structuredJson: string, robots = "index,follow,max-image-preview:large"): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${htmlAttribute(title)}</title><meta name="description" content="${htmlAttribute(description)}" />
<meta name="robots" content="${htmlAttribute(robots)}" />
<link rel="canonical" href="${htmlAttribute(canonical)}" />
<meta property="og:type" content="article" /><meta property="og:title" content="${htmlAttribute(title)}" />
<meta property="og:description" content="${htmlAttribute(description)}" /><meta property="og:url" content="${htmlAttribute(canonical)}" />
<script id="seo-structured-data" type="application/ld+json">${structuredJson}</script>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0f1214;color:#e8e6e3;line-height:1.6}main{max-width:760px;margin:0 auto;padding:32px 20px 64px}h1{font-size:1.9rem;line-height:1.25;margin:0 0 8px}a{color:#ffd000;text-decoration:none}a:hover{text-decoration:underline}.meta{color:#9aa0a6;font-size:.92rem;margin-bottom:24px}.body p{margin:0 0 16px}ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px;list-style:none;padding:0}table{border-collapse:collapse;width:100%;margin:12px 0 20px}caption{text-align:left;color:#9aa0a6;font-size:.85rem;padding:0 0 6px}th,td{text-align:left;vertical-align:top;padding:7px 9px;border-bottom:1px solid #232a31;font-size:.95rem}th{color:#9aa0a6;font-weight:600}.tag{display:inline-block;background:#1a1f24;border:1px solid #2a3138;border-radius:20px;padding:4px 12px;margin:3px;font-size:.9rem}nav.top{display:flex;gap:16px;padding:16px 20px;background:#161a1e;flex-wrap:wrap;font-size:.95rem;border-bottom:1px solid #232a31}footer{padding:32px 20px;color:#9aa0a6;font-size:.9rem;border-top:1px solid #232a31}</style></head>
<body><nav class="top"><a href="/">RoboPartPicker</a><a href="/projects">Projects</a><a href="/parts/actuator">Parts</a><a href="/boms">BOMs</a><a href="/queries">Sourcing queries</a><a href="/developers">API</a></nav><main>${body}</main>
<footer>RoboPartPicker - source-linked robotics projects, bills of materials and sourcing evidence. <a href="/sitemap.xml">Sitemap</a> \u00b7 <a href="/llms.txt">llms.txt</a></footer></body></html>`;
}

export function serveQueryIndex(c: Context<AppBindings>): Response {
  const base = publicBase(c.env, c.req.url);
  // Only list queries the catalog can actually answer; the rest are served
  // noindex and would be a dead end for a human visitor too.
  const cards = QUERIES_BY_VOLUME.filter((q) => isQueryIndexable(q.slug, QUERY_COVERAGE[q.slug])).slice(0, 300).map((q) =>
    `<li><a href="/queries/${q.slug}">${htmlAttribute(q.kw)}</a></li>`).join("");
  const body = `<h1>How to source and build open robotics projects</h1>
<p class="meta">Answers to common robotics sourcing and BOM questions, generated from live search data. Compare parts, plan builds and see what actually blocks a build.</p>
<ul>${cards}</ul>`;
  const html = queryShell(
    "Robotics sourcing questions and BOM answers | RoboPartPicker",
    "Practical answers to how to source robot parts, build open robotics projects and compare BOM costs, with source-linked evidence on RoboPartPicker.",
    `${base}/queries`, body,
    JSON.stringify([{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Robotics sourcing queries", url: `${base}/queries` }]),
  );
  return new Response(c.req.method === "HEAD" ? null : html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": QUERY_CACHE_TTL } });
}

// ---------------------------------------------------------------------------
// Query pages: each indexable page carries its own catalogue facts.
//
// The 379 indexable /queries pages were template-identical apart from the keyword
// (measured: token Jaccard 0.69-0.80 between any two of them) even though all of them
// had been crawlable and linked for weeks. Googlebot fetched them and indexed none of
// them, so the missing ingredient is per-page substance a solver could not produce
// anywhere else: the actual matched catalogue rows, their makers, their observed
// supplier prices and the category mix of the match set.
// ---------------------------------------------------------------------------

/** Catalog facts for one matched component, keyed by slug + category. */
export type QueryPartFact = {
  slug: string; category: string; name: string;
  maker: string | null; offers: number; lowestMinor: number; currency: string | null;
};

const OFFER_SUBQUERY = `(SELECT COUNT(*) FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.unit_price_minor > 0)`;

/**
 * Look up the catalogue facts behind a query page's matched components.
 *
 * QUERY_COVERAGE.ex is generated from the live catalogue, so these are real component
 * rows; the lookup only adds fields the generator did not carry. When the lookup returns
 * nothing the caller falls back to the plain link list rather than inventing anything.
 */
async function loadQueryPartFacts(db: D1Database, slugs: string[]): Promise<Map<string, QueryPartFact>> {
  const facts = new Map<string, QueryPartFact>();
  const wanted = [...new Set(slugs)].slice(0, 24);
  if (!wanted.length) return facts;
  const placeholders = wanted.map((_, index) => `?${index + 1}`).join(", ");
  const rows = await db.prepare(`SELECT c.slug, c.category, c.name, m.name AS maker,
      ${OFFER_SUBQUERY} AS offers,
      COALESCE((SELECT MIN(so.unit_price_minor) FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.unit_price_minor > 0), 0) AS lowestMinor,
      (SELECT so.currency FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.unit_price_minor > 0 ORDER BY so.unit_price_minor LIMIT 1) AS currency
    FROM components c LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
    WHERE c.deleted_at IS NULL AND c.is_demo = 0 AND c.slug IN (${placeholders})`)
    .bind(...wanted)
    .all<QueryPartFact>();
  // Keyed by slug alone: the coverage snapshot carries a `t` (type) captured when it was
  // built, and a part whose category was later corrected no longer matched, which silently
  // blanked its maker and kept the stale type. The catalogue row is authoritative.
  for (const row of rows.results ?? []) facts.set(row.slug, row);
  return facts;
}

function observedPrice(fact: QueryPartFact | undefined): string | null {
  if (!fact || Number(fact.offers) <= 0 || Number(fact.lowestMinor) <= 0) return null;
  return `${fact.currency ?? "USD"} ${(Number(fact.lowestMinor) / 100).toFixed(2)}`;
}

/**
 * The unique-per-query part of a /queries page. Pure so it can be tested without D1.
 * Every number and name comes from QUERY_COVERAGE plus the catalogue lookup; nothing is
 * estimated, and a match with no supplier offers is labelled as such rather than priced.
 */
export function queryMatchesSection(coverage: QueryCoverage | undefined, facts: Map<string, QueryPartFact>): string {
  const components = coverage?.ex ?? [];
  const projects = coverage?.px ?? [];
  const count = Number(coverage?.c ?? 0);
  const projectCount = Number(coverage?.p ?? 0);

  const resolved = components.map((entry) => {
    const fact = facts.get(entry.s);
    const type = fact?.category ?? entry.t ?? "unknown";
    return { entry, fact, type, name: fact?.name ?? entry.n, price: observedPrice(fact) };
  });

  const rows = resolved.map(({ entry, fact, type, name, price }) =>
    `<tr><td><a href="/parts/${encodeURIComponent(type)}/${encodeURIComponent(entry.s)}">${esc(name)}</a></td><td>${esc(type)}</td><td>${fact?.maker ? esc(fact.maker) : "unknown"}</td><td>${price ? `${esc(price)}${Number(fact?.offers ?? 0) > 1 ? ` (${Number(fact?.offers)} offers)` : ""}` : "no observed offers"}</td></tr>`).join("");

  const table = rows
    ? `<table><caption>Matched catalogue components (${resolved.length} shown)</caption><thead><tr><th>Component</th><th>Type</th><th>Maker</th><th>Observed price</th></tr></thead><tbody>${rows}</tbody></table>`
    : "";

  const mix = new Map<string, number>();
  for (const item of resolved) mix.set(item.type, (mix.get(item.type) ?? 0) + 1);
  const mixText = [...mix.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, n]) => `${esc(type)} (${n})`).join(", ");

  const priced = resolved.filter((item) => item.price !== null)
    .sort((a, b) => Number(a.fact?.lowestMinor ?? 0) - Number(b.fact?.lowestMinor ?? 0));

  const notes: string[] = [];
  if (mixText) notes.push(`The matches shown span ${mixText}.`);
  if (resolved.length && priced.length) {
    notes.push(`Observed supplier prices exist for ${priced.length} of the ${resolved.length} matches shown; the lowest is ${esc(priced[0].name)} at ${esc(priced[0].price ?? "")}.`);
  } else if (resolved.length) {
    notes.push(`No supplier offers are recorded for these matches yet, so any price quoted elsewhere is unverified.`);
  }
  if (projects.length) {
    notes.push(`${projects.length} published project${projects.length === 1 ? "" : "s"} in the catalogue build with matching parts, linked below with their own source evidence.`);
  }

  return `<h2>What the catalog actually has for this query</h2>
<p>${count.toLocaleString()} component${count === 1 ? "" : "s"} and ${projectCount.toLocaleString()} published project${projectCount === 1 ? "" : "s"} in the live catalog match it.</p>
${table}
${projects.length ? `<h3>Projects that use matching parts</h3><ul>${projects.map((p) => `<li><a href="/projects/${encodeURIComponent(p.s)}">${htmlAttribute(p.n)}</a></li>`).join("")}</ul>` : ""}
${notes.length ? `<h3>Sourcing notes</h3>\n<p>${notes.join(" ")}</p>` : ""}
<p class="meta">Counts come from the live catalog and change as projects are indexed. Prices shown elsewhere on RoboPartPicker are observed catalog data, not quotes.</p>`;
}

/**
 * Per-page opening paragraph. The generated `QUERIES[].body` was the same four paragraphs on all
 * 340 advertised pages with only the keyword substituted, which is the duplication Google had
 * been crawling and refusing to index (measured token Jaccard 0.69-0.80 between any two pages).
 * This paragraph is built from the page's own resolved match set instead, so no two pages share
 * it unless their catalogue evidence really is the same. Pure, so it is testable without D1.
 */
export function queryIntroSection(coverage: QueryCoverage | undefined, facts: Map<string, QueryPartFact>, kw: string): string {
  const resolved = (coverage?.ex ?? []).map((entry) => {
    const fact = facts.get(entry.s);
    return { name: fact?.name ?? entry.n, type: fact?.category ?? entry.t ?? "unknown" };
  });
  const projects = coverage?.px ?? [];
  if (!resolved.length) {
    return `<p>No component in the catalogue matches ${esc(kw)} yet. The catalogue grows as projects are indexed and this page rebuilds from live data when it does.</p>`;
  }
  const named = resolved.slice(0, 5).map((item) => `${item.name} (${item.type})`);
  const more = resolved.length - named.length;
  const projectNote = projects.length
    ? ` ${projects.length} published project${projects.length === 1 ? "" : "s"} in the catalogue build with components from that set.`
    : "";
  return `<p>Searching the live catalogue for ${esc(kw)} resolves to ${resolved.length} component${resolved.length === 1 ? "" : "s"}, starting with ${esc(named.join(", "))}${more > 0 ? ` and ${more} more listed above` : ""}.${projectNote}</p>`;
}

/**
 * Data-derived Q&A for one query page. Replaces the shipped `QUERIES[].faqs`, which were the same
 * three answers for every keyword. Every answer here is computed from this page's match set:
 * component names and categories, observed supplier prices, and matching published projects.
 * Where the catalogue has no evidence the answer says so rather than generalising.
 */
export function queryFaqPairs(coverage: QueryCoverage | undefined, facts: Map<string, QueryPartFact>, kw: string): Array<[string, string]> {
  const resolved = (coverage?.ex ?? []).map((entry) => {
    const fact = facts.get(entry.s);
    return {
      name: fact?.name ?? entry.n,
      type: fact?.category ?? entry.t ?? "unknown",
      price: observedPrice(fact),
      offers: Number(fact?.offers ?? 0),
      lowestMinor: Number(fact?.lowestMinor ?? 0),
    };
  });
  const projects = coverage?.px ?? [];
  const pairs: Array<[string, string]> = [];

  if (resolved.length) {
    const named = resolved.slice(0, 6).map((item) => `${item.name} (${item.type})`);
    pairs.push([
      `Which parts does the catalogue match for ${kw}?`,
      `${resolved.length} component${resolved.length === 1 ? "" : "s"} in the live catalogue match${resolved.length === 1 ? "es" : ""} it: ${named.join(", ")}${resolved.length > named.length ? `, among ${resolved.length - named.length} more in the table above` : ""}. Each is linked to its catalogue page with its maker, and with an observed supplier price where an offer exists.`,
    ]);
  } else {
    pairs.push([
      `Which parts does the catalogue match for ${kw}?`,
      `None yet. No catalogue component currently answers this query, so this page is not offered to search engines.`,
    ]);
  }

  const priced = resolved.filter((item) => item.price !== null)
    .sort((a, b) => a.lowestMinor - b.lowestMinor);
  if (priced.length) {
    pairs.push([
      `How much do the matched ${kw} parts cost?`,
      `Observed supplier prices exist for ${priced.length} of ${resolved.length} matches shown. The lowest is ${priced[0].name} at ${priced[0].price}${priced[0].offers > 1 ? ` across ${priced[0].offers} offers` : ""}. These are observed catalogue prices rather than quotes, and they change as suppliers change.`,
    ]);
  } else {
    pairs.push([
      `How much do the matched ${kw} parts cost?`,
      `No supplier offer is recorded for any of the ${resolved.length} matches shown yet, so any price quoted elsewhere is unverified. RoboPartPicker states a price only when a live supplier offer backs it.`,
    ]);
  }

  if (projects.length) {
    const names = projects.slice(0, 6).map((project) => project.n);
    pairs.push([
      `Which open-source robot projects use ${kw} parts?`,
      `${projects.length} published project${projects.length === 1 ? "" : "s"} in the catalogue build with components from this match set: ${names.join(", ")}${projects.length > names.length ? ", and more linked above" : ""}. Each project page carries its own bill of materials and source evidence.`,
    ]);
  } else {
    pairs.push([
      `Which open-source robot projects use ${kw} parts?`,
      `No published project in the catalogue uses a component from this match set yet. The list updates as projects are indexed.`,
    ]);
  }

  return pairs;
}

export async function serveQueryPage(c: Context<AppBindings>): Promise<Response> {
  const slug = safeDecode(c.req.param("slug") ?? "");
  const query = QUERIES.find((entry) => entry.slug === slug);
  if (!query) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  const base = publicBase(c.env, c.req.url);
  const canonical = `${base}/queries/${encodeURIComponent(query.slug)}`;
  const coverage = QUERY_COVERAGE[query.slug];
  // A page is only worth indexing when the catalog can actually answer it, and when the keyword is
  // a real parts-sourcing question rather than a coincidental token match (see query-exclusions.ts).
  // Without backing the body would be the same template for every keyword, which is scaled content
  // rather than a useful page, so it is served noindex.
  const indexable = isQueryIndexable(query.slug, coverage);
  const components = coverage?.ex ?? [];
  let facts = new Map<string, QueryPartFact>();
  if (indexable && components.length) {
    try {
      facts = await loadQueryPartFacts(c.env.DB, components.map((entry) => entry.s));
    } catch {
      // A catalogue lookup failure must not take the page down: the section falls back to
      // the generated match list without maker/price detail.
      facts = new Map<string, QueryPartFact>();
    }
  }
  const matchesHtml = indexable
    ? queryMatchesSection(coverage, facts)
    : `<p class="meta">The catalog does not have parts that match this query yet, so this page is not offered to search engines. <a href="/projects">Browse robotics projects</a> \u00b7 <a href="/queries">queries the catalog can answer</a>.</p>`;

  const faqPairs = queryFaqPairs(coverage, facts, query.kw);
  const faqHtml = faqPairs.map(([question, answer]) =>
    `<h2>${htmlAttribute(question)}</h2><p>${htmlAttribute(answer)}</p>`).join("");
  const faqSchema = indexable
    ? {
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: faqPairs.map(([question, answer]) => ({
          "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      }
    : { "@context": "https://schema.org", "@type": "WebPage", name: query.kw, url: canonical };

  const body = `<h1>${htmlAttribute(query.kw)}</h1>
<p class="meta">Robotics sourcing guide \u00b7 <a href="/queries">more sourcing queries</a> \u00b7 <a href="/developers">API and MCP</a></p>
${matchesHtml}
${queryIntroSection(coverage, facts, query.kw)}
<p>RoboPartPicker treats a robot build like a PC build: discovery, bill of materials, sourcing and planning. Paste a repository URL to get a BOM pulled from BOM files, documentation, CAD metadata and robot-description files, with every line left linked to its source evidence. Unmatched lines stay visible rather than being silently dropped, so the plan is costed against the honest bill of materials.</p>
<p><a href="/projects">Open project catalog</a> \u00b7 <a href="/parts/actuator">component categories</a> \u00b7 <a href="/boms">BOM index</a> \u00b7 <a href="/all-projects">every project</a>.</p>
<div class="body"><h2>Related questions</h2>${faqHtml}</div>`;
  const html = queryShell(
    query.title,
    query.desc,
    canonical,
    body,
    JSON.stringify(faqSchema),
    indexable ? "index,follow,max-image-preview:large" : "noindex,follow",
  );
  return new Response(c.req.method === "HEAD" ? null : html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": QUERY_CACHE_TTL } });
}

// ---------------------------------------------------------------------------
// Glossary + comparison pages (robotics sourcing educational content)
// ---------------------------------------------------------------------------

export async function serveAllProjects(c: Context<AppBindings>): Promise<Response> {
  const base = publicBase(c.env, c.req.url);
  // 2,422 of the catalog's project pages had no inbound internal link: the /projects hub renders 24
  // and paginates client-side, so a crawler could only reach the rest through the sitemap. This
  // server-rendered index links every published project exactly once, grouped by robot category.
  const rows = await collectRows<{ slug: string; name: string; robot_category: string | null; license_spdx: string | null }>(
    c.env.DB,
    `SELECT slug, name, robot_category, license_spdx FROM projects
      WHERE deleted_at IS NULL AND is_demo = 0 AND status = 'published' AND visibility = 'public'
      ORDER BY COALESCE(robot_category, 'other') COLLATE NOCASE, name COLLATE NOCASE`,
  );
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.robot_category || "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const sections = [...groups.entries()].map(([category, items]) =>
    `<h2>${esc(category)} (${items.length})</h2>\n<ul>${items.map((r) =>
      `<li><a href="${base}/projects/${encodeURIComponent(r.slug)}">${esc(r.name)}</a>${r.license_spdx ? ` — ${esc(r.license_spdx)}` : ""}</li>`).join("")}</ul>`).join("\n");
  const body = `<h1>Every robotics project in the catalog</h1>
<p class="meta">${rows.length.toLocaleString()} published open robotics projects, grouped by robot category. Each entry links to its source, license, technical files and bill-of-materials state.</p>
${sections}
<p><a href="${base}/projects">Back to project discovery</a> · <a href="${base}/boms">Bills of materials</a> · <a href="${base}/parts/actuator">Component catalog</a></p>`;
  const html = queryShell(
    "All robotics projects | RoboPartPicker",
    `Complete index of ${rows.length.toLocaleString()} open robotics projects with source links, licenses, files and bill-of-materials state.`,
    `${base}/all-projects`, body,
    JSON.stringify([{ "@context": "https://schema.org", "@type": "CollectionPage", name: "All robotics projects", url: `${base}/all-projects` }]),
  );
  return new Response(c.req.method === "HEAD" ? null : html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": QUERY_CACHE_TTL } });
}

// ---------------------------------------------------------------------------
// State of open-source robotics hardware
// ---------------------------------------------------------------------------

function barChart(rows: Array<{ label: string; value: number }>, opts: { unit?: string; width?: number } = {}): string {
  const width = opts.width ?? 640;
  const barH = 22;
  const gap = 9;
  const labelW = 132;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const height = rows.length * (barH + gap);
  const bars = rows.map((r, i) => {
    const y = i * (barH + gap);
    const w = Math.max(2, Math.round(((width - labelW - 86) * r.value) / max));
    const label = htmlAttribute(r.label.length > 22 ? `${r.label.slice(0, 21)}…` : r.label);
    return `<text x="0" y="${y + 15}" font-size="13" fill="#9aa4b2">${label}</text>
<rect x="${labelW}" y="${y + 2}" width="${w}" height="${barH - 4}" rx="3" fill="#4f8cff"/>
<text x="${labelW + w + 8}" y="${y + 15}" font-size="13" fill="#e6e9ef">${r.value.toLocaleString()}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="bar chart">${bars}</svg>`;
}

/**
 * The state of open-source robotics hardware: counts pulled from the catalog itself.
 *
 * Every figure is a COUNT over the production database; nothing here is estimated or
 * extrapolated. The page states its own method and sample size so a reader can check it,
 * and the numbers are re-derived on each cache rebuild rather than hard-coded.
 */
export async function serveStateOfOpenRobotics(c: Context<AppBindings>): Promise<Response> {
  const base = publicBase(c.env, c.req.url);
  const P = "deleted_at IS NULL AND is_demo = 0 AND status = 'published' AND visibility = 'public'";
  const [totals, bom, cats, licenses, specs, linesQ] = await Promise.all([
    collectRows<{ projects: number; components: number; with_repo: number; with_license: number }>(c.env.DB,
      `SELECT (SELECT COUNT(*) FROM projects WHERE ${P}) AS projects,
              (SELECT COUNT(*) FROM components WHERE deleted_at IS NULL AND is_demo = 0) AS components,
              (SELECT COUNT(*) FROM projects WHERE ${P} AND repository_url IS NOT NULL AND repository_url <> '') AS with_repo,
              (SELECT COUNT(*) FROM projects WHERE ${P} AND license_spdx IS NOT NULL AND license_spdx <> '') AS with_license`),
    collectRows<{ boms: number; empty: number }>(c.env.DB,
      `SELECT (SELECT COUNT(*) FROM boms WHERE is_demo = 0) AS boms,
              (SELECT COUNT(*) FROM boms b WHERE b.is_demo = 0 AND NOT EXISTS
                 (SELECT 1 FROM bom_versions v JOIN bom_items i ON i.bom_version_id = v.id WHERE v.bom_id = b.id)) AS empty`),
    collectRows<{ category: string; n: number }>(c.env.DB,
      `SELECT COALESCE(NULLIF(robot_category,''),'unclassified') AS category, COUNT(*) AS n
       FROM projects WHERE ${P} GROUP BY 1 ORDER BY n DESC`),
    collectRows<{ license: string; n: number }>(c.env.DB,
      `SELECT COALESCE(NULLIF(license_spdx,''),'not declared') AS license, COUNT(*) AS n
       FROM projects WHERE ${P} GROUP BY 1 ORDER BY n DESC`),
    collectRows<{ spec_rows: number; keys: number; with_specs: number }>(c.env.DB,
      `SELECT (SELECT COUNT(*) FROM component_specs) AS spec_rows,
              (SELECT COUNT(DISTINCT spec_key) FROM component_specs) AS keys,
              (SELECT COUNT(DISTINCT cr.component_id) FROM component_specs s
                 JOIN component_revisions cr ON cr.id = s.component_revision_id) AS with_specs`),
    // Line-level resolution, restricted to what the catalog actually serves. A bill of materials is
    // only shown publicly once a version is published (verified or partial); versions still in
    // 'draft' are stored but never rendered. Counting every stored line would overstate the
    // ecosystem, so the served figure and the stored figure are reported separately.
    collectRows<{ published_boms: number; lines: number; resolved: number; evidenced: number; components: number; projects_resolved: number }>(c.env.DB,
      `SELECT
         (SELECT COUNT(*) FROM boms b JOIN bom_versions v ON v.id = b.current_version_id
            WHERE b.is_demo = 0 AND v.publication_state IN ('verified','partial')
              AND EXISTS (SELECT 1 FROM bom_items i WHERE i.bom_version_id = b.current_version_id)) AS published_boms,
         (SELECT COUNT(*) FROM bom_items i JOIN bom_versions v ON v.id = i.bom_version_id JOIN boms b ON b.id = v.bom_id
            WHERE b.is_demo = 0 AND v.publication_state IN ('verified','partial')) AS lines,
         (SELECT COUNT(*) FROM bom_items i JOIN bom_versions v ON v.id = i.bom_version_id JOIN boms b ON b.id = v.bom_id
            WHERE b.is_demo = 0 AND v.publication_state IN ('verified','partial') AND i.component_id IS NOT NULL) AS resolved,
         (SELECT COUNT(*) FROM bom_items i JOIN bom_versions v ON v.id = i.bom_version_id JOIN boms b ON b.id = v.bom_id
            WHERE b.is_demo = 0 AND v.publication_state IN ('verified','partial') AND i.evidence_locator IS NOT NULL AND i.evidence_locator <> '') AS evidenced,
         (SELECT COUNT(DISTINCT i.component_id) FROM bom_items i JOIN bom_versions v ON v.id = i.bom_version_id JOIN boms b ON b.id = v.bom_id
            WHERE b.is_demo = 0 AND v.publication_state IN ('verified','partial') AND i.component_id IS NOT NULL) AS components,
         (SELECT COUNT(DISTINCT b.project_id) FROM bom_items i JOIN bom_versions v ON v.id = i.bom_version_id JOIN boms b ON b.id = v.bom_id
            WHERE b.is_demo = 0 AND v.publication_state IN ('verified','partial') AND i.component_id IS NOT NULL) AS projects_resolved`),
  ]);
  const t = totals[0] || { projects: 0, components: 0, with_repo: 0, with_license: 0 };
  const b = bom[0] || { boms: 0, empty: 0 };
  const s = specs[0] || { spec_rows: 0, keys: 0, with_specs: 0 };
  const l = linesQ[0] || { published_boms: 0, lines: 0, resolved: 0, evidenced: 0, components: 0, projects_resolved: 0 };
  const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
  const emptyPct = pct(b.empty, b.boms);
  const noLicense = t.projects - t.with_license;
  // GitHub reports NOASSERTION when it cannot match a licence file to a known SPDX id. Those are
  // counted separately from projects that declare nothing at all, so the two must not be added
  // twice when stating how many projects leave the licence ambiguous.
  const noassertion = licenses.find((r) => r.license === "NOASSERTION")?.n ?? 0;
  const ambiguous = noLicense + noassertion;
  const asOf = new Date().toISOString().slice(0, 10);

  const body = `<article>
<h1>The state of open-source robotics hardware</h1>
<p class="meta">A census of ${t.projects.toLocaleString()} open robotics projects, taken from the RoboPartPicker catalog on ${asOf}. Every figure below is a count over our database. Nothing is estimated, sampled, or extrapolated, and the queries are published with the data so the numbers can be checked.</p>

<h2>The headline: bills of materials are mostly empty</h2>
<p>${b.empty.toLocaleString()} of ${b.boms.toLocaleString()} bills of materials (${emptyPct}) contain no line items at all. A project can publish a repository, a README and a licence and still tell a builder nothing about what to buy. Only a small minority of projects carry a bill of materials whose lines resolve to a specific, identifiable part, which is the form a builder can actually order from.</p>
<p>This matters because a BOM is the difference between a project that reads as interesting and a project someone can reproduce. For most of the catalog, the shopping list is left as an exercise.</p>

<h2>Even the lines that exist rarely resolve to something you can order</h2>
<p>Of the ${(b.boms - b.empty).toLocaleString()} bills of materials that carry line items in any version, only ${l.published_boms.toLocaleString()} carry them in a published version — the remainder hold draft line items the catalog has never published. Those ${l.published_boms.toLocaleString()} published bills contain ${l.lines.toLocaleString()} lines, and just ${l.resolved.toLocaleString()} of them (${pct(l.resolved, l.lines)}) resolve to an identifiable component in the catalog — a part with a name, a page and source-backed specifications. ${l.components.toLocaleString()} distinct components are referenced this way. The remaining lines name something the source did not fully identify; they are kept and labelled by evidence state rather than dropped.</p>
<p>The practical consequence: only ${l.projects_resolved.toLocaleString()} of ${t.projects.toLocaleString()} projects have a published bill of materials whose lines resolve to at least one identifiable part. Where a line does exist, its provenance is traceable — ${l.evidenced.toLocaleString()} of ${l.lines.toLocaleString()} lines carry an explicit source locator pointing back at the file they came from.</p>

<h2>Licensing is often ambiguous</h2>
<p>${noLicense.toLocaleString()} of ${t.projects.toLocaleString()} projects (${pct(noLicense, t.projects)}) declare no licence at all, and ${noassertion.toLocaleString()} declare one that GitHub cannot identify as a known licence. Together that is ${ambiguous.toLocaleString()} projects (${pct(ambiguous, t.projects)}) whose terms a builder cannot rely on without asking the maintainer first. For anyone planning to build on a design commercially, that ambiguity is the first thing to resolve, and it is usually invisible from the project page.</p>
${barChart(licenses.slice(0, 8).map((r) => ({ label: r.license, value: r.n })))}

<h2>What kinds of robots these are</h2>
<p>Manipulators and humanoids dominate the catalog by count. Mobile bases, quadrupeds and aerial platforms follow. A large group resists classification entirely, which is its own finding about how projects describe themselves.</p>
${barChart(cats.slice(0, 12).map((r) => ({ label: r.category, value: r.n })))}

<h2>The component side is where the data is dense</h2>
<p>Against ${t.projects.toLocaleString()} projects, the catalog holds ${t.components.toLocaleString()} distinct components described by ${s.spec_rows.toLocaleString()} specification rows across ${s.keys} distinct spec dimensions, covering ${s.with_specs.toLocaleString()} components. Specification coverage is the part of the open-hardware ecosystem that is well documented; sourcing and assembly are the parts that are not.</p>

<h2>Method</h2>
<p>Projects counted are published, public, non-demo rows. Component and specification counts come from the component tables. BOM emptiness is measured as bills of materials with no line items attached to any version. Published line figures count only bills of materials whose current version is published (verified or partial) — the same rows the catalog actually serves; draft line items are stored but excluded from that figure. Figures were computed on ${asOf} and move as the catalog grows, so the numbers above are a snapshot rather than a fixed claim.</p>

<h2>Check it yourself</h2>
<p>The same data is available programmatically and the catalog is browsable without an account: <a href="${base}/all-projects">every project</a>, <a href="${base}/parts/actuator">the component catalog</a>, <a href="${base}/developers">the public API and MCP server</a>, and <a href="${base}/queries">the sourcing questions we answer</a>.</p>
</article>`;

  const html = queryShell(
    "The state of open-source robotics hardware | RoboPartPicker",
    `A census of ${t.projects.toLocaleString()} open robotics projects: ${emptyPct} of bills of materials are empty, only ${l.projects_resolved.toLocaleString()} have published lines that resolve to an identifiable part, and ${pct(ambiguous, t.projects)} leave the licence ambiguous.`,
    `${base}/state-of-open-robotics`, body,
    JSON.stringify([{
      "@context": "https://schema.org", "@type": "Dataset",
      name: "The state of open-source robotics hardware",
      description: `Census of ${t.projects.toLocaleString()} open robotics projects: BOM completeness, licence clarity, robot categories and component specification coverage.`,
      url: `${base}/state-of-open-robotics`,
      creator: { "@type": "Organization", name: "RoboPartPicker" },
      datePublished: asOf,
    }]),
  );
  return new Response(c.req.method === "HEAD" ? null : html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=21600, s-maxage=21600" },
  });
}

export function serveGlossaryIndex(c: Context<AppBindings>): Response {
  const base = publicBase(c.env, c.req.url);
  const cards = GLOSSARY_TERMS.map((term) =>
    `<li><a href="/glossary#${htmlAttribute(term.term.toLowerCase().replace(/[^a-z0-9]+/gu, "-"))}">${htmlAttribute(term.term)}</a></li>`).join("");
  const defs = GLOSSARY_TERMS.map((term) =>
    `<div class="entry" id="${htmlAttribute(term.term.toLowerCase().replace(/[^a-z0-9]+/gu, "-"))}"><h2>${htmlAttribute(term.term)}</h2><p>${htmlAttribute(term.definition)}</p></div>`).join("");
  const body = `<h1>Robotics sourcing glossary</h1>
<p class="meta">Plain-language definitions for the parts, formats, and workflows behind building open robotics projects.</p>
<ul>${cards}</ul>
<div class="body">${defs}</div>`;
  const html = queryShell(
    "Robotics sourcing glossary | RoboPartPicker",
    "Plain-language definitions of robotics parts, BOM formats, actuators, ROS 2, and sourcing workflows, from RoboPartPicker.",
    `${base}/glossary`, body,
    JSON.stringify([{ "@context": "https://schema.org", "@type": "WebPage", name: "Robotics sourcing glossary", url: `${base}/glossary` }]),
  );
  return new Response(c.req.method === "HEAD" ? null : html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": QUERY_CACHE_TTL } });
}

export function serveComparisonIndex(c: Context<AppBindings>): Response {
  const base = publicBase(c.env, c.req.url);
  const cards = COMPARISONS.map((comp) =>
    `<li><a href="/compared-to/${comp.slug}">${htmlAttribute(comp.title.replace(" | RoboPartPicker", ""))}</a></li>`).join("");
  const body = `<h1>RoboPartPicker compared to other sourcing and CAD tools</h1>
<p class="meta">Honest comparisons with the tools robotics builders already use, and where RoboPartPicker fits.</p>
<ul>${cards}</ul>`;
  const html = queryShell(
    "RoboPartPicker compared to other robotics sourcing tools",
    "Honest comparisons of RoboPartPicker with Octopart, DigiKey, McMaster-Carr, PCPartPicker, and GrabCAD for robotics sourcing and BOM workflows.",
    `${base}/compared-to`, body,
    JSON.stringify([{ "@context": "https://schema.org", "@type": "CollectionPage", name: "RoboPartPicker comparisons", url: `${base}/compared-to` }]),
  );
  return new Response(c.req.method === "HEAD" ? null : html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": QUERY_CACHE_TTL } });
}

export function serveComparisonPage(c: Context<AppBindings>): Response {
  const slug = safeDecode(c.req.param("slug") ?? "");
  const comp = COMPARISONS.find((entry) => entry.slug === slug);
  if (!comp) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  const base = publicBase(c.env, c.req.url);
  const canonical = `${base}/compared-to/${encodeURIComponent(comp.slug)}`;
  const table = comp.rows.map(([a, b, c]) =>
    `<tr><th>${htmlAttribute(a)}</th><td>${htmlAttribute(b)}</td><td>${htmlAttribute(c)}</td></tr>`).join("");
  const body = `<h1>${htmlAttribute(comp.title.replace(" | RoboPartPicker", ""))}</h1>
<p class="meta">${htmlAttribute(comp.subject)} vs RoboPartPicker \u00b7 <a href="/compared-to">all comparisons</a></p>
<div class="body"><p>${htmlAttribute(comp.verdict)}</p>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">
<thead><tr><th></th><th>${htmlAttribute(comp.subject)}</th><th>RoboPartPicker</th></tr></thead>
<tbody>${table}</tbody></table></div>`;
  const html = queryShell(
    comp.title, comp.desc, canonical, body,
    JSON.stringify({ "@context": "https://schema.org", "@type": "Article", name: comp.title, description: comp.desc, url: canonical }),
  );
  return new Response(c.req.method === "HEAD" ? null : html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": QUERY_CACHE_TTL } });
}

// ---------------------------------------------------------------------------
// /price-index - live component price dataset page (Dataset schema)
// ---------------------------------------------------------------------------

export async function servePriceIndex(c: Context<AppBindings>): Promise<Response> {
  const base = publicBase(c.env, c.req.url);
  const stats = await c.env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM components WHERE deleted_at IS NULL AND is_demo = 0) AS component_count,
      (SELECT COUNT(*) FROM supplier_offers WHERE is_demo = 0 AND unit_price_minor > 0) AS offer_count,
      (SELECT COUNT(DISTINCT category) FROM components WHERE deleted_at IS NULL AND is_demo = 0) AS category_count,
      (SELECT COUNT(DISTINCT supplier_id) FROM supplier_offers WHERE is_demo = 0) AS supplier_count`).first<{
        component_count: number; offer_count: number; category_count: number; supplier_count: number;
      }>();
  const categories = await c.env.DB.prepare(`SELECT category,
      COUNT(*) AS components,
      (SELECT COUNT(*) FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.unit_price_minor > 0) AS offers
    FROM components c WHERE c.deleted_at IS NULL AND c.is_demo = 0 GROUP BY category ORDER BY components DESC LIMIT 30`).all<{
        category: string; components: number; offers: number;
      }>();
  const catRows = (categories.results || []).map((row) =>
    `<tr><td><a href="/parts/${encodeURIComponent(row.category)}">${htmlAttribute(row.category)}</a></td><td>${Number(row.components).toLocaleString()}</td><td>${Number(row.offers).toLocaleString()}</td></tr>`).join("");
  const body = `<h1>RoboPartPicker component price index</h1>
<p class="meta">Live catalog statistics and observed supplier offers for open robotics components. Prices are observations, not quotes.</p>
<div class="body"><p>${Number(stats?.component_count ?? 0).toLocaleString()} components across ${Number(stats?.category_count ?? 0).toLocaleString()} categories, with ${Number(stats?.offer_count ?? 0).toLocaleString()} observed supplier offers from ${Number(stats?.supplier_count ?? 0).toLocaleString()} suppliers.</p>
<h2>Categories by catalog size</h2>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">
<thead><tr><th>Category</th><th>Components</th><th>Offers</th></tr></thead>
<tbody>${catRows}</tbody></table></div>`;
  const html = queryShell(
    "RoboPartPicker component price index",
    "Live robotics component price index: catalog size, observed supplier offers, and price data for open robotics parts, from RoboPartPicker.",
    `${base}/price-index`, body,
    JSON.stringify({ "@context": "https://schema.org", "@type": "Dataset", name: "RoboPartPicker component price index", description: "Live robotics component catalog and observed supplier offer statistics.", url: `${base}/price-index`, hasPart: "https://schema.org/Table" }),
  );
  return new Response(c.req.method === "HEAD" ? null : html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": QUERY_CACHE_TTL } });
}
