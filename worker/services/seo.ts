import type { Context } from "hono";
import { buildSitemapXml, injectSeoHtml, type SeoDocument, type SitemapEntry } from "../../src/lib/server-seo";
import { LEGAL_DOCUMENT_IDS, LEGAL_DOCUMENTS } from "../../src/lib/legal-documents";
import { QUERIES, QUERIES_BY_VOLUME } from "../../src/lib/queries-data";
import { GLOSSARY_TERMS } from "../../src/lib/glossary-data";
import { COMPARISONS } from "../../src/lib/comparisons-data";
import type { AppBindings, Env } from "../env";
import { fileContentUrl } from "./file-urls";

const SOCIAL_IMAGE_PATH = "/robopartpicker-social.png";
const INDEX_ROBOTS = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";

export async function serveSeoAsset(c: Context<AppBindings>): Promise<Response> {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (c.req.method !== "GET" || !asset.headers.get("content-type")?.includes("text/html")) return asset;
  const base = publicBase(c.env, c.req.url);
  const document = await resolveSeoDocument(c.env.DB, c.req.path, base);
  const headers = new Headers(asset.headers);
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("cache-control", "public, max-age=300, stale-while-revalidate=3600");
  return new Response(injectSeoHtml(await asset.text(), document), { status: asset.status, headers });
}

export async function serveSitemap(c: Context<AppBindings>): Promise<Response> {
  const base = publicBase(c.env, c.req.url);
  const [projects, components, boms, categories] = await Promise.all([
    collectRows<{ slug: string; updated_at: string }>(c.env.DB, `SELECT slug, updated_at FROM projects WHERE deleted_at IS NULL AND is_demo = 0 AND status = 'published' AND visibility = 'public' ORDER BY id`),
    collectRows<{ slug: string; category: string; updated_at: string }>(c.env.DB, `SELECT slug, category, updated_at FROM components WHERE deleted_at IS NULL AND is_demo = 0 ORDER BY id`),
    collectRows<{ route_key: string; updated_at: string }>(c.env.DB, `SELECT COALESCE(slug, id) AS route_key, updated_at FROM boms WHERE is_demo = 0 AND visibility = 'public' ORDER BY id`),
    collectRows<{ category: string; updated_at: string }>(c.env.DB, `SELECT category, MAX(updated_at) AS updated_at FROM components WHERE deleted_at IS NULL AND is_demo = 0 GROUP BY category ORDER BY category`),
  ]);
  const entries: SitemapEntry[] = [
    "", "/projects", "/boms", "/marketplace", "/community", "/teardowns", "/about", "/partners", "/developers", "/rpps", "/finder/actuator", "/feed.xml", "/llms.txt", "/queries", "/glossary", "/compared-to", "/price-index",
    ...LEGAL_DOCUMENT_IDS.map((id) => LEGAL_DOCUMENTS[id].path),
  ].map((path) => ({ url: `${base}${path}` }));
  entries.push(...QUERIES.map((query) => ({ url: `${base}/queries/${query.slug}` })));
  entries.push(...COMPARISONS.map((comp) => ({ url: `${base}/compared-to/${comp.slug}` })));
  entries.push(...categories.map((row) => ({ url: `${base}/parts/${encodeURIComponent(row.category)}`, lastModified: row.updated_at })));
  entries.push(...projects.map((row) => ({ url: `${base}/projects/${encodeURIComponent(row.slug)}`, lastModified: row.updated_at })));
  entries.push(...components.map((row) => ({ url: `${base}/parts/${encodeURIComponent(row.category)}/${encodeURIComponent(row.slug)}`, lastModified: row.updated_at })));
  entries.push(...boms.map((row) => ({ url: `${base}/boms/${encodeURIComponent(row.route_key)}`, lastModified: row.updated_at })));
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
  const slug = safeDecode(c.req.param("slug") ?? "");
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

async function resolveSeoDocument(db: D1Database, path: string, base: string): Promise<SeoDocument> {
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
      return {
        title: conciseTitle(`${row.name}: BOM, files and build data | RoboPartPicker`),
        description,
        canonicalUrl,
        imageUrl: row.image_file_id ? `${base}${fileContentUrl(row.image_file_id)}` : fallbackImage,
        type: "article",
        robots: INDEX_ROBOTS,
        structuredData: compact({ "@context": "https://schema.org", "@type": "SoftwareSourceCode", name: row.name, description, url: canonicalUrl, codeRepository: row.repository_url, license: row.license_spdx, programmingLanguage: "Robotics", interactionStatistic: row.github_stars ? { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: row.github_stars } : undefined, additionalProperty: { "@type": "PropertyValue", name: "BOM lines", value: Number(row.bom_lines) } }),
      };
    }
  }

  const partMatch = path.match(/^\/parts\/([^/]+)\/([^/]+)$/u);
  if (partMatch && partMatch[1] !== "compare") {
    const category = safeDecode(partMatch[1]);
    const slug = safeDecode(partMatch[2]);
    const row = await db.prepare(`SELECT c.id, c.name, c.summary, c.category, c.manufacturer_part_number, c.source_url,
        c.updated_at, m.name AS maker,
        (SELECT f.id FROM component_files cf JOIN files f ON f.id = cf.file_id
          WHERE cf.component_id = c.id AND cf.purpose = 'image' AND f.status = 'ready' AND f.visibility = 'public' AND f.deleted_at IS NULL
          ORDER BY cf.sort_order LIMIT 1) AS image_file_id,
        (SELECT MIN(so.unit_price_minor) FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.unit_price_minor > 0) AS price_minor,
        (SELECT so.currency FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.unit_price_minor > 0 ORDER BY so.unit_price_minor LIMIT 1) AS currency
      FROM components c LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
      WHERE c.slug = ?1 AND c.category = ?2 AND c.deleted_at IS NULL AND c.is_demo = 0`).bind(slug, category).first<{
        id: string; name: string; summary: string | null; category: string; manufacturer_part_number: string | null; source_url: string | null;
        updated_at: string; maker: string | null; image_file_id: string | null; price_minor: number | null; currency: string | null;
      }>();
    if (row) {
      const identity = [row.maker, row.manufacturer_part_number ? `MPN ${row.manufacturer_part_number}` : null].filter(Boolean).join(" · ");
      const description = concise(row.summary || `${row.name}${identity ? ` by ${identity}` : ""}. Compare source-backed specifications, prices, project usage, files and product links.`);
      const canonicalUrl = `${base}/parts/${encodeURIComponent(row.category)}/${encodeURIComponent(slug)}`;
      const offer = row.price_minor != null ? { "@type": "Offer", price: (Number(row.price_minor) / 100).toFixed(2), priceCurrency: row.currency ?? "USD", availability: "https://schema.org/InStock" } : undefined;
      return {
        title: conciseTitle(`${row.name}${row.maker ? ` by ${row.maker}` : ""} | RoboPartPicker`),
        description,
        canonicalUrl,
        imageUrl: row.image_file_id ? `${base}${fileContentUrl(row.image_file_id)}` : fallbackImage,
        type: "product",
        robots: INDEX_ROBOTS,
        structuredData: compact({ "@context": "https://schema.org", "@type": "Product", name: row.name, description, url: canonicalUrl, mpn: row.manufacturer_part_number, manufacturer: row.maker ? { "@type": "Organization", name: row.maker } : undefined, category: row.category, offers: offer }),
      };
    }
  }

  const bomMatch = path.match(/^\/boms\/([^/]+)$/u);
  if (bomMatch) {
    const routeKey = safeDecode(bomMatch[1]);
    const row = await db.prepare(`SELECT b.id, b.slug, b.name, b.updated_at, p.name AS project_name,
        bv.currency, bv.confirmed_at,
        COUNT(bi.id) AS line_count, COALESCE(SUM(bi.quantity), 0) AS unit_count,
        COALESCE(SUM(CASE WHEN bi.evidence_locator IS NOT NULL THEN 1 ELSE 0 END), 0) AS evidence_lines
      FROM boms b LEFT JOIN projects p ON p.id = b.project_id LEFT JOIN bom_versions bv ON bv.id = b.current_version_id
      LEFT JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
      WHERE (b.id = ?1 OR b.slug = ?1) AND b.is_demo = 0 AND b.visibility = 'public' GROUP BY b.id`).bind(routeKey).first<{
        id: string; slug: string | null; name: string; updated_at: string; project_name: string | null; currency: string | null; confirmed_at: string | null;
        line_count: number; unit_count: number; evidence_lines: number;
      }>();
    if (row) {
      const canonicalKey = row.slug ?? row.id;
      const canonicalUrl = `${base}/boms/${encodeURIComponent(canonicalKey)}`;
      const description = concise(`${row.name} contains ${Number(row.line_count).toLocaleString()} line items and ${Number(row.unit_count).toLocaleString()} total units${row.project_name ? ` for ${row.project_name}` : ""}. Inspect identities, quantities, evidence and observed pricing.`);
      return {
        title: conciseTitle(`${row.name}: ${row.line_count} line bill of materials | RoboPartPicker`),
        description,
        canonicalUrl,
        imageUrl: fallbackImage,
        type: "article",
        robots: INDEX_ROBOTS,
        structuredData: compact({ "@context": "https://schema.org", "@type": "Dataset", name: row.name, description, url: canonicalUrl, dateModified: row.updated_at, variableMeasured: ["Part identity", "Quantity", "Source evidence", "Observed price"], size: Number(row.line_count), isBasedOn: row.project_name || undefined }),
      };
    }
  }

  const staticDocument = staticSeo(path, base, fallbackImage);
  if (staticDocument) return staticDocument;
  return { title: "Page not found | RoboPartPicker", description: "The requested RoboPartPicker page could not be found.", canonicalUrl: `${base}${path}`, imageUrl: fallbackImage, type: "website", robots: "noindex,follow" };
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
  if (exact) return { title: exact[0], description: exact[1], canonicalUrl: `${base}${path}`, imageUrl, type: "website", robots: INDEX_ROBOTS, structuredData: { "@context": "https://schema.org", "@type": "WebPage", name: exact[0], description: exact[1], url: `${base}${path}` } };
  const categoryMatch = path.match(/^\/parts\/([^/]+)$/u);
  if (categoryMatch && categoryMatch[1] !== "compare") {
    const category = safeDecode(categoryMatch[1]);
    const label = titleCase(category);
    const title = `${label} robotics parts and components | RoboPartPicker`;
    const description = `Browse ${label.toLowerCase()} components with manufacturer identity, source-backed prices, product links, specifications and robotics project usage.`;
    return { title, description, canonicalUrl: `${base}/parts/${encodeURIComponent(category)}`, imageUrl, type: "website", robots: INDEX_ROBOTS, structuredData: { "@context": "https://schema.org", "@type": "CollectionPage", name: title, description, url: `${base}/parts/${encodeURIComponent(category)}` } };
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

function queryShell(title: string, description: string, canonical: string, body: string, structuredJson: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${htmlAttribute(title)}</title><meta name="description" content="${htmlAttribute(description)}" />
<meta name="robots" content="index,follow,max-image-preview:large" />
<link rel="canonical" href="${htmlAttribute(canonical)}" />
<meta property="og:type" content="article" /><meta property="og:title" content="${htmlAttribute(title)}" />
<meta property="og:description" content="${htmlAttribute(description)}" /><meta property="og:url" content="${htmlAttribute(canonical)}" />
<script id="seo-structured-data" type="application/ld+json">${structuredJson}</script>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0f1214;color:#e8e6e3;line-height:1.6}main{max-width:760px;margin:0 auto;padding:32px 20px 64px}h1{font-size:1.9rem;line-height:1.25;margin:0 0 8px}a{color:#ffd000;text-decoration:none}a:hover{text-decoration:underline}.meta{color:#9aa0a6;font-size:.92rem;margin-bottom:24px}.body p{margin:0 0 16px}ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px;list-style:none;padding:0}.tag{display:inline-block;background:#1a1f24;border:1px solid #2a3138;border-radius:20px;padding:4px 12px;margin:3px;font-size:.9rem}nav.top{display:flex;gap:16px;padding:16px 20px;background:#161a1e;flex-wrap:wrap;font-size:.95rem;border-bottom:1px solid #232a31}footer{padding:32px 20px;color:#9aa0a6;font-size:.9rem;border-top:1px solid #232a31}</style></head>
<body><nav class="top"><a href="/">RoboPartPicker</a><a href="/projects">Projects</a><a href="/parts">Parts</a><a href="/boms">BOMs</a><a href="/queries">Sourcing queries</a><a href="/developers">API</a></nav><main>${body}</main>
<footer>RoboPartPicker - source-linked robotics projects, bills of materials and sourcing evidence. <a href="/sitemap.xml">Sitemap</a> \u00b7 <a href="/llms.txt">llms.txt</a></footer></body></html>`;
}

export function serveQueryIndex(c: Context<AppBindings>): Response {
  const base = publicBase(c.env, c.req.url);
  const cards = QUERIES_BY_VOLUME.slice(0, 250).map((q) =>
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

export function serveQueryPage(c: Context<AppBindings>): Response {
  const slug = safeDecode(c.req.param("slug") ?? "");
  const query = QUERIES.find((entry) => entry.slug === slug);
  if (!query) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  const base = publicBase(c.env, c.req.url);
  const canonical = `${base}/queries/${encodeURIComponent(query.slug)}`;
  const faq = query.faqs.map(([question, answer]) => ({
    "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer },
  }));
  const faqSchema = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq,
  };
  const faqHtml = query.faqs.map(([question, answer]) =>
    `<h2>${htmlAttribute(question)}</h2><p>${htmlAttribute(answer)}</p>`).join("");
  const body = `<h1>${htmlAttribute(query.kw)}</h1>
<p class="meta">Robotics sourcing guide \u00b7 search volume ${Number(query.vol).toLocaleString()} \u00b7 <a href="/queries">more sourcing queries</a></p>
${query.body}
<div class="body"><h2>Related questions</h2>${faqHtml}</div>`;
  const html = queryShell(query.title, query.desc, canonical, body, JSON.stringify(faqSchema));
  return new Response(c.req.method === "HEAD" ? null : html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": QUERY_CACHE_TTL } });
}

// ---------------------------------------------------------------------------
// Glossary + comparison pages (robotics sourcing educational content)
// ---------------------------------------------------------------------------

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
