import { AppError } from "../../http";

export type BomRow = {
  id: string;
  project_id: string | null;
  owner_user_id: string | null;
  organization_id: string | null;
  slug: string | null;
  name: string;
  current_version_id: string | null;
  visibility: "private" | "organization" | "unlisted" | "public";
  is_demo: number;
  created_at: string;
  updated_at: string;
};

export type BomItemInput = {
  componentId?: string | null;
  slotKey: string;
  description: string;
  quantity: number;
  unit?: string;
  selectedSupplierOfferId?: string | null;
  targetUnitPriceMinor?: number | null;
  notes?: string | null;
  extractionMethod?: string;
  completeness?: string;
  evidenceLocator?: string | null;
  confidence?: number | null;
};

export type BomDetail = BomRow & {
  version: { id: string; label: string; notes: string | null; currency: string; createdAt: string } | null;
  items: Array<Record<string, unknown>>;
  totals: { lines: number; units: number; knownCostMinor: number; unpricedLines: number };
};

export class BomsRepository {
  constructor(private readonly db: D1Database) {}

  async list(userId: string | null): Promise<Array<BomRow & { line_count: number; known_cost_minor: number; unpriced_lines: number }>> {
    const access = userId
      ? `(b.visibility IN ('public', 'unlisted') OR b.owner_user_id = ?1 OR EXISTS (
          SELECT 1 FROM organization_members om WHERE om.organization_id = b.organization_id AND om.user_id = ?1 AND om.status = 'active'))`
      : `b.visibility = 'public'`;
    const statement = this.db.prepare(`SELECT b.*,
      COUNT(bi.id) AS line_count,
      COALESCE(SUM(COALESCE(bi.target_unit_price_minor, so.unit_price_minor, 0) * bi.quantity), 0) AS known_cost_minor,
      COALESCE(SUM(CASE WHEN COALESCE(bi.target_unit_price_minor, so.unit_price_minor) IS NULL THEN 1 ELSE 0 END), 0) AS unpriced_lines
      FROM boms b
      LEFT JOIN bom_items bi ON bi.bom_version_id = b.current_version_id
      LEFT JOIN supplier_offers so ON so.id = bi.selected_supplier_offer_id
      WHERE ${access}
      GROUP BY b.id ORDER BY b.updated_at DESC`);
    const result = userId
      ? await statement.bind(userId).all<BomRow & { line_count: number; known_cost_minor: number; unpriced_lines: number }>()
      : await statement.all<BomRow & { line_count: number; known_cost_minor: number; unpriced_lines: number }>();
    return result.results;
  }

  async find(idOrSlug: string): Promise<BomRow | null> {
    return this.db.prepare("SELECT * FROM boms WHERE id = ?1 OR slug = ?1").bind(idOrSlug).first<BomRow>();
  }

  async detail(idOrSlug: string): Promise<BomDetail | null> {
    const bom = await this.find(idOrSlug);
    if (!bom) return null;
    const [version, items] = await this.db.batch([
      this.db.prepare(`SELECT id, version_label AS label, notes, currency, created_at AS createdAt
        FROM bom_versions WHERE id = ?1`).bind(bom.current_version_id),
      this.db.prepare(`SELECT bi.id, bi.component_id AS componentId, c.slug AS componentSlug, c.name AS componentName,
        c.category AS componentCategory, m.name AS manufacturerName, bi.slot_key AS slotKey, bi.description,
        bi.quantity, bi.unit, bi.selected_supplier_offer_id AS selectedSupplierOfferId,
        s.name AS selectedSupplierName, so.unit_price_minor AS selectedUnitPriceMinor,
        bi.target_unit_price_minor AS targetUnitPriceMinor, bi.notes, bi.sort_order AS sortOrder,
        bi.extraction_method AS extractionMethod, bi.completeness, bi.evidence_locator AS evidenceLocator, bi.confidence,
        (SELECT MIN(so2.unit_price_minor) FROM supplier_offers so2 WHERE so2.component_id = bi.component_id AND so2.stock_quantity > 0) AS lowestUnitPriceMinor,
        (SELECT COUNT(*) FROM supplier_offers so3 WHERE so3.component_id = bi.component_id) AS knownOfferCount
        FROM bom_items bi
        LEFT JOIN components c ON c.id = bi.component_id
        LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
        LEFT JOIN supplier_offers so ON so.id = bi.selected_supplier_offer_id
        LEFT JOIN suppliers s ON s.id = so.supplier_id
        WHERE bi.bom_version_id = ?1 ORDER BY bi.sort_order, bi.id`).bind(bom.current_version_id),
    ]);
    const rows = items.results as Array<Record<string, unknown>>;
    let units = 0;
    let knownCostMinor = 0;
    let unpricedLines = 0;
    for (const item of rows) {
      const quantity = Number(item.quantity);
      const unitPrice = item.targetUnitPriceMinor ?? item.selectedUnitPriceMinor ?? item.lowestUnitPriceMinor;
      units += quantity;
      if (unitPrice == null) unpricedLines += 1;
      else knownCostMinor += Number(unitPrice) * quantity;
    }
    return {
      ...bom,
      version: (version.results[0] as BomDetail["version"] | undefined) ?? null,
      items: rows,
      totals: { lines: rows.length, units, knownCostMinor, unpricedLines },
    };
  }

  async create(userId: string, input: { name: string; projectId?: string | null; organizationId?: string | null; visibility: BomRow["visibility"]; notes?: string | null; currency?: string; items: BomItemInput[] }): Promise<BomDetail> {
    const id = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const slug = `${slugify(input.name)}-${id.slice(0, 8)}`;
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`INSERT INTO boms
        (id, project_id, owner_user_id, organization_id, slug, name, current_version_id, visibility, is_demo, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?9)`)
        .bind(id, input.projectId ?? null, userId, input.organizationId ?? null, slug, input.name, versionId, input.visibility, now),
      this.db.prepare(`INSERT INTO bom_versions
        (id, bom_id, version_label, notes, currency, created_by_user_id, created_at)
        VALUES (?1, ?2, '1', ?3, ?4, ?5, ?6)`)
        .bind(versionId, id, input.notes ?? null, input.currency ?? "USD", userId, now),
    ];
    appendItems(this.db, statements, versionId, input.items);
    await this.db.batch(statements);
    return (await this.detail(id))!;
  }

  async createVersion(bomId: string, userId: string, input: { expectedVersionId: string; notes?: string | null; currency?: string; items: BomItemInput[] }): Promise<BomDetail> {
    const bom = await this.find(bomId);
    if (!bom) throw new AppError(404, "BOM_NOT_FOUND", "BOM not found.");
    if (bom.current_version_id !== input.expectedVersionId) throw new AppError(409, "BOM_VERSION_CONFLICT", "The BOM changed; refresh and retry.");
    const count = await this.db.prepare("SELECT COUNT(*) AS value FROM bom_versions WHERE bom_id = ?1").bind(bom.id).first<{ value: number }>();
    const versionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`INSERT INTO bom_versions
        (id, bom_id, version_label, notes, currency, created_by_user_id, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
        .bind(versionId, bom.id, String(Number(count?.value ?? 0) + 1), input.notes ?? null, input.currency ?? "USD", userId, now),
    ];
    appendItems(this.db, statements, versionId, input.items);
    statements.push(this.db.prepare(`UPDATE boms SET current_version_id = ?1, updated_at = ?2
      WHERE id = ?3 AND current_version_id = ?4`).bind(versionId, now, bom.id, input.expectedVersionId));
    await this.db.batch(statements);
    return (await this.detail(bom.id))!;
  }
}

function appendItems(db: D1Database, statements: D1PreparedStatement[], versionId: string, items: BomItemInput[]): void {
  items.forEach((item, index) => statements.push(db.prepare(`INSERT INTO bom_items
    (id, bom_version_id, component_id, slot_key, description, quantity, unit, selected_supplier_offer_id,
     target_unit_price_minor, notes, extraction_method, completeness, evidence_locator, confidence, sort_order)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`)
    .bind(crypto.randomUUID(), versionId, item.componentId ?? null, item.slotKey, item.description, item.quantity,
      item.unit ?? "each", item.selectedSupplierOfferId ?? null, item.targetUnitPriceMinor ?? null, item.notes ?? null,
      item.extractionMethod ?? "explicit-bom", item.completeness ?? "probable", item.evidenceLocator ?? null,
      item.confidence ?? null, index)));
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/gu, "").trim().replace(/\s+/gu, "-").replace(/-+/gu, "-").slice(0, 70) || "bom";
}
