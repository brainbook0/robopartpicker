import { Hono } from "hono";
import type { PartCategory } from "../../src/shared/catalog";
import { CatalogRepository } from "../db/repositories/catalog";
import type { AppBindings } from "../env";
import { AppError, parsePositiveInt } from "../http";

const CATEGORIES = new Set<PartCategory>(["actuator", "hand", "sensor", "compute", "driver", "reducer"]);

export const catalogRoutes = new Hono<AppBindings>();

catalogRoutes.get("/components", async (c) => {
  const categoryRaw = c.req.query("category");
  if (categoryRaw && !CATEGORIES.has(categoryRaw as PartCategory)) {
    throw new AppError(400, "VALIDATION_ERROR", "Unknown component category.");
  }
  const minPrice = optionalNonNegativeNumber(c.req.query("minPrice"), "minPrice");
  const maxPrice = optionalNonNegativeNumber(c.req.query("maxPrice"), "maxPrice");
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new AppError(400, "VALIDATION_ERROR", "minPrice cannot exceed maxPrice.");
  }
  const limit = parsePositiveInt(c.req.query("limit"), 50, 100);
  const page = parsePositiveInt(c.req.query("page"), 1, 10_000);
  const result = await new CatalogRepository(c.env.DB).listComponents({
    category: categoryRaw as PartCategory | undefined,
    q: cleanSearch(c.req.query("q")),
    manufacturerRegions: csv(c.req.query("manufacturerRegion")),
    supplierRegions: csv(c.req.query("supplierRegion")),
    supplierIds: csv(c.req.query("supplier")),
    makers: csv(c.req.query("manufacturer")),
    minPrice,
    maxPrice,
    inStock: c.req.query("inStock") === "true",
    limit,
    offset: (page - 1) * limit,
  });
  return c.json({
    ...result,
    page,
    limit,
    pages: Math.max(1, Math.ceil(result.total / limit)),
    dataMode: result.items.some((item) => item.isDemo) ? "demo" : "live",
  });
});

catalogRoutes.get("/components/:id", async (c) => {
  const component = await new CatalogRepository(c.env.DB).findComponent(c.req.param("id"));
  if (!component) throw new AppError(404, "COMPONENT_NOT_FOUND", "Component not found.");
  return c.json({ item: component, dataMode: component.isDemo ? "demo" : "live" });
});

catalogRoutes.get("/suppliers", async (c) => {
  const items = await new CatalogRepository(c.env.DB).listSuppliers();
  return c.json({ items, total: items.length, dataMode: items.some((item) => item.isDemo) ? "demo" : "live" });
});

catalogRoutes.get("/manufacturers", async (c) => {
  const rows = await c.env.DB.prepare(`SELECT id, slug, name, website_url AS websiteUrl,
    headquarters_region AS headquartersRegion, status, updated_at AS freshnessAt, is_demo AS isDemo
    FROM manufacturers ORDER BY name COLLATE NOCASE`).all();
  return c.json({ items: rows.results, total: rows.results.length });
});

catalogRoutes.get("/offers", async (c) => {
  const componentId = c.req.query("componentId");
  const supplierId = c.req.query("supplierId");
  if (!componentId && !supplierId) throw new AppError(400, "VALIDATION_ERROR", "componentId or supplierId is required.");
  const rows = await c.env.DB.prepare(`SELECT id, supplier_id AS supplierId, component_id AS componentId,
    currency, unit_price_minor AS unitPriceMinor, minimum_quantity AS minimumQuantity,
    stock_quantity AS stockQuantity, lead_time_days AS leadTimeDays, availability, observed_at AS observedAt, is_demo AS isDemo
    FROM supplier_offers WHERE (?1 IS NULL OR component_id = ?1) AND (?2 IS NULL OR supplier_id = ?2)
    ORDER BY unit_price_minor LIMIT 100`).bind(componentId ?? null, supplierId ?? null).all();
  return c.json({ items: rows.results, total: rows.results.length });
});

catalogRoutes.get("/integrations", async (c) => {
  const componentId = c.req.query("componentId");
  const projectId = c.req.query("projectId");
  const rows = await c.env.DB.prepare(`SELECT i.id, i.integration_type AS integrationType, i.name, i.description AS summary, i.status,
    0 AS isDemo, i.created_at AS createdAt, i.updated_at AS updatedAt
    FROM integrations i WHERE (?1 IS NULL OR EXISTS (SELECT 1 FROM integration_entities ie WHERE ie.integration_id = i.id AND ie.entity_type = 'component' AND ie.entity_id = ?1))
    AND (?2 IS NULL OR EXISTS (SELECT 1 FROM integration_entities ie WHERE ie.integration_id = i.id AND ie.entity_type = 'project' AND ie.entity_id = ?2))
    ORDER BY i.updated_at DESC LIMIT 100`).bind(componentId ?? null, projectId ?? null).all();
  return c.json({ items: rows.results, total: rows.results.length });
});

function csv(value: string | undefined): string[] | undefined {
  const result = value?.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
  return result?.length ? result : undefined;
}

function optionalNonNegativeNumber(value: string | undefined, field: string): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new AppError(400, "VALIDATION_ERROR", `${field} must be a non-negative number.`);
  return parsed;
}

function cleanSearch(value: string | undefined): string | undefined {
  const cleaned = value?.trim().slice(0, 100);
  return cleaned || undefined;
}
