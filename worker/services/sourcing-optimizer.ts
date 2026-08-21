import { normalizePriceBreaks, type SourcingOffer } from "../../src/shared/offer";
import { optimizeSourcing, type SourcingConstraints, type SourcingEstimate, type SourcingLineInput } from "../../src/shared/sourcing";
import { BomsRepository } from "../db/repositories/boms";
import { AppError } from "../http";

type OfferRow = {
  id: string;
  supplier_id: string;
  supplier_name: string | null;
  component_id: string;
  region_code: string | null;
  currency: string;
  unit_price_minor: number;
  minimum_quantity: number;
  stock_quantity: number | null;
  lead_time_days: number | null;
  availability: string;
  condition: string | null;
  price_breaks: string | null;
  reliability_score: number | null;
  risk_label: string | null;
  freshness_label: string | null;
  observed_at: string;
  is_demo: number;
};

export class SourcingOptimizerService {
  constructor(private readonly db: D1Database) {}

  /** Produce a whole-BOM estimate from a materialized BOM. */
  async estimateForBom(bomId: string, constraints: SourcingConstraints = {}): Promise<SourcingEstimate> {
    const bom = await new BomsRepository(this.db).detail(bomId);
    if (!bom || bom.is_demo === 1) throw new AppError(404, "BOM_NOT_FOUND", "BOM not found.");
    const lines: SourcingLineInput[] = bom.items.map((item, index) => ({
      id: String(item.slotKey ?? item.id ?? `line-${index + 1}`),
      componentId: typeof item.componentId === "string" ? item.componentId : null,
      name: String(item.description ?? `Line ${index + 1}`),
      quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
      fabricated: item.completeness === "custom-fabricated",
      optional: false,
    }));
    const componentIds = Array.from(new Set(lines.map((line) => line.componentId).filter((id): id is string => Boolean(id))));
    const offers = componentIds.length ? await this.loadOffers(componentIds) : [];
    return optimizeSourcing(lines, offers, constraints);
  }

  async estimateForProject(projectId: string, constraints: SourcingConstraints = {}): Promise<SourcingEstimate> {
    const bom = await this.db.prepare(`SELECT id FROM boms WHERE project_id = ?1 AND is_demo = 0 ORDER BY updated_at DESC LIMIT 1`)
      .bind(projectId).first<{ id: string }>();
    if (!bom) throw new AppError(404, "PROJECT_BOM_NOT_FOUND", "This project has no BOM to estimate.");
    return this.estimateForBom(bom.id, constraints);
  }

  private async loadOffers(componentIds: string[]): Promise<SourcingOffer[]> {
    const placeholders = componentIds.map((_, index) => `?${index + 1}`).join(", ");
    const rows = await this.db.prepare(`SELECT so.id, so.supplier_id, s.name AS supplier_name, so.component_id,
        MIN(sr.region_code) AS region_code, so.currency, so.unit_price_minor, so.minimum_quantity,
        so.stock_quantity, so.lead_time_days, so.availability, so.condition, so.price_breaks,
        so.reliability_score, so.risk_label, so.freshness_label, so.observed_at, so.is_demo
      FROM supplier_offers so
      JOIN suppliers s ON s.id = so.supplier_id
      LEFT JOIN supplier_regions sr ON sr.supplier_id = s.id AND sr.ships_from = 1
      WHERE so.component_id IN (${placeholders}) AND so.is_demo = 0 AND s.is_demo = 0
      GROUP BY so.id ORDER BY so.unit_price_minor`)
      .bind(...componentIds).all<OfferRow>();
    return rows.results.map((row) => ({
      id: row.id,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      componentId: row.component_id,
      region: row.region_code,
      currency: row.currency,
      unitPriceMinor: row.unit_price_minor,
      minimumQuantity: row.minimum_quantity,
      stockQuantity: row.stock_quantity,
      leadTimeDays: row.lead_time_days,
      availability: (row.availability as SourcingOffer["availability"]) ?? "unknown",
      condition: (row.condition as SourcingOffer["condition"]) ?? "unknown",
      priceBreaks: normalizePriceBreaks(row.price_breaks),
      reliabilityScore: row.reliability_score,
      riskLabel: (row.risk_label as SourcingOffer["riskLabel"]) ?? "unknown",
      freshnessLabel: (row.freshness_label as SourcingOffer["freshnessLabel"]) ?? "unknown",
      observedAt: row.observed_at,
      isDemo: row.is_demo === 1,
    }));
  }
}
