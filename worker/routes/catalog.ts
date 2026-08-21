import { Hono } from "hono";
import { OfferValidationError, normalizeOfferWriteInput } from "../../src/shared/offer";
import { CatalogRepository } from "../db/repositories/catalog";
import type { AppBindings } from "../env";
import { AppError, parsePositiveInt } from "../http";
import { sha256 } from "../services/ingestion";

export const catalogRoutes = new Hono<AppBindings>();

catalogRoutes.get("/components", async (c) => {
  const categoryRaw = c.req.query("category")?.trim();
  // Components span many live, data-driven categories (electronics, connector,
  // ic, actuator, cable, ...); validate shape rather than a closed allow-list.
  if (categoryRaw && (categoryRaw.length > 60 || !/^[a-z0-9][a-z0-9_-]*$/i.test(categoryRaw))) {
    throw new AppError(400, "VALIDATION_ERROR", "category must be a valid catalog category.");
  }
  const category = categoryRaw || undefined;
  const minPrice = optionalNonNegativeNumber(c.req.query("minPrice"), "minPrice");
  const maxPrice = optionalNonNegativeNumber(c.req.query("maxPrice"), "maxPrice");
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new AppError(400, "VALIDATION_ERROR", "minPrice cannot exceed maxPrice.");
  }
  const limit = parsePositiveInt(c.req.query("limit"), 50, 100);
  const page = parsePositiveInt(c.req.query("page"), 1, 10_000);
  const result = await new CatalogRepository(c.env.DB).listComponents({
    category,
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
  return c.json({ items, total: items.length, dataMode: "live" });
});

catalogRoutes.get("/manufacturers", async (c) => {
  const rows = await c.env.DB.prepare(`SELECT id, slug, name, website_url AS websiteUrl,
    headquarters_region AS headquartersRegion, status, updated_at AS freshnessAt, is_demo AS isDemo
    FROM manufacturers WHERE is_demo = 0 ORDER BY name COLLATE NOCASE`).all();
  return c.json({ items: rows.results, total: rows.results.length });
});

catalogRoutes.get("/offers", async (c) => {
  const componentId = c.req.query("componentId");
  const supplierId = c.req.query("supplierId");
  if (!componentId && !supplierId) throw new AppError(400, "VALIDATION_ERROR", "componentId or supplierId is required.");
  const rows = await c.env.DB.prepare(`SELECT id, supplier_id AS supplierId, component_id AS componentId,
    currency, unit_price_minor AS unitPriceMinor, minimum_quantity AS minimumQuantity,
    stock_quantity AS stockQuantity, lead_time_days AS leadTimeDays, availability, condition,
    price_breaks AS priceBreaks, reliability_score AS reliabilityScore, risk_label AS riskLabel,
    freshness_label AS freshnessLabel, observed_at AS observedAt, is_demo AS isDemo
    FROM supplier_offers WHERE is_demo = 0
      AND EXISTS (SELECT 1 FROM suppliers s WHERE s.id = supplier_offers.supplier_id AND s.is_demo = 0)
      AND (?1 IS NULL OR component_id = ?1) AND (?2 IS NULL OR supplier_id = ?2)
    ORDER BY unit_price_minor LIMIT 100`).bind(componentId ?? null, supplierId ?? null).all();
  return c.json({ items: rows.results, total: rows.results.length });
});

catalogRoutes.put("/offers/:id", async (c) => {
  await requireIngestionCredential(c.req.raw.headers, c.env.INGESTION_SECRET);
  const id = c.req.param("id");
  const repo = new CatalogRepository(c.env.DB);
  const existing = await repo.getOfferById(id);
  if (!existing) throw new AppError(404, "OFFER_NOT_FOUND", "Offer not found.");
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") throw new AppError(400, "VALIDATION_ERROR", "A JSON body is required.");
  let input;
  try {
    input = normalizeOfferWriteInput({
      ...body,
      offerId: id,
      supplierId: body.supplierId ?? existing.supplierId,
      componentId: body.componentId ?? existing.componentId,
    });
  } catch (error) {
    if (error instanceof OfferValidationError) throw new AppError(400, "VALIDATION_ERROR", error.message);
    throw error;
  }
  const result = await repo.upsertOffer(input);
  return c.json({ item: result, historyAppended: result.historyAppended });
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

async function requireIngestionCredential(headers: Headers, configured: string): Promise<void> {
  const authorization = headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : headers.get("x-ingestion-secret") ?? "";
  if (!configured || configured.startsWith("replace-with") || !provided || !constantTime(await sha256(provided), await sha256(configured))) {
    throw new AppError(401, "INGESTION_AUTHENTICATION_FAILED", "A valid ingestion service credential is required.");
  }
}

function constantTime(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return value === 0;
}
