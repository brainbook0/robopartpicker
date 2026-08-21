import type { CatalogOffer, CatalogPart, SupplierSummary } from "../../../src/shared/catalog";
import { normalizePriceBreaks, shouldAppendHistory, type OfferWriteInput } from "../../../src/shared/offer";

type ComponentRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  manufacturer_part_number: string | null;
  summary: string | null;
  primary_region: string | null;
  provenance_label: string;
  freshness_at: string | null;
  is_demo: number;
  maker: string | null;
  maker_region: string | null;
};

type SpecRow = {
  component_id: string;
  spec_key: string;
  value_text: string | null;
  value_number: number | null;
};

type OfferRow = {
  id: string;
  component_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_region: string | null;
  supplier_sku: string | null;
  product_url: string | null;
  currency: string | null;
  unit_price_minor: number;
  stock_quantity: number | null;
  lead_time_days: number | null;
  minimum_quantity: number;
  availability: string | null;
  condition: string | null;
  price_breaks: string | null;
  reliability_score: number | null;
  risk_label: string | null;
  freshness_label: string | null;
  observed_at: string;
  is_demo: number;
};

type HistoryRow = {
  component_id: string;
  id: string;
  unit_price_minor: number;
  observed_at: string;
};

export type CatalogListOptions = {
  category?: string;
  q?: string;
  manufacturerRegions?: string[];
  supplierRegions?: string[];
  supplierIds?: string[];
  makers?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  limit: number;
  offset: number;
};

export class CatalogRepository {
  constructor(private readonly db: D1Database) {}

  async listComponents(options: CatalogListOptions): Promise<{ items: CatalogPart[]; total: number }> {
    const clauses = ["c.deleted_at IS NULL", "c.is_demo = 0"];
    const values: unknown[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `?${values.length}`;
    };

    if (options.category) clauses.push(`c.category = ${bind(options.category)}`);
    if (options.q) {
      const q = `%${options.q.toLowerCase()}%`;
      const p1 = bind(q);
      const p2 = bind(q);
      const p3 = bind(q);
      clauses.push(`(lower(c.name) LIKE ${p1} OR lower(m.name) LIKE ${p2} OR EXISTS (
        SELECT 1 FROM component_tags ct WHERE ct.component_id = c.id AND lower(ct.tag) LIKE ${p3}
      ))`);
    }
    if (options.manufacturerRegions?.length) {
      clauses.push(`m.headquarters_region IN (${options.manufacturerRegions.map((value) => bind(value)).join(", ")})`);
    }
    if (options.makers?.length) {
      clauses.push(`m.name IN (${options.makers.map((value) => bind(value)).join(", ")})`);
    }
    if (options.supplierRegions?.length) {
      clauses.push(`EXISTS (
        SELECT 1 FROM supplier_offers so
        JOIN suppliers sup ON sup.id = so.supplier_id
        JOIN supplier_regions sr ON sr.supplier_id = sup.id
        WHERE so.component_id = c.id AND so.is_demo = 0 AND sup.is_demo = 0
          AND sr.region_code IN (${options.supplierRegions.map((value) => bind(value)).join(", ")})
      )`);
    }
    if (options.supplierIds?.length) {
      clauses.push(`EXISTS (
        SELECT 1 FROM supplier_offers so
        JOIN suppliers sup ON sup.id = so.supplier_id
        WHERE so.component_id = c.id AND so.is_demo = 0 AND sup.is_demo = 0
          AND so.supplier_id IN (${options.supplierIds.map((value) => bind(value)).join(", ")})
      )`);
    }
    if (options.inStock) {
      clauses.push("EXISTS (SELECT 1 FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.stock_quantity > 0)");
    }
    if (options.minPrice !== undefined) {
      clauses.push(`EXISTS (SELECT 1 FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.unit_price_minor >= ${bind(Math.round(options.minPrice * 100))})`);
    }
    if (options.maxPrice !== undefined) {
      clauses.push(`EXISTS (SELECT 1 FROM supplier_offers so WHERE so.component_id = c.id AND so.is_demo = 0 AND so.unit_price_minor <= ${bind(Math.round(options.maxPrice * 100))})`);
    }

    const from = `FROM components c LEFT JOIN manufacturers m ON m.id = c.manufacturer_id WHERE ${clauses.join(" AND ")}`;
    const count = await this.db.prepare(`SELECT COUNT(*) AS total ${from}`).bind(...values).first<{ total: number }>();
    const rows = await this.db
      .prepare(`SELECT c.id, c.slug, c.name, c.category, c.manufacturer_part_number, c.summary, c.primary_region, c.provenance_label,
        c.freshness_at, c.is_demo, m.name AS maker, m.headquarters_region AS maker_region
        ${from}
        ORDER BY c.name COLLATE NOCASE
        LIMIT ?${values.length + 1} OFFSET ?${values.length + 2}`)
      .bind(...values, options.limit, options.offset)
      .all<ComponentRow>();

    return { items: await this.hydrateComponents(rows.results), total: count?.total ?? 0 };
  }

  async findComponent(idOrSlug: string): Promise<CatalogPart | null> {
    const row = await this.db
      .prepare(`SELECT c.id, c.slug, c.name, c.category, c.manufacturer_part_number, c.summary, c.primary_region, c.provenance_label,
        c.freshness_at, c.is_demo, m.name AS maker, m.headquarters_region AS maker_region
        FROM components c LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
        WHERE c.deleted_at IS NULL AND c.is_demo = 0 AND (c.id = ?1 OR c.slug = ?1)`)
      .bind(idOrSlug)
      .first<ComponentRow>();
    if (!row) return null;
    return (await this.hydrateComponents([row]))[0] ?? null;
  }

  async listSuppliers(): Promise<SupplierSummary[]> {
    type SupplierRow = {
      id: string; slug: string; name: string; website_url: string | null; description: string | null;
      freshness_at: string | null; is_demo: number; region_code: string | null; minimum_order_quantity: number | null;
      typical_lead_days: number | null; verified: number | null; claimed: number | null; warranty_label: string | null;
      documentation_score: number | null; rating: number | null; review_count: number | null; notes: string | null;
      offer_count: number; component_count: number;
    };
    const rows = await this.db.prepare(`
      SELECT s.id, s.slug, s.name, s.website_url, s.description, s.freshness_at, s.is_demo,
        MIN(sr.region_code) AS region_code, sm.minimum_order_quantity, sm.typical_lead_days,
        sm.verified, sm.claimed, sm.warranty_label, sm.documentation_score, sm.rating, sm.review_count, sm.notes,
        COUNT(so.id) AS offer_count, COUNT(DISTINCT so.component_id) AS component_count
      FROM suppliers s
      LEFT JOIN supplier_regions sr ON sr.supplier_id = s.id AND sr.ships_from = 1
      LEFT JOIN supplier_metrics sm ON sm.supplier_id = s.id
      LEFT JOIN supplier_offers so ON so.supplier_id = s.id AND so.is_demo = 0
      WHERE s.is_demo = 0
      GROUP BY s.id
      ORDER BY s.name COLLATE NOCASE
    `).all<SupplierRow>();
    const ids = rows.results.map((row) => row.id);
    if (!ids.length) return [];
    const placeholders = ids.map((_, index) => `?${index + 1}`).join(", ");
    const [capabilityResult, interfaceResult] = await this.db.batch([
      this.db.prepare(`SELECT supplier_id, category FROM supplier_capabilities WHERE supplier_id IN (${placeholders}) ORDER BY category`).bind(...ids),
      this.db.prepare(`SELECT supplier_id, interface_name FROM supplier_interfaces WHERE supplier_id IN (${placeholders}) ORDER BY interface_name`).bind(...ids),
    ]);
    const capabilities = new Map<string, string[]>();
    const interfaces = new Map<string, string[]>();
    for (const row of capabilityResult.results as Array<{ supplier_id: string; category: string }>) {
      capabilities.set(row.supplier_id, [...(capabilities.get(row.supplier_id) ?? []), row.category]);
    }
    for (const row of interfaceResult.results as Array<{ supplier_id: string; interface_name: string }>) {
      interfaces.set(row.supplier_id, [...(interfaces.get(row.supplier_id) ?? []), row.interface_name]);
    }
    return rows.results.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      website: row.website_url ?? "",
      region: row.region_code ?? "Global",
      categories: capabilities.get(row.id) ?? [],
      moq: row.minimum_order_quantity ?? 1,
      leadDays: row.typical_lead_days ?? 0,
      verified: row.verified === 1,
      claimed: row.claimed === 1,
      warranty: row.warranty_label ?? "not specified",
      docScore: row.documentation_score ?? 0,
      interfaces: interfaces.get(row.id) ?? [],
      reviews: { rating: row.rating ?? 0, count: row.review_count ?? 0 },
      notes: row.notes ?? row.description ?? undefined,
      knownOfferCount: row.offer_count,
      knownComponentCount: row.component_count,
      freshnessAt: row.freshness_at,
      isDemo: row.is_demo === 1,
    }));
  }

  async getOfferById(id: string): Promise<{
    id: string;
    supplierId: string;
    componentId: string;
    supplierSku: string | null;
    regionCode: string | null;
    unitPriceMinor: number;
    stockQuantity: number | null;
  } | null> {
    return this.db
      .prepare(`SELECT id, supplier_id AS supplierId, component_id AS componentId,
        supplier_sku AS supplierSku, region_code AS regionCode,
        unit_price_minor AS unitPriceMinor, stock_quantity AS stockQuantity
        FROM supplier_offers WHERE id = ?1 LIMIT 1`)
      .bind(id)
      .first<{
        id: string;
        supplierId: string;
        componentId: string;
        supplierSku: string | null;
        regionCode: string | null;
        unitPriceMinor: number;
        stockQuantity: number | null;
      }>() ?? null;
  }

  async listOfferHistory(offerId: string): Promise<Array<{
    id: string;
    currency: string;
    unitPriceMinor: number;
    stockQuantity: number | null;
    minimumQuantity: number;
    leadTimeDays: number | null;
    observedAt: string;
  }>> {
    const rows = await this.db
      .prepare(`SELECT id, currency, unit_price_minor AS unitPriceMinor,
        stock_quantity AS stockQuantity, minimum_quantity AS minimumQuantity,
        lead_time_days AS leadTimeDays, observed_at AS observedAt
        FROM offer_price_history WHERE supplier_offer_id = ?1 ORDER BY observed_at ASC, id ASC`)
      .bind(offerId)
      .all<{
        id: string;
        currency: string;
        unitPriceMinor: number;
        stockQuantity: number | null;
        minimumQuantity: number;
        leadTimeDays: number | null;
        observedAt: string;
      }>();
    return rows.results;
  }

  /** Insert or update an offer, appending a price-history observation whenever
   *  the observable state changes so a prior observation is never overwritten. */
  async upsertOffer(input: OfferWriteInput): Promise<{ offerId: string; historyAppended: boolean }> {
    const now = new Date().toISOString();
    const existing = await this.db
      .prepare(`SELECT id, unit_price_minor, stock_quantity FROM supplier_offers
        WHERE supplier_id = ?1 AND component_id = ?2
          AND COALESCE(supplier_sku, '') = COALESCE(?3, '')
          AND COALESCE(region_code, '') = COALESCE(?4, '')
        LIMIT 1`)
      .bind(input.supplierId, input.componentId, input.supplierSku ?? null, input.regionCode ?? null)
      .first<{ id: string; unit_price_minor: number; stock_quantity: number | null }>();

    if (existing) {
      await this.db.prepare(`UPDATE supplier_offers SET
          supplier_sku = ?1, product_url = ?2, region_code = ?3, currency = ?4,
          unit_price_minor = ?5, minimum_quantity = ?6, stock_quantity = ?7,
          lead_time_days = ?8, availability = ?9, condition = ?10, price_breaks = ?11,
          reliability_score = ?12, risk_label = ?13, freshness_label = ?14,
          observed_at = ?15, expires_at = ?16, updated_at = ?17
        WHERE id = ?18`)
        .bind(
          input.supplierSku ?? null,
          input.productUrl ?? null,
          input.regionCode ?? null,
          input.currency,
          input.unitPriceMinor,
          input.minimumQuantity,
          input.stockQuantity ?? null,
          input.leadTimeDays ?? null,
          input.availability ?? "unknown",
          input.condition ?? "unknown",
          input.priceBreaks?.length ? JSON.stringify(input.priceBreaks) : null,
          input.reliabilityScore ?? null,
          input.riskLabel ?? "unknown",
          input.freshnessLabel ?? "unknown",
          input.observedAt,
          input.expiresAt ?? null,
          now,
          existing.id,
        )
        .run();
      const historyAppended = shouldAppendHistory(
        { unitPriceMinor: existing.unit_price_minor, stockQuantity: existing.stock_quantity },
        { unitPriceMinor: input.unitPriceMinor, stockQuantity: input.stockQuantity ?? null },
      );
      if (historyAppended) {
        await this.appendHistory(existing.id, input);
      }
      return { offerId: existing.id, historyAppended };
    }

    const id = crypto.randomUUID();
    await this.db.prepare(`INSERT INTO supplier_offers
        (id, supplier_id, component_id, supplier_sku, product_url, region_code, currency,
         unit_price_minor, minimum_quantity, stock_quantity, lead_time_days, availability,
         condition, price_breaks, reliability_score, risk_label, freshness_label,
         observed_at, expires_at, is_demo, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, 0, ?20, ?20)`)
      .bind(
        id,
        input.supplierId,
        input.componentId,
        input.supplierSku ?? null,
        input.productUrl ?? null,
        input.regionCode ?? null,
        input.currency,
        input.unitPriceMinor,
        input.minimumQuantity,
        input.stockQuantity ?? null,
        input.leadTimeDays ?? null,
        input.availability ?? "unknown",
        input.condition ?? "unknown",
        input.priceBreaks?.length ? JSON.stringify(input.priceBreaks) : null,
        input.reliabilityScore ?? null,
        input.riskLabel ?? "unknown",
        input.freshnessLabel ?? "unknown",
        input.observedAt,
        input.expiresAt ?? null,
        now,
      )
      .run();
    await this.appendHistory(id, input);
    return { offerId: id, historyAppended: true };
  }

  private async appendHistory(offerId: string, input: OfferWriteInput): Promise<void> {
    await this.db.prepare(`INSERT INTO offer_price_history
        (id, supplier_offer_id, currency, unit_price_minor, stock_quantity,
         minimum_quantity, lead_time_days, observed_at, source_import_record_id)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
      .bind(
        crypto.randomUUID(),
        offerId,
        input.currency,
        input.unitPriceMinor,
        input.stockQuantity ?? null,
        input.minimumQuantity,
        input.leadTimeDays ?? null,
        input.observedAt,
        input.sourceImportRecordId ?? null,
      )
      .run();
  }

  private async hydrateComponents(rows: ComponentRow[]): Promise<CatalogPart[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const placeholders = ids.map((_, index) => `?${index + 1}`).join(", ");
    const [specResult, tagResult, compatibilityResult, offerResult, historyResult] = await this.db.batch([
      this.db.prepare(`SELECT cr.component_id, cs.spec_key, cs.value_text, cs.value_number
        FROM component_specs cs JOIN component_revisions cr ON cr.id = cs.component_revision_id
        WHERE cr.component_id IN (${placeholders}) AND cr.status = 'published'`).bind(...ids),
      this.db.prepare(`SELECT component_id, tag FROM component_tags WHERE component_id IN (${placeholders}) ORDER BY tag`).bind(...ids),
      this.db.prepare(`SELECT component_id, tag FROM component_compatibility_tags WHERE component_id IN (${placeholders}) ORDER BY tag`).bind(...ids),
      this.db.prepare(`SELECT so.id, so.component_id, so.supplier_id, s.name AS supplier_name,
        MIN(sr.region_code) AS supplier_region, so.supplier_sku, so.product_url, so.currency, so.unit_price_minor, so.stock_quantity,
        so.lead_time_days, so.minimum_quantity, so.availability, so.condition, so.price_breaks,
        so.reliability_score, so.risk_label, so.freshness_label, so.observed_at, so.is_demo
        FROM supplier_offers so JOIN suppliers s ON s.id = so.supplier_id
        LEFT JOIN supplier_regions sr ON sr.supplier_id = s.id AND sr.ships_from = 1
        WHERE so.component_id IN (${placeholders}) AND so.is_demo = 0 AND s.is_demo = 0
        GROUP BY so.id ORDER BY so.unit_price_minor`).bind(...ids),
      this.db.prepare(`SELECT so.component_id, h.id, h.unit_price_minor, h.observed_at
        FROM offer_price_history h JOIN supplier_offers so ON so.id = h.supplier_offer_id
        WHERE so.component_id IN (${placeholders}) AND so.is_demo = 0 ORDER BY h.id`).bind(...ids),
    ]);

    const specs = new Map<string, Record<string, unknown>>();
    for (const row of specResult.results as SpecRow[]) {
      const target = specs.get(row.component_id) ?? {};
      let value: unknown = row.value_number ?? row.value_text;
      if (row.value_text && (row.value_text.startsWith("[") || row.value_text.startsWith("{"))) {
        try { value = JSON.parse(row.value_text); } catch { value = row.value_text; }
      }
      if (["openSource", "cadAvailable", "tactile"].includes(row.spec_key) && typeof value === "number") value = value === 1;
      target[row.spec_key] = value;
      specs.set(row.component_id, target);
    }

    const tags = groupStrings(tagResult.results as Array<{ component_id: string; tag: string }>);
    const compatibility = groupStrings(compatibilityResult.results as Array<{ component_id: string; tag: string }>);
    const offers = new Map<string, CatalogOffer[]>();
    for (const row of offerResult.results as OfferRow[]) {
      const offer: CatalogOffer = {
        id: row.id,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        supplierRegion: row.supplier_region,
        price: row.unit_price_minor / 100,
        stock: row.stock_quantity ?? 0,
        stockKnown: row.stock_quantity != null,
        leadDays: row.lead_time_days ?? 0,
        leadKnown: row.lead_time_days != null,
        moq: row.minimum_quantity,
        supplierSku: row.supplier_sku ?? undefined,
        productUrl: row.product_url ?? undefined,
        currency: row.currency ?? undefined,
        condition: (row.condition as CatalogOffer["condition"]) ?? "unknown",
        availability: (row.availability as CatalogOffer["availability"]) ?? "unknown",
        priceBreaks: normalizePriceBreaks(row.price_breaks),
        reliabilityScore: row.reliability_score,
        riskLabel: (row.risk_label as CatalogOffer["riskLabel"]) ?? "unknown",
        freshnessLabel: (row.freshness_label as CatalogOffer["freshnessLabel"]) ?? "unknown",
        observedAt: row.observed_at,
        isDemo: row.is_demo === 1,
      };
      offers.set(row.component_id, [...(offers.get(row.component_id) ?? []), offer]);
    }
    const priceHistory = new Map<string, Array<{ date: string; price: number }>>();
    const seenHistory = new Set<string>();
    for (const row of historyResult.results as HistoryRow[]) {
      const key = `${row.component_id}:${row.id}`;
      if (seenHistory.has(key)) continue;
      seenHistory.add(key);
      priceHistory.set(row.component_id, [...(priceHistory.get(row.component_id) ?? []), { date: row.observed_at, price: row.unit_price_minor / 100 }]);
    }

    return rows.map((row) => {
      const dynamic = specs.get(row.id) ?? {};
      return {
        ...dynamic,
        id: row.id,
        slug: row.slug,
        category: row.category,
        name: row.name,
        mpn: row.manufacturer_part_number ?? undefined,
        maker: row.maker ?? "Unknown manufacturer",
        makerCountry: row.maker_region ?? "Unknown",
        region: (row.primary_region ?? "Global") as CatalogPart["region"],
        blurb: row.summary ?? "",
        tags: tags.get(row.id) ?? [],
        openSource: dynamic.openSource === true,
        datasheetUrl: typeof dynamic.datasheetUrl === "string" ? dynamic.datasheetUrl : undefined,
        cadAvailable: dynamic.cadAvailable === true,
        rosSupport: (dynamic.rosSupport ?? "none") as CatalogPart["rosSupport"],
        warrantyMonths: typeof dynamic.warrantyMonths === "number" ? dynamic.warrantyMonths : 0,
        priceHistory: priceHistory.get(row.id) ?? [],
        offers: offers.get(row.id) ?? [],
        failures: typeof dynamic.failures === "number" ? dynamic.failures : 0,
        compatibility: compatibility.get(row.id) ?? [],
        provenanceLabel: row.provenance_label,
        freshnessAt: row.freshness_at,
        isDemo: row.is_demo === 1,
      } satisfies CatalogPart;
    });
  }
}

function groupStrings(rows: Array<{ component_id: string; tag: string }>): Map<string, string[]> {
  const output = new Map<string, string[]>();
  for (const row of rows) output.set(row.component_id, [...(output.get(row.component_id) ?? []), row.tag]);
  return output;
}
