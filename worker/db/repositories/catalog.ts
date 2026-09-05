import type { CatalogPart, SupplierSummary } from "../../../src/shared/catalog";
import {
  rankComponentAlternatives,
  type ComponentAlternativeRecommendation,
  type RankableComponent,
} from "../../../src/shared/componentAlternatives";
import { shouldAppendHistory, type OfferWriteInput } from "../../../src/shared/offer";
import { fileContentUrl } from "../../services/file-urls";

type ComponentRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  manufacturer_part_number: string | null;
  summary: string | null;
  lifecycle_status: "active" | "limited" | "obsolete" | "prototype" | "unknown";
  source_url: string | null;
  primary_region: string | null;
  provenance_label: string;
  freshness_at: string | null;
  is_demo: number;
  maker: string | null;
  maker_region: string | null;
  maker_website: string | null;
  managed_image_count?: number;
};

type SpecRow = {
  component_id: string;
  spec_key: string;
  label: string;
  value_text: string | null;
  value_number: number | null;
  unit: string | null;
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
        c.freshness_at, c.is_demo, c.lifecycle_status, c.source_url, m.name AS maker, m.headquarters_region AS maker_region, m.website_url AS maker_website
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
        c.freshness_at, c.is_demo, c.lifecycle_status, c.source_url, m.name AS maker, m.headquarters_region AS maker_region, m.website_url AS maker_website
        FROM components c LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
        WHERE c.deleted_at IS NULL AND c.is_demo = 0 AND (c.id = ?1 OR c.slug = ?1)`)
      .bind(idOrSlug)
      .first<ComponentRow>();
    if (!row) return null;
    const part = (await this.hydrateComponents([row]))[0];
    if (!part) return null;
    const [fileResult, usageResult, evidenceResult, profileResult] = await this.db.batch([
      this.db.prepare(`SELECT f.id, f.original_name AS originalName, f.media_type AS mediaType,
          f.size_bytes AS sizeBytes, cf.purpose
        FROM component_files cf JOIN files f ON f.id = cf.file_id
        WHERE cf.component_id = ?1 AND f.status = 'ready' AND f.visibility = 'public' AND f.deleted_at IS NULL
        ORDER BY cf.sort_order, f.original_name`).bind(row.id),
      this.db.prepare(`SELECT p.id AS projectId, p.slug AS projectSlug, p.name AS projectName,
          b.id AS bomId, b.slug AS bomSlug, bi.id AS bomItemId, bi.quantity, bi.unit,
          bi.evidence_locator AS evidenceLocator, bi.notes
        FROM bom_items bi
        JOIN boms b ON b.current_version_id = bi.bom_version_id
        JOIN bom_versions bv ON bv.id = b.current_version_id AND bv.publication_state IN ('verified', 'partial')
        JOIN projects p ON p.id = b.project_id
        WHERE bi.component_id = ?1 AND bi.included = 1 AND p.deleted_at IS NULL AND p.is_demo = 0
          AND p.status = 'published' AND p.visibility IN ('public', 'unlisted')
        ORDER BY p.github_stars DESC, p.updated_at DESC LIMIT 24`).bind(row.id),
      this.db.prepare(`SELECT e.id, e.title, e.source_type AS sourceType, e.source_url AS sourceUrl,
          e.confidence, e.retrieved_at AS retrievedAt
        FROM evidence_claims ec JOIN evidence e ON e.id = ec.evidence_id
        WHERE ec.entity_type = 'component' AND ec.entity_id = ?1 AND e.is_demo = 0
        GROUP BY e.id ORDER BY e.confidence DESC, e.retrieved_at DESC LIMIT 24`).bind(row.id),
      this.db.prepare(`SELECT COUNT(*) AS technicalSpecCount FROM component_specs cs
        JOIN component_revisions cr ON cr.id = cs.component_revision_id
        WHERE cr.component_id = ?1 AND cr.status = 'published'
          AND cs.spec_key NOT IN ('category', 'manufacturer_slug', 'source')`).bind(row.id),
    ]);
    const files = (fileResult.results as Array<{ id: string; originalName: string; mediaType: string; sizeBytes: number; purpose: NonNullable<CatalogPart["files"]>[number]["purpose"] }>).map((file) => ({ ...file, contentUrl: fileContentUrl(file.id) }));
    const technicalSpecCount = Number((profileResult.results[0] as { technicalSpecCount?: number } | undefined)?.technicalSpecCount ?? 0);
    const imageCount = files.filter((file) => file.purpose === "image" || file.mediaType.startsWith("image/")).length;
    const engineeringFileCount = files.filter((file) => file.purpose !== "image").length;
    const identity = row.maker && row.manufacturer_part_number ? "exact" : row.maker || row.manufacturer_part_number ? "partial" : "unresolved";
    const missing = [
      !row.maker ? "manufacturer" : null,
      !row.manufacturer_part_number ? "manufacturer part number" : null,
      !row.summary?.trim() ? "source summary" : null,
      technicalSpecCount === 0 ? "technical specifications" : null,
      imageCount === 0 ? "source-backed image" : null,
      engineeringFileCount === 0 ? "engineering files" : null,
      usageResult.results.length === 0 ? "normalized BOM usage" : null,
      evidenceResult.results.length === 0 ? "formal source evidence" : null,
    ].filter((value): value is string => value != null);
    return {
      ...part,
      files,
      projectUsage: usageResult.results as NonNullable<CatalogPart["projectUsage"]>,
      evidence: evidenceResult.results as NonNullable<CatalogPart["evidence"]>,
      profile: { identity, technicalSpecCount, imageCount, engineeringFileCount, projectUsageCount: usageResult.results.length, evidenceCount: evidenceResult.results.length, missing },
    };
  }

  async listComponentAlternatives(idOrSlug: string, limit = 5): Promise<ComponentAlternativeRecommendation[] | null> {
    const target = await this.findComponent(idOrSlug);
    if (!target) return null;
    const boundedLimit = Math.min(10, Math.max(1, Math.trunc(limit) || 1));
    const poolLimit = Math.min(60, Math.max(20, boundedLimit * 12));
    const rows = await this.db.prepare(`WITH
      target AS (
        SELECT id, category, manufacturer_id FROM components
        WHERE id = ?1 AND deleted_at IS NULL AND is_demo = 0
      ),
      target_tags AS (
        SELECT tag FROM component_compatibility_tags WHERE component_id = ?1
      ),
      tag_scores AS (
        SELECT candidate.component_id, COUNT(DISTINCT candidate.tag) AS shared_tag_count
        FROM component_compatibility_tags candidate
        JOIN target_tags target_tag ON target_tag.tag = candidate.tag
        WHERE candidate.component_id <> ?1
        GROUP BY candidate.component_id
      ),
      target_specs AS (
        SELECT cs.spec_key, cs.value_text, cs.value_number, lower(COALESCE(cs.unit, '')) AS unit
        FROM component_specs cs JOIN component_revisions cr ON cr.id = cs.component_revision_id
        WHERE cr.component_id = ?1 AND cr.status = 'published'
          AND cs.spec_key NOT IN ('category', 'manufacturer_slug', 'source')
      ),
      spec_scores AS (
        SELECT cr.component_id, COUNT(DISTINCT cs.spec_key || char(0) || COALESCE(cs.unit, '')) AS matching_spec_count
        FROM component_specs cs
        JOIN component_revisions cr ON cr.id = cs.component_revision_id AND cr.status = 'published'
        JOIN target_specs target_spec ON target_spec.spec_key = cs.spec_key
          AND target_spec.unit = lower(COALESCE(cs.unit, ''))
          AND ((target_spec.value_number IS NOT NULL AND cs.value_number = target_spec.value_number)
            OR (target_spec.value_number IS NULL AND cs.value_number IS NULL
              AND lower(trim(COALESCE(cs.value_text, ''))) = lower(trim(COALESCE(target_spec.value_text, '')))))
        WHERE cr.component_id <> ?1
        GROUP BY cr.component_id
      )
      SELECT c.id, c.slug, c.name, c.category, c.manufacturer_part_number, c.summary,
        c.primary_region, c.provenance_label, c.freshness_at, c.is_demo, c.lifecycle_status,
        c.source_url, m.name AS maker, m.headquarters_region AS maker_region, m.website_url AS maker_website,
        CASE WHEN EXISTS (
          SELECT 1 FROM component_files cf JOIN files f ON f.id = cf.file_id
          WHERE cf.component_id = c.id AND f.status = 'ready' AND f.visibility = 'public'
            AND f.deleted_at IS NULL AND (cf.purpose = 'image' OR f.media_type LIKE 'image/%')
        ) THEN 1 ELSE 0 END AS managed_image_count
      FROM components c
      JOIN target ON target.category = c.category
      LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
      LEFT JOIN tag_scores ON tag_scores.component_id = c.id
      LEFT JOIN spec_scores ON spec_scores.component_id = c.id
      WHERE c.id <> target.id AND c.deleted_at IS NULL AND c.is_demo = 0
      ORDER BY COALESCE(tag_scores.shared_tag_count, 0) DESC,
        COALESCE(spec_scores.matching_spec_count, 0) DESC,
        CASE WHEN c.manufacturer_id = target.manufacturer_id THEN 0 ELSE 1 END,
        CASE WHEN c.lifecycle_status = 'active' THEN 0 ELSE 1 END,
        managed_image_count DESC, c.name COLLATE NOCASE, c.id
      LIMIT ?2`).bind(target.id, poolLimit).all<ComponentRow>();
    const candidates = await this.hydrateComponents(rows.results);
    const imageCountById = new Map(rows.results.map((row) => [row.id, Number(row.managed_image_count ?? 0)]));
    const ranked = rankComponentAlternatives(
      toRankableComponent(target, target.profile?.imageCount ?? 0),
      candidates.map((candidate) => toRankableComponent(candidate, imageCountById.get(candidate.id) ?? 0)),
      boundedLimit,
    );
    if (!ranked.length) return [];
    const ids = ranked.map((entry) => entry.candidate.id);
    const placeholders = ids.map((_, index) => `?${index + 1}`).join(", ");
    const imageRows = await this.db.prepare(`SELECT cf.component_id, f.id, f.original_name AS originalName,
        f.media_type AS mediaType, f.size_bytes AS sizeBytes, cf.purpose
      FROM component_files cf JOIN files f ON f.id = cf.file_id
      WHERE cf.component_id IN (${placeholders}) AND f.status = 'ready' AND f.visibility = 'public'
        AND f.deleted_at IS NULL AND (cf.purpose = 'image' OR f.media_type LIKE 'image/%')
      ORDER BY cf.component_id, cf.sort_order, f.original_name`).bind(...ids).all<{
        component_id: string; id: string; originalName: string; mediaType: string; sizeBytes: number;
        purpose: NonNullable<CatalogPart["files"]>[number]["purpose"];
      }>();
    const filesByComponent = new Map<string, NonNullable<CatalogPart["files"]>>();
    for (const row of imageRows.results) filesByComponent.set(row.component_id, [
      ...(filesByComponent.get(row.component_id) ?? []),
      { id: row.id, originalName: row.originalName, mediaType: row.mediaType, sizeBytes: row.sizeBytes, purpose: row.purpose, contentUrl: fileContentUrl(row.id) },
    ]);
    return ranked.map((entry) => ({
      item: { ...entry.candidate.part, files: filesByComponent.get(entry.candidate.id) ?? [] },
      score: entry.score,
      reasons: entry.reasons,
      compatibilityStatus: entry.compatibilityStatus,
    }));
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
    const [specResult, tagResult, compatibilityResult] = await this.db.batch([
      this.db.prepare(`SELECT cr.component_id, cs.spec_key, cs.label, cs.value_text, cs.value_number, cs.unit
        FROM component_specs cs JOIN component_revisions cr ON cr.id = cs.component_revision_id
        WHERE cr.component_id IN (${placeholders}) AND cr.status = 'published'
        ORDER BY cs.sort_order, cs.label`).bind(...ids),
      this.db.prepare(`SELECT component_id, tag FROM component_tags WHERE component_id IN (${placeholders}) ORDER BY tag`).bind(...ids),
      this.db.prepare(`SELECT component_id, tag FROM component_compatibility_tags WHERE component_id IN (${placeholders}) ORDER BY tag`).bind(...ids),
    ]);

    const specs = new Map<string, Record<string, unknown>>();
    const technicalSpecifications = new Map<string, NonNullable<CatalogPart["technicalSpecifications"]>>();
    for (const row of specResult.results as SpecRow[]) {
      const target = specs.get(row.component_id) ?? {};
      let value: unknown = row.value_number ?? row.value_text;
      if (row.value_text && (row.value_text.startsWith("[") || row.value_text.startsWith("{"))) {
        try { value = JSON.parse(row.value_text); } catch { value = row.value_text; }
      }
      if (["openSource", "cadAvailable", "tactile"].includes(row.spec_key) && typeof value === "number") value = value === 1;
      target[row.spec_key] = value;
      specs.set(row.component_id, target);
      if (!["category", "manufacturer_slug", "source"].includes(row.spec_key)) {
        technicalSpecifications.set(row.component_id, [
          ...(technicalSpecifications.get(row.component_id) ?? []),
          { key: row.spec_key, label: row.label, value, unit: row.unit },
        ]);
      }
    }

    const tags = groupStrings(tagResult.results as Array<{ component_id: string; tag: string }>);
    const compatibility = groupStrings(compatibilityResult.results as Array<{ component_id: string; tag: string }>);

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
        lifecycleStatus: row.lifecycle_status,
        sourceUrl: row.source_url ?? undefined,
        manufacturerUrl: row.maker_website ?? undefined,
        technicalSpecifications: technicalSpecifications.get(row.id) ?? [],
        tags: tags.get(row.id) ?? [],
        openSource: dynamic.openSource === true,
        datasheetUrl: typeof dynamic.datasheetUrl === "string" ? dynamic.datasheetUrl : undefined,
        cadAvailable: dynamic.cadAvailable === true,
        rosSupport: (dynamic.rosSupport ?? "none") as CatalogPart["rosSupport"],
        warrantyMonths: typeof dynamic.warrantyMonths === "number" ? dynamic.warrantyMonths : 0,
        // Supplier identities and commercial observations are private inputs to
        // server-side completed quotes, not public catalog payloads.
        priceHistory: [],
        offers: [],
        failures: typeof dynamic.failures === "number" ? dynamic.failures : 0,
        compatibility: compatibility.get(row.id) ?? [],
        provenanceLabel: row.provenance_label,
        freshnessAt: row.freshness_at,
        isDemo: row.is_demo === 1,
      } satisfies CatalogPart;
    });
  }
}

function toRankableComponent(part: CatalogPart, managedImageCount: number): RankableComponent & { part: CatalogPart } {
  return {
    id: part.id,
    name: part.name,
    category: part.category,
    maker: part.maker,
    mpn: part.mpn,
    lifecycleStatus: part.lifecycleStatus,
    compatibility: part.compatibility ?? [],
    technicalSpecifications: (part.technicalSpecifications ?? []).map((spec) => ({ key: spec.key, value: spec.value, unit: spec.unit })),
    managedImageCount,
    hasSource: Boolean(part.sourceUrl),
    isDemo: part.isDemo,
    part,
  };
}

function groupStrings(rows: Array<{ component_id: string; tag: string }>): Map<string, string[]> {
  const output = new Map<string, string[]>();
  for (const row of rows) output.set(row.component_id, [...(output.get(row.component_id) ?? []), row.tag]);
  return output;
}
