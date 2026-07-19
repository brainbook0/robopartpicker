import type { CatalogOffer, CatalogPart, PartCategory, SupplierSummary } from "../../../src/shared/catalog";

type ComponentRow = {
  id: string;
  slug: string;
  name: string;
  category: PartCategory;
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
  unit_price_minor: number;
  stock_quantity: number | null;
  lead_time_days: number | null;
  minimum_quantity: number;
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
  category?: PartCategory;
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
    const clauses = ["c.deleted_at IS NULL"];
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
        WHERE so.component_id = c.id AND sr.region_code IN (${options.supplierRegions.map((value) => bind(value)).join(", ")})
      )`);
    }
    if (options.supplierIds?.length) {
      clauses.push(`EXISTS (
        SELECT 1 FROM supplier_offers so
        WHERE so.component_id = c.id AND so.supplier_id IN (${options.supplierIds.map((value) => bind(value)).join(", ")})
      )`);
    }
    if (options.inStock) {
      clauses.push("EXISTS (SELECT 1 FROM supplier_offers so WHERE so.component_id = c.id AND so.stock_quantity > 0)");
    }
    if (options.minPrice !== undefined) {
      clauses.push(`EXISTS (SELECT 1 FROM supplier_offers so WHERE so.component_id = c.id AND so.unit_price_minor >= ${bind(Math.round(options.minPrice * 100))})`);
    }
    if (options.maxPrice !== undefined) {
      clauses.push(`EXISTS (SELECT 1 FROM supplier_offers so WHERE so.component_id = c.id AND so.unit_price_minor <= ${bind(Math.round(options.maxPrice * 100))})`);
    }

    const from = `FROM components c LEFT JOIN manufacturers m ON m.id = c.manufacturer_id WHERE ${clauses.join(" AND ")}`;
    const count = await this.db.prepare(`SELECT COUNT(*) AS total ${from}`).bind(...values).first<{ total: number }>();
    const rows = await this.db
      .prepare(`SELECT c.id, c.slug, c.name, c.category, c.summary, c.primary_region, c.provenance_label,
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
      .prepare(`SELECT c.id, c.slug, c.name, c.category, c.summary, c.primary_region, c.provenance_label,
        c.freshness_at, c.is_demo, m.name AS maker, m.headquarters_region AS maker_region
        FROM components c LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
        WHERE c.deleted_at IS NULL AND (c.id = ?1 OR c.slug = ?1)`)
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
      LEFT JOIN supplier_offers so ON so.supplier_id = s.id
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
        MIN(sr.region_code) AS supplier_region, so.unit_price_minor, so.stock_quantity, so.lead_time_days,
        so.minimum_quantity, so.observed_at, so.is_demo
        FROM supplier_offers so JOIN suppliers s ON s.id = so.supplier_id
        LEFT JOIN supplier_regions sr ON sr.supplier_id = s.id AND sr.ships_from = 1
        WHERE so.component_id IN (${placeholders}) GROUP BY so.id ORDER BY so.unit_price_minor`).bind(...ids),
      this.db.prepare(`SELECT so.component_id, h.id, h.unit_price_minor, h.observed_at
        FROM offer_price_history h JOIN supplier_offers so ON so.id = h.supplier_offer_id
        WHERE so.component_id IN (${placeholders}) ORDER BY h.id`).bind(...ids),
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
        leadDays: row.lead_time_days ?? 0,
        moq: row.minimum_quantity,
        condition: "new",
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
