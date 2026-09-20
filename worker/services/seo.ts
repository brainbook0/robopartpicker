import type { Context } from "hono";
import { buildSitemapXml, injectSeoHtml, type SeoDocument, type SitemapEntry } from "../../src/lib/server-seo";
import { LEGAL_DOCUMENT_IDS, LEGAL_DOCUMENTS } from "../../src/lib/legal-documents";
import { QUERIES, QUERIES_BY_VOLUME } from "../../src/lib/queries-data";
import { QUERY_COVERAGE, QUERY_INDEXABLE_SLUGS } from "../../src/lib/query-coverage";
import { GLOSSARY_TERMS } from "../../src/lib/glossary-data";
import { COMPARISONS } from "../../src/lib/comparisons-data";
import type { AppBindings, Env } from "../env";
import { fileContentUrl } from "./file-urls";

const SOCIAL_IMAGE_PATH = "/robopartpicker-social.png";
const LOGO_PATH = "/robopartpicker-logo.png";
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
    collectRows<{ route_key: string; updated_at: string; lines: number }>(c.env.DB, `SELECT COALESCE(b.slug, b.id) AS route_key, b.updated_at,
        (SELECT COUNT(*) FROM bom_items bi WHERE bi.bom_version_id = b.current_version_id) AS lines
      FROM boms b WHERE b.is_demo = 0 AND b.visibility = 'public' ORDER BY b.id`),
    collectRows<{ category: string; updated_at: string }>(c.env.DB, `SELECT category, MAX(updated_at) AS updated_at FROM components WHERE deleted_at IS NULL AND is_demo = 0 GROUP BY category ORDER BY category`),
  ]);
  const entries: SitemapEntry[] = [
    "", "/projects", "/boms", "/marketplace", "/community", "/teardowns", "/about", "/partners", "/developers", "/rpps", "/finder/actuator", "/feed.xml", "/llms.txt", "/queries", "/glossary", "/compared-to", "/price-index",
    ...LEGAL_DOCUMENT_IDS.map((id) => LEGAL_DOCUMENTS[id].path),
  ].map((path) => ({ url: `${base}${path}` }));
  // Only the query pages the catalog can actually answer are advertised. The rest
  // are served noindex, so listing them here would just be a duplicate-content
  // invitation with no unique value behind it.
  const indexable = new Set(QUERY_INDEXABLE_SLUGS);
  entries.push(...QUERIES.filter((query) => indexable.has(query.slug)).map((query) => ({ url: `${base}/queries/${query.slug}` })));
  entries.push(...COMPARISONS.map((comp) => ({ url: `${base}/compared-to/${comp.slug}` })));
  entries.push(...categories.map((row) => ({ url: `${base}/parts/${encodeURIComponent(row.category)}`, lastModified: row.updated_at })));
  entries.push(...projects.map((row) => ({ url: `${base}/projects/${encodeURIComponent(row.slug)}`, lastModified: row.updated_at })));
  entries.push(...components.map((row) => ({ url: `${base}/parts/${encodeURIComponent(row.category)}/${encodeURIComponent(row.slug)}`, lastModified: row.updated_at })));
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

function esc(value: string): string {
  return String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
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
      const facts = [
        row.robot_category ? `<li>Category: ${esc(row.robot_category)}</li>` : "",
        row.project_kind ? `<li>Kind: ${esc(row.project_kind.replace(/_/gu, " "))}</li>` : "",
        row.license_spdx ? `<li>License: ${esc(row.license_spdx)}</li>` : "",
        `<li>GitHub stars: ${Number(row.github_stars || 0).toLocaleString()}</li>`,
        `<li>BOM lines indexed: ${Number(row.bom_lines || 0).toLocaleString()}</li>`,
        `<li>Last updated: ${esc(String(row.updated_at).slice(0, 10))}</li>`,
      ].filter(Boolean).join("");
      const repoLink = row.repository_url ? `<p>Source repository: <a href="${esc(row.repository_url)}">${esc(row.repository_url)}</a></p>` : "";
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
          ? `<a href="${base}/parts/${encodeURIComponent(l.component_category)}/${encodeURIComponent(l.component_slug)}">${esc(l.component_name)}</a>`
          : esc(l.description);
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
      return {
        title: conciseTitle(`${row.name}: BOM, files and build data | RoboPartPicker`),
        description,
        canonicalUrl,
        imageUrl: row.image_file_id ? `${base}${fileContentUrl(row.image_file_id)}` : fallbackImage,
        type: "article",
        robots: INDEX_ROBOTS,
        bodyHtml: `<article><h1>${esc(row.name)}</h1><p>${esc(description)}</p>${repoLink}<h2>Project facts</h2><ul>${facts}</ul>${bomSection}${relatedSection}<p><a href="${base}/projects">Browse all robotics projects</a> · <a href="${base}/boms/${encodeURIComponent(slug)}-bom">Full bill of materials</a> · <a href="${base}/community">Community evidence</a></p></article>`,
        structuredData: compact({ "@context": "https://schema.org", "@type": "SoftwareSourceCode", name: row.name, description, url: canonicalUrl, codeRepository: row.repository_url, license: row.license_spdx, programmingLanguage: "Robotics", interactionStatistic: row.github_stars ? { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: row.github_stars } : undefined, additionalProperty: { "@type": "PropertyValue", name: "BOM lines", value: Number(row.bom_lines) } }),
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
      const bodyHtml = `<article><h1>${esc(row.name)}</h1><p>${esc(description)}</p>${sourceLink}<h2>Component facts</h2><ul>${partFacts}</ul>${specSection}${fileSection}${usageSection}${siblingSection}<p><a href="${base}/parts/${encodeURIComponent(row.category)}">More ${esc(row.category)} components</a> · <a href="${base}/projects">Robotics projects</a></p></article>`;
      return {
        title: conciseTitle(`${row.name}${row.maker ? ` by ${row.maker}` : ""} | RoboPartPicker`),
        description,
        canonicalUrl,
        imageUrl: row.image_file_id ? `${base}${fileContentUrl(row.image_file_id)}` : fallbackImage,
        type: "product",
        robots: INDEX_ROBOTS,
        bodyHtml,
        structuredData: compact({ "@context": "https://schema.org", "@type": "Product", name: row.name, description, url: canonicalUrl, mpn: row.manufacturer_part_number, manufacturer: row.maker ? { "@type": "Organization", name: row.maker } : undefined, category: row.category, offers: offer, additionalProperty: specRows.results.slice(0, 12).map((s) => ({ "@type": "PropertyValue", name: s.label || titleCase(s.spec_key), value: `${s.value_text ?? ""}${s.unit ? ` ${s.unit}` : ""}`.trim() })) }),
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
          ? `<a href="${base}/parts/${encodeURIComponent(l.component_category)}/${encodeURIComponent(l.component_slug)}">${esc(l.component_name)}</a>`
          : esc(l.description);
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
  return { title: "Page not found | RoboPartPicker", description: "The requested RoboPartPicker page could not be found.", canonicalUrl: `${base}${path}`, imageUrl: fallbackImage, type: "website", robots: "noindex,follow" };
}

/** Server-rendered content for catalog listing pages (home, projects, parts, boms). */
async function listingSeo(db: D1Database, path: string, base: string, fallbackImage: string): Promise<SeoDocument | null> {
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
      bodyHtml: `<article><h1>${isHome ? "Build real robots from proven designs" : "Discover robotics projects"}</h1><p>${esc(description)}</p><h2>Popular robotics projects</h2><ul>${items}</ul><p><a href="${base}/boms">Bills of materials</a> · <a href="${base}/parts/actuator">Component catalog</a> · <a href="${base}/community">Community</a> · <a href="${base}/developers">API and MCP</a></p></article>`,
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
        bodyHtml: `<article><h1>${esc(category)} components</h1><p>${esc(description)}</p><h2>Components in this category</h2><ul>${items}</ul><p><a href="${base}/parts/actuator">Component catalog</a> · <a href="${base}/projects">Robotics projects</a></p></article>`,
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
      bodyHtml: `<article><h1>${esc(exact[0].split(" | ")[0])}</h1><p>${esc(exact[1])}</p><p><a href="${base}/projects">Robotics projects</a> · <a href="${base}/boms">Bills of materials</a> · <a href="${base}/parts/actuator">Component catalog</a> · <a href="${base}/community">Community</a> · <a href="${base}/developers">API and MCP</a> · <a href="${base}/contact">Contact</a></p></article>`,
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

function queryShell(title: string, description: string, canonical: string, body: string, structuredJson: string, robots = "index,follow,max-image-preview:large"): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${htmlAttribute(title)}</title><meta name="description" content="${htmlAttribute(description)}" />
<meta name="robots" content="${htmlAttribute(robots)}" />
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
  // Only list queries the catalog can actually answer; the rest are served
  // noindex and would be a dead end for a human visitor too.
  const cards = QUERIES_BY_VOLUME.filter((q) => QUERY_COVERAGE[q.slug]?.ix).slice(0, 300).map((q) =>
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
  const coverage = QUERY_COVERAGE[query.slug];
  // A page is only worth indexing when the catalog can actually answer it.
  // Without backing the body would be the same template for every keyword, which
  // is scaled content rather than a useful page, so it is served noindex.
  const indexable = Boolean(coverage?.ix);
  const faq = query.faqs.map(([question, answer]) => ({
    "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer },
  }));
  const faqSchema = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq,
  };
  const faqHtml = query.faqs.map(([question, answer]) =>
    `<h2>${htmlAttribute(question)}</h2><p>${htmlAttribute(answer)}</p>`).join("");

  const components = coverage?.ex ?? [];
  const projects = coverage?.px ?? [];
  const matchesHtml = indexable
    ? `<h2>What the catalog actually has for this query</h2>
<p>${Number(coverage?.c ?? 0).toLocaleString()} component${(coverage?.c ?? 0) === 1 ? "" : "s"} and ${Number(coverage?.p ?? 0).toLocaleString()} published project${(coverage?.p ?? 0) === 1 ? "" : "s"} in the live catalog match it.</p>
${components.length ? `<ul>${components.map((e) => `<li><a href="/parts/${encodeURIComponent(e.t ?? "unknown")}/${encodeURIComponent(e.s)}">${htmlAttribute(e.n)}</a></li>`).join("")}</ul>` : ""}
${projects.length ? `<h3>Projects that use matching parts</h3><ul>${projects.map((p) => `<li><a href="/projects/${encodeURIComponent(p.s)}">${htmlAttribute(p.n)}</a></li>`).join("")}</ul>` : ""}
<p class="meta">Counts come from the live catalog and change as projects are indexed. Prices shown elsewhere on RoboPartPicker are observed catalog data, not quotes.</p>`
    : `<p class="meta">The catalog does not have parts that match this query yet, so this page is not offered to search engines. <a href="/projects">Browse robotics projects</a> \u00b7 <a href="/queries">queries the catalog can answer</a>.</p>`;

  const body = `<h1>${htmlAttribute(query.kw)}</h1>
<p class="meta">Robotics sourcing guide \u00b7 search volume ${Number(query.vol).toLocaleString()} \u00b7 <a href="/queries">more sourcing queries</a></p>
${matchesHtml}
${query.body}
<div class="body"><h2>Related questions</h2>${faqHtml}</div>`;
  const html = queryShell(
    query.title,
    query.desc,
    canonical,
    body,
    JSON.stringify(indexable ? faqSchema : { "@context": "https://schema.org", "@type": "WebPage", name: query.kw, url: canonical }),
    indexable ? "index,follow,max-image-preview:large" : "noindex,follow",
  );
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
