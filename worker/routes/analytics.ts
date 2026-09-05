import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { parsePositiveInt } from "../http";
import { loadAuthSession, requireAuth } from "../middleware/authentication";
import { requirePlatformRole } from "../middleware/authorization";
import { parseJson } from "../validation";

export const analyticsRoutes = new Hono<AppBindings>();

const viewSchema = z.object({
  path: z.string().trim().min(1).max(500).refine((value) => value.startsWith("/") && !/[\u0000-\u001f\u007f]/u.test(value), "path must be a safe same-origin path"),
  referrer: z.string().trim().max(2_048).optional().default(""),
  utmSource: z.string().trim().max(100).optional().default(""),
  utmMedium: z.string().trim().max(100).optional().default(""),
  utmCampaign: z.string().trim().max(160).optional().default(""),
}).strict();
const eventSchema = z.object({
  event: z.enum(["project_preview_click", "project_open", "featured_mode_change", "featured_next", "featured_previous", "project_search", "project_filter_change", "project_sort_change", "project_zero_results", "bom_open", "quote_start", "marketplace_open", "external_source_open", "import_start", "auth_start"]),
  path: z.string().trim().min(1).max(500).refine((value) => value.startsWith("/") && !/[\u0000-\u001f\u007f]/u.test(value), "path must be a safe same-origin path"),
  targetType: z.enum(["project", "bom", "marketplace", "featured", "filter", "import", "auth", ""]).optional().default(""),
  targetId: z.string().trim().max(200).regex(/^[a-z0-9._:@/-]*$/iu).optional().default(""),
  dimensionKey: z.enum(["filter", "sort", "mode", "result_bucket", "query_length_bucket", "action", ""]).optional().default(""),
  dimensionValue: z.string().trim().max(100).regex(/^[a-z0-9 _.:@/-]*$/iu).optional().default(""),
  referrer: z.string().trim().max(2_048).optional().default(""),
  utmSource: z.string().trim().max(100).optional().default(""),
  utmMedium: z.string().trim().max(100).optional().default(""),
  utmCampaign: z.string().trim().max(160).optional().default(""),
}).strict();

const privatePath = /^\/(?:api|auth|builder|notifications|organizations|completed-quotes|admin)(?:\/|$)/u;

analyticsRoutes.post("/analytics/view", async (c) => {
  const input = await parseJson(c, viewSchema);
  if (privatePath.test(input.path)) return c.json({ accepted: false, reason: "private_route" });
  const userAgent = c.req.header("user-agent") ?? "";
  if (isBot(userAgent)) return c.json({ accepted: false, reason: "bot" });
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const timestamp = now.toISOString();
  const referrerHost = hostname(input.referrer);
  const countryCode = cleanCountry(c.req.header("cf-ipcountry"));
  const deviceClass = classifyDevice(userAgent);
  await c.env.DB.prepare(`INSERT INTO traffic_daily_metrics
      (day, path, referrer_host, utm_source, utm_medium, utm_campaign, country_code, device_class, views, first_view_at, last_view_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?9)
    ON CONFLICT(day, path, referrer_host, utm_source, utm_medium, utm_campaign, country_code, device_class)
    DO UPDATE SET views = views + 1, last_view_at = excluded.last_view_at`)
    .bind(day, input.path, referrerHost, input.utmSource, input.utmMedium, input.utmCampaign, countryCode, deviceClass, timestamp)
    .run();
  return c.json({ accepted: true }, 202);
});

analyticsRoutes.post("/analytics/event", async (c) => {
  const input = await parseJson(c, eventSchema);
  if (privatePath.test(input.path)) return c.json({ accepted: false, reason: "private_route" });
  const userAgent = c.req.header("user-agent") ?? "";
  if (isBot(userAgent)) return c.json({ accepted: false, reason: "bot" });
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const timestamp = now.toISOString();
  await c.env.DB.prepare(`INSERT INTO analytics_daily_events
      (day, event_name, path, target_type, target_id, dimension_key, dimension_value,
       referrer_host, utm_source, utm_medium, utm_campaign, country_code, device_class, events, first_event_at, last_event_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 1, ?14, ?14)
    ON CONFLICT(day, event_name, path, target_type, target_id, dimension_key, dimension_value,
      referrer_host, utm_source, utm_medium, utm_campaign, country_code, device_class)
    DO UPDATE SET events = events + 1, last_event_at = excluded.last_event_at`)
    .bind(day, input.event, input.path, input.targetType, input.targetId, input.dimensionKey, input.dimensionValue,
      hostname(input.referrer), input.utmSource, input.utmMedium, input.utmCampaign,
      cleanCountry(c.req.header("cf-ipcountry")), classifyDevice(userAgent), timestamp)
    .run();
  return c.json({ accepted: true }, 202);
});

analyticsRoutes.use("/admin/analytics/*", loadAuthSession, requireAuth, requirePlatformRole("moderator", "administrator"));

analyticsRoutes.get("/admin/analytics/summary", async (c) => {
  const days = parsePositiveInt(c.req.query("days"), 30, 90);
  const start = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const [totals, daily, paths, sources, countries, devices, eventTotals, eventDaily, eventMix] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COALESCE(SUM(views), 0) AS views FROM traffic_daily_metrics WHERE day >= ?1").bind(start),
    c.env.DB.prepare("SELECT day, SUM(views) AS views FROM traffic_daily_metrics WHERE day >= ?1 GROUP BY day ORDER BY day").bind(start),
    c.env.DB.prepare("SELECT path, SUM(views) AS views FROM traffic_daily_metrics WHERE day >= ?1 GROUP BY path ORDER BY views DESC, path LIMIT 50").bind(start),
    c.env.DB.prepare("SELECT COALESCE(NULLIF(utm_source, ''), NULLIF(referrer_host, ''), 'direct') AS source, SUM(views) AS views FROM traffic_daily_metrics WHERE day >= ?1 GROUP BY source ORDER BY views DESC LIMIT 30").bind(start),
    c.env.DB.prepare("SELECT COALESCE(NULLIF(country_code, ''), 'unknown') AS country, SUM(views) AS views FROM traffic_daily_metrics WHERE day >= ?1 GROUP BY country ORDER BY views DESC LIMIT 30").bind(start),
    c.env.DB.prepare("SELECT device_class AS device, SUM(views) AS views FROM traffic_daily_metrics WHERE day >= ?1 GROUP BY device ORDER BY views DESC").bind(start),
    c.env.DB.prepare("SELECT COALESCE(SUM(events), 0) AS events FROM analytics_daily_events WHERE day >= ?1").bind(start),
    c.env.DB.prepare("SELECT day, SUM(events) AS events FROM analytics_daily_events WHERE day >= ?1 GROUP BY day ORDER BY day").bind(start),
    c.env.DB.prepare("SELECT event_name AS event, SUM(events) AS events FROM analytics_daily_events WHERE day >= ?1 GROUP BY event_name ORDER BY events DESC, event LIMIT 50").bind(start),
  ]);
  return c.json({
    item: {
      days,
      start,
      totalViews: Number((totals.results[0] as { views?: number } | undefined)?.views ?? 0),
      daily: daily.results,
      topPaths: paths.results,
      sources: sources.results,
      countries: countries.results,
      devices: devices.results,
      totalEvents: Number((eventTotals.results[0] as { events?: number } | undefined)?.events ?? 0),
      eventDaily: eventDaily.results,
      eventMix: eventMix.results,
      privacy: { cookies: false, ipStored: false, userIdentityStored: false, rawEventsStored: false, aggregation: "daily" },
    },
  });
});

analyticsRoutes.get("/admin/analytics/content", async (c) => {
  const { days, start } = analyticsRange(c.req.query("days"));
  const [projects, funnel, featured] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT target_id AS project, event_name AS event, SUM(events) AS events
      FROM analytics_daily_events WHERE day >= ?1 AND target_type = 'project' AND target_id <> ''
      GROUP BY target_id, event_name ORDER BY events DESC LIMIT 100`).bind(start),
    c.env.DB.prepare(`SELECT event_name AS event, SUM(events) AS events FROM analytics_daily_events
      WHERE day >= ?1 AND event_name IN ('project_preview_click','project_open','bom_open','quote_start','marketplace_open')
      GROUP BY event_name ORDER BY events DESC`).bind(start),
    c.env.DB.prepare(`SELECT event_name AS event, dimension_value AS mode, SUM(events) AS events FROM analytics_daily_events
      WHERE day >= ?1 AND event_name IN ('featured_mode_change','featured_next','featured_previous')
      GROUP BY event_name, dimension_value ORDER BY events DESC`).bind(start),
  ]);
  return c.json({ item: { days, start, projects: projects.results, funnel: funnel.results, featured: featured.results } });
});

analyticsRoutes.get("/admin/analytics/discovery", async (c) => {
  const { days, start } = analyticsRange(c.req.query("days"));
  const [filters, sorts, searches, zeroResults] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT dimension_value AS filter, SUM(events) AS events FROM analytics_daily_events
      WHERE day >= ?1 AND event_name = 'project_filter_change' GROUP BY dimension_value ORDER BY events DESC LIMIT 100`).bind(start),
    c.env.DB.prepare(`SELECT dimension_value AS sort, SUM(events) AS events FROM analytics_daily_events
      WHERE day >= ?1 AND event_name = 'project_sort_change' GROUP BY dimension_value ORDER BY events DESC`).bind(start),
    c.env.DB.prepare(`SELECT dimension_value AS queryLength, SUM(events) AS events FROM analytics_daily_events
      WHERE day >= ?1 AND event_name = 'project_search' GROUP BY dimension_value ORDER BY events DESC`).bind(start),
    c.env.DB.prepare(`SELECT day, SUM(events) AS events FROM analytics_daily_events
      WHERE day >= ?1 AND event_name = 'project_zero_results' GROUP BY day ORDER BY day`).bind(start),
  ]);
  return c.json({ item: { days, start, filters: filters.results, sorts: sorts.results, searches: searches.results, zeroResults: zeroResults.results } });
});

analyticsRoutes.get("/admin/analytics/acquisition", async (c) => {
  const { days, start } = analyticsRange(c.req.query("days"));
  const [sources, campaigns, countries, devices] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COALESCE(NULLIF(utm_source,''),NULLIF(referrer_host,''),'direct') AS source,SUM(views) views FROM traffic_daily_metrics WHERE day>=?1 GROUP BY source ORDER BY views DESC LIMIT 50").bind(start),
    c.env.DB.prepare("SELECT COALESCE(NULLIF(utm_campaign,''),'none') AS campaign,SUM(views) views FROM traffic_daily_metrics WHERE day>=?1 GROUP BY campaign ORDER BY views DESC LIMIT 50").bind(start),
    c.env.DB.prepare("SELECT COALESCE(NULLIF(country_code,''),'unknown') AS country,SUM(views) views FROM traffic_daily_metrics WHERE day>=?1 GROUP BY country ORDER BY views DESC LIMIT 50").bind(start),
    c.env.DB.prepare("SELECT device_class AS device,SUM(views) views FROM traffic_daily_metrics WHERE day>=?1 GROUP BY device ORDER BY views DESC").bind(start),
  ]);
  return c.json({ item: { days, start, sources: sources.results, campaigns: campaigns.results, countries: countries.results, devices: devices.results } });
});

analyticsRoutes.get("/admin/analytics/catalog-health", async (c) => {
  const [projects, bomStates, coverage] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN COALESCE(repository_url,upstream_url) IS NOT NULL THEN 1 ELSE 0 END) withSource,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM project_files pf JOIN files f ON f.id=pf.file_id WHERE pf.project_id=projects.id AND f.kind='image' AND f.status='ready' AND f.deleted_at IS NULL) THEN 1 ELSE 0 END) withMedia,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM project_files pf JOIN files f ON f.id=pf.file_id WHERE pf.project_id=projects.id AND f.kind='cad' AND f.status='ready' AND f.deleted_at IS NULL) THEN 1 ELSE 0 END) withCad,
      SUM(CASE WHEN COALESCE(last_checked_at,updated_at) < datetime('now','-180 days') THEN 1 ELSE 0 END) stale
      FROM projects WHERE deleted_at IS NULL AND is_demo=0 AND status='published' AND visibility='public'`),
    c.env.DB.prepare(`SELECT bv.publication_state state,COUNT(*) count FROM boms b JOIN bom_versions bv ON bv.id=b.current_version_id
      WHERE b.is_demo=0 AND b.visibility='public' GROUP BY bv.publication_state ORDER BY count DESC`),
    c.env.DB.prepare(`SELECT
      SUM(CASE WHEN ppe.id IS NOT NULL THEN 1 ELSE 0 END) activePrices,
      SUM(CASE WHEN p.project_kind='physical_design' THEN 1 ELSE 0 END) inferredEligible,
      COUNT(*) total
      FROM projects p LEFT JOIN project_price_estimates ppe ON ppe.project_id=p.id AND ppe.status='active'
      WHERE p.deleted_at IS NULL AND p.is_demo=0 AND p.status='published' AND p.visibility='public'`),
  ]);
  return c.json({ item: { projects: projects.results[0] ?? {}, bomStates: bomStates.results, priceCoverage: coverage.results[0] ?? {} } });
});

analyticsRoutes.get("/admin/analytics/operations", async (c) => {
  const [imports, bomRuns, quotes, claims] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT status,COUNT(*) count FROM import_jobs GROUP BY status ORDER BY count DESC"),
    c.env.DB.prepare("SELECT status,COUNT(*) count FROM bom_generation_runs GROUP BY status ORDER BY count DESC"),
    c.env.DB.prepare("SELECT status,COUNT(*) count FROM customer_quote_requests GROUP BY status ORDER BY count DESC"),
    c.env.DB.prepare("SELECT status,COUNT(*) count FROM project_claim_requests GROUP BY status ORDER BY count DESC"),
  ]);
  return c.json({ item: { imports: imports.results, bomRuns: bomRuns.results, quotes: quotes.results, claims: claims.results, generatedAt: new Date().toISOString() } });
});

analyticsRoutes.get("/admin/analytics/export.csv", async (c) => {
  const { days, start } = analyticsRange(c.req.query("days"));
  const rows = await c.env.DB.prepare(`SELECT day,event_name,path,target_type,target_id,dimension_key,dimension_value,SUM(events) events
    FROM analytics_daily_events WHERE day>=?1 GROUP BY day,event_name,path,target_type,target_id,dimension_key,dimension_value
    ORDER BY day DESC,events DESC LIMIT 5000`).bind(start).all<Record<string, unknown>>();
  const columns = ["day","event_name","path","target_type","target_id","dimension_key","dimension_value","events"];
  const csv = [columns.join(","), ...rows.results.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
  c.header("content-type", "text/csv; charset=utf-8");
  c.header("content-disposition", `attachment; filename=robopartpicker-analytics-${days}d.csv`);
  return c.body(csv);
});

function analyticsRange(value: string | undefined): { days: number; start: string } {
  const days = parsePositiveInt(value, 30, 90);
  return { days, start: new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10) };
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function hostname(value: string): string {
  if (!value) return "";
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./u, "").slice(0, 253); }
  catch { return ""; }
}

function cleanCountry(value: string | undefined): string {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/u.test(normalized) ? normalized : "";
}

function classifyDevice(userAgent: string): "desktop" | "mobile" | "tablet" | "unknown" {
  if (!userAgent) return "unknown";
  if (/ipad|tablet|kindle|silk/iu.test(userAgent)) return "tablet";
  if (/mobile|iphone|android/iu.test(userAgent)) return "mobile";
  return "desktop";
}

function isBot(userAgent: string): boolean {
  return /bot|crawler|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|twitterbot/iu.test(userAgent);
}
