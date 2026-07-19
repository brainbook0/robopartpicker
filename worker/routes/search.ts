import { Hono } from "hono";
import type { AppBindings } from "../env";
import { AppError, parsePositiveInt } from "../http";
import { loadAuthSession } from "../middleware/authentication";

const categories = new Set(["component", "project", "manufacturer", "supplier", "offer", "build", "marketplace", "community"]);

export const searchRoutes = new Hono<AppBindings>();

searchRoutes.get("/search", loadAuthSession, async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  if (q.length < 2) throw new AppError(422, "SEARCH_QUERY_TOO_SHORT", "Search queries must contain at least two characters.");
  if (q.length > 120) throw new AppError(422, "SEARCH_QUERY_TOO_LONG", "Search queries are limited to 120 characters.");
  const requestedCategories = (c.req.query("categories") ?? "").split(",").filter((item) => categories.has(item));
  const selected = requestedCategories.length ? requestedCategories : [...categories];
  const limit = parsePositiveInt(c.req.query("limit"), 30, 100);
  const page = parsePositiveInt(c.req.query("page"), 1, 1_000);
  const userId = c.get("authSession")?.user?.id ?? "";
  const categoryPlaceholders = selected.map((_, index) => `?${index + 3}`).join(", ");
  const statement = c.env.DB.prepare(`SELECT si.entity_type AS category, si.entity_id AS id, si.title,
    snippet(search_index, 3, '<mark>', '</mark>', '…', 18) AS snippet,
    bm25(search_index, 5.0, 2.0, 1.0) AS score,
    CASE si.entity_type
      WHEN 'component' THEN '/parts/' || (SELECT category FROM components WHERE id = si.entity_id) || '/' || (SELECT slug FROM components WHERE id = si.entity_id)
      WHEN 'project' THEN '/projects/' || (SELECT slug FROM projects WHERE id = si.entity_id)
      WHEN 'manufacturer' THEN '/parts/actuator?manufacturer=' || si.entity_id
      WHEN 'supplier' THEN '/suppliers/' || (SELECT slug FROM suppliers WHERE id = si.entity_id)
      WHEN 'offer' THEN '/parts/' || (SELECT c.category FROM supplier_offers so JOIN components c ON c.id = so.component_id WHERE so.id = si.entity_id) || '/' || (SELECT c.slug FROM supplier_offers so JOIN components c ON c.id = so.component_id WHERE so.id = si.entity_id)
      WHEN 'build' THEN '/builder?build=' || si.entity_id
      WHEN 'marketplace' THEN '/marketplace/' || si.entity_id
      WHEN 'community' THEN '/community/t/' || si.entity_id
    END AS path
    FROM search_index si WHERE search_index MATCH ?1 AND si.entity_type IN (${categoryPlaceholders}) AND (
      si.entity_type IN ('component', 'manufacturer', 'supplier', 'offer', 'community')
      OR (si.entity_type = 'project' AND EXISTS (SELECT 1 FROM projects p WHERE p.id = si.entity_id AND p.deleted_at IS NULL AND
        (p.visibility IN ('public', 'unlisted') OR p.owner_user_id = ?2 OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = p.organization_id AND om.user_id = ?2 AND om.status = 'active'))))
      OR (si.entity_type = 'build' AND EXISTS (SELECT 1 FROM builds b WHERE b.id = si.entity_id AND b.deleted_at IS NULL AND
        (b.visibility IN ('public', 'unlisted') OR b.owner_user_id = ?2 OR EXISTS (SELECT 1 FROM build_members bm WHERE bm.build_id = b.id AND bm.user_id = ?2)
          OR EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = b.organization_id AND om.user_id = ?2 AND om.status = 'active'))))
      OR (si.entity_type = 'marketplace' AND EXISTS (SELECT 1 FROM marketplace_listings ml WHERE ml.id = si.entity_id AND ml.deleted_at IS NULL AND
        ((ml.status = 'published' AND ml.visibility IN ('public', 'unlisted')) OR ml.seller_user_id = ?2)))
    ) ORDER BY score, si.title LIMIT ?${selected.length + 3} OFFSET ?${selected.length + 4}`);
  const result = await statement.bind(toFtsQuery(q), userId, ...selected, limit, (page - 1) * limit).all<Record<string, unknown>>();
  return c.json({ items: result.results, page, limit, hasMore: result.results.length === limit, query: q, categories: selected });
});

function toFtsQuery(value: string): string {
  const tokens = value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}_-]+/gu)?.slice(0, 12) ?? [];
  if (!tokens.length) throw new AppError(422, "SEARCH_QUERY_INVALID", "Search must contain letters or numbers.");
  return tokens.map((token) => `"${token.replace(/"/gu, '""')}"*`).join(" AND ");
}
