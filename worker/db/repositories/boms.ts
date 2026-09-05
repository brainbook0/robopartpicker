import { AppError } from "../../http";
import type { BomPublicationState } from "../../../src/shared/bomPublication";
import { fileContentUrl } from "../../services/file-urls";

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
  lineClassification?: "purchased" | "fabricated" | "optional" | "non-procurement" | "unresolved";
  included?: boolean;
  optional?: boolean;
  rawFields?: Record<string, unknown>;
  aggregatedLocators?: string[];
};

export type BomDetail = BomRow & {
  version: {
    id: string;
    label: string;
    notes: string | null;
    currency: string;
    generationRunId: string | null;
    sourceFingerprint: string | null;
    validationReport: { blockers?: Array<{ lineId: string; description: string }> };
    publicationState: BomPublicationState;
    coverageNote: string | null;
    omissionReport: Array<Record<string, unknown>>;
    compilerVersion: string;
    policyVersion: string;
    quoteReady: number;
    confirmedAt: string | null;
    createdAt: string;
  } | null;
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
    const lineAccess = userId
      ? `(bv.publication_state IN ('verified', 'partial') OR b.owner_user_id = ?1 OR EXISTS (
          SELECT 1 FROM organization_members om2 WHERE om2.organization_id = b.organization_id AND om2.user_id = ?1 AND om2.status = 'active'))`
      : `bv.publication_state IN ('verified', 'partial')`;
    const statement = this.db.prepare(`SELECT b.*, bv.publication_state,
      COUNT(bi.id) AS line_count,
      COALESCE(SUM(COALESCE(bi.target_unit_price_minor, so.unit_price_minor, 0) * bi.quantity), 0) AS known_cost_minor,
      COALESCE(SUM(CASE WHEN COALESCE(bi.target_unit_price_minor, so.unit_price_minor) IS NULL THEN 1 ELSE 0 END), 0) AS unpriced_lines
      FROM boms b
      LEFT JOIN bom_versions bv ON bv.id = b.current_version_id
      LEFT JOIN bom_items bi ON bi.bom_version_id = b.current_version_id AND ${lineAccess}
      LEFT JOIN supplier_offers so ON so.id = bi.selected_supplier_offer_id AND so.is_demo = 0
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
      this.db.prepare(`SELECT id, version_label AS label, notes, currency,
        generation_run_id AS generationRunId, source_fingerprint AS sourceFingerprint,
        validation_report_json AS validationReport, quote_ready AS quoteReady,
        publication_state AS publicationState, coverage_note AS coverageNote,
        omission_report_json AS omissionReport, compiler_version AS compilerVersion,
        policy_version AS policyVersion,
        confirmed_at AS confirmedAt, created_at AS createdAt
        FROM bom_versions WHERE id = ?1`).bind(bom.current_version_id),
      this.db.prepare(`SELECT bi.id, bi.component_id AS componentId, c.slug AS componentSlug, c.name AS componentName,
        c.category AS componentCategory, c.manufacturer_part_number AS manufacturerPartNumber,
        m.name AS manufacturerName, bi.slot_key AS slotKey, bi.description,
        bi.quantity, bi.unit, bi.selected_supplier_offer_id AS selectedSupplierOfferId,
        s.name AS selectedSupplierName, so.unit_price_minor AS selectedUnitPriceMinor,
        bi.target_unit_price_minor AS targetUnitPriceMinor, bi.notes, bi.sort_order AS sortOrder,
        bi.extraction_method AS extractionMethod, bi.completeness, bi.evidence_locator AS evidenceLocator, bi.confidence,
        bi.line_classification AS lineClassification, bi.included, bi.optional,
        bi.raw_fields_json AS rawFields, bi.aggregated_locators_json AS aggregatedLocators,
        (SELECT cf.file_id FROM component_files cf JOIN files image_file ON image_file.id = cf.file_id
          WHERE cf.component_id = bi.component_id AND cf.purpose = 'image' AND image_file.status = 'ready'
            AND image_file.visibility = 'public' AND image_file.deleted_at IS NULL
          ORDER BY image_file.updated_at DESC, cf.file_id LIMIT 1) AS componentImageFileId,
        (SELECT MIN(so2.unit_price_minor) FROM supplier_offers so2 WHERE so2.component_id = bi.component_id AND so2.stock_quantity > 0 AND so2.is_demo = 0) AS lowestUnitPriceMinor,
        (SELECT COUNT(*) FROM supplier_offers so3 WHERE so3.component_id = bi.component_id AND so3.is_demo = 0) AS knownOfferCount
        FROM bom_items bi
        LEFT JOIN components c ON c.id = bi.component_id
        LEFT JOIN manufacturers m ON m.id = c.manufacturer_id
        LEFT JOIN supplier_offers so ON so.id = bi.selected_supplier_offer_id AND so.is_demo = 0
        LEFT JOIN suppliers s ON s.id = so.supplier_id AND s.is_demo = 0
        WHERE bi.bom_version_id = ?1 ORDER BY bi.sort_order, bi.id`).bind(bom.current_version_id),
    ]);
    const rows: Array<Record<string, unknown>> = (items.results as Array<Record<string, unknown>>).map((row): Record<string, unknown> => {
      const { componentImageFileId, ...item } = row;
      return {
        ...item,
        componentImageUrl: typeof componentImageFileId === "string" ? fileContentUrl(componentImageFileId) : null,
      };
    });
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
    const versionRow = version.results[0] as Record<string, unknown> | undefined;
    const parsedVersion = versionRow ? {
      ...versionRow,
      validationReport: parseObject(versionRow.validationReport),
      omissionReport: parseArray(versionRow.omissionReport),
    } as BomDetail["version"] : null;
    return {
      ...bom,
      version: parsedVersion,
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

  async confirm(bomId: string, expectedVersionId: string): Promise<BomDetail> {
    const bom = await this.find(bomId);
    if (!bom) throw new AppError(404, "BOM_NOT_FOUND", "BOM not found.");
    if (bom.current_version_id !== expectedVersionId) throw new AppError(409, "BOM_VERSION_CONFLICT", "The BOM changed; refresh and retry.");
    const detail = await this.detail(bom.id);
    if (!detail?.version) throw new AppError(409, "BOM_VERSION_MISSING", "This BOM has no current version.");
    const blockers: Array<{ lineId: string; description: string }> = [];
    for (const item of detail.items) {
      if (Number(item.included) !== 1 || item.lineClassification === "non-procurement") continue;
      const lineId = String(item.id);
      const name = String(item.description);
      if (!(Number(item.quantity) > 0)) blockers.push({ lineId, description: `${name}: quantity must be confirmed.` });
      if (!item.evidenceLocator) blockers.push({ lineId, description: `${name}: source evidence is missing.` });
      if (item.lineClassification === "unresolved") blockers.push({ lineId, description: `${name}: classify this line.` });
      if (item.lineClassification === "purchased" && !item.componentId) blockers.push({ lineId, description: `${name}: link an exact catalog component.` });
      if (item.lineClassification === "purchased" && !["complete", "verified"].includes(String(item.completeness))) {
        blockers.push({ lineId, description: `${name}: commercial identity is not verified.` });
      }
    }
    const now = new Date().toISOString();
    const report = { schemaVersion: "bom-validation/1", validatedAt: now, quoteReady: blockers.length === 0, blockers };
    await this.db.prepare(`UPDATE bom_versions SET confirmed_at = ?1, quote_ready = ?2, validation_report_json = ?3
      WHERE id = ?4 AND bom_id = ?5`).bind(now, blockers.length === 0 ? 1 : 0, JSON.stringify(report), expectedVersionId, bom.id).run();
    return (await this.detail(bom.id))!;
  }
}

function appendItems(db: D1Database, statements: D1PreparedStatement[], versionId: string, items: BomItemInput[]): void {
  items.forEach((item, index) => statements.push(db.prepare(`INSERT INTO bom_items
    (id, bom_version_id, component_id, slot_key, description, quantity, unit, selected_supplier_offer_id,
     target_unit_price_minor, notes, extraction_method, completeness, evidence_locator, confidence,
     line_classification, included, optional, raw_fields_json, aggregated_locators_json, sort_order)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)`)
    .bind(crypto.randomUUID(), versionId, item.componentId ?? null, item.slotKey, item.description, item.quantity,
      item.unit ?? "each", item.selectedSupplierOfferId ?? null, item.targetUnitPriceMinor ?? null, item.notes ?? null,
      item.extractionMethod ?? "explicit-bom", item.completeness ?? "probable", item.evidenceLocator ?? null,
      item.confidence ?? null, item.lineClassification ?? "unresolved", item.included === false ? 0 : 1,
      item.optional === true ? 1 : 0, JSON.stringify(item.rawFields ?? {}), JSON.stringify(item.aggregatedLocators ?? []), index)));
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/gu, "").trim().replace(/\s+/gu, "-").replace(/-+/gu, "-").slice(0, 70) || "bom";
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseArray(value: unknown): Array<Record<string, unknown>> {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      : [];
  } catch {
    return [];
  }
}
