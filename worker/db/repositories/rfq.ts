import type { SourcingEstimate } from "../../../src/shared/sourcing";
import { isRfqState, transitionRfq, type RfqAction, type RfqState } from "../../../src/shared/rfq";
import { AppError } from "../../http";

export type RfqRequest = {
  id: string;
  projectId: string | null;
  bomId: string | null;
  createdByUserId: string;
  status: RfqState;
  estimateSnapshot: SourcingEstimate;
  totalEstimateMinor: number | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export class RfqRepository {
  constructor(private readonly db: D1Database) {}

  async create(userId: string, input: { projectId?: string | null; bomId?: string | null; estimate: SourcingEstimate; expiresAt?: string | null }): Promise<RfqRequest> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`INSERT INTO rfq_requests
        (id, project_id, bom_id, created_by_user_id, status, estimate_snapshot_json, total_estimate_minor, expires_at, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, 'estimate_ready', ?5, ?6, ?7, ?8, ?8)`)
        .bind(id, input.projectId ?? null, input.bomId ?? null, userId, JSON.stringify(input.estimate), input.estimate.assumptions.partsTotalMinor, input.expiresAt ?? null, now),
    ];
    input.estimate.basket.forEach((line, index) => {
      statements.push(this.db.prepare(`INSERT INTO rfq_line_items
        (id, rfq_request_id, component_id, line_key, description, quantity, estimate_unit_price_minor,
         is_substitute, is_excluded, sort_order)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
        .bind(crypto.randomUUID(), id, line.componentId, line.lineId, line.name, line.quantity, line.unitPriceMinor,
          line.isSubstitute ? 1 : 0, line.unpriced || line.exclusionReason ? 1 : 0, index));
    });
    await this.db.batch(statements);
    return (await this.get(id))!;
  }

  async get(id: string): Promise<RfqRequest | null> {
    const row = await this.db.prepare(`SELECT id, project_id AS projectId, bom_id AS bomId, created_by_user_id AS createdByUserId,
        status, estimate_snapshot_json AS estimateSnapshot, total_estimate_minor AS totalEstimateMinor,
        expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt
      FROM rfq_requests WHERE id = ?1`).bind(id).first<Record<string, unknown>>();
    if (!row) return null;
    return {
      id: String(row.id),
      projectId: typeof row.projectId === "string" ? row.projectId : null,
      bomId: typeof row.bomId === "string" ? row.bomId : null,
      createdByUserId: String(row.createdByUserId),
      status: isRfqState(row.status) ? row.status : "estimate_ready",
      estimateSnapshot: JSON.parse(String(row.estimateSnapshot)) as SourcingEstimate,
      totalEstimateMinor: typeof row.totalEstimateMinor === "number" ? row.totalEstimateMinor : null,
      expiresAt: typeof row.expiresAt === "string" ? row.expiresAt : null,
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    };
  }

  async listLineItems(rfqId: string): Promise<Array<Record<string, unknown>>> {
    const rows = await this.db.prepare(`SELECT id, bom_item_id AS bomItemId, component_id AS componentId, line_key AS lineKey,
        description, quantity, estimate_unit_price_minor AS estimateUnitPriceMinor,
        quote_unit_price_minor AS quoteUnitPriceMinor, quote_currency AS quoteCurrency, supplier_id AS supplierId,
        supplier_sku AS supplierSku, lead_time_days AS leadTimeDays, is_substitute AS isSubstitute,
        is_excluded AS isExcluded, notes, sort_order AS sortOrder
      FROM rfq_line_items WHERE rfq_request_id = ?1 ORDER BY sort_order`).bind(rfqId).all<Record<string, unknown>>();
    return rows.results;
  }

  async transition(id: string, action: RfqAction): Promise<RfqState> {
    const request = await this.get(id);
    if (!request) throw new AppError(404, "RFQ_NOT_FOUND", "Quote request not found.");
    const next = transitionRfq(request.status, action);
    if (!next) throw new AppError(409, "RFQ_INVALID_TRANSITION", `Cannot ${action} from ${request.status}.`);
    await this.db.prepare(`UPDATE rfq_requests SET status = ?1, updated_at = ?2 WHERE id = ?3`)
      .bind(next, new Date().toISOString(), id).run();
    return next;
  }

  async recordResponse(id: string, items: Array<{ lineKey: string; quoteUnitPriceMinor?: number | null; quoteCurrency?: string | null; supplierId?: string | null; supplierSku?: string | null; leadTimeDays?: number | null; isSubstitute?: boolean }>): Promise<void> {
    const request = await this.get(id);
    if (!request) throw new AppError(404, "RFQ_NOT_FOUND", "Quote request not found.");
    if (!transitionRfq(request.status, "receive_partial")) throw new AppError(409, "RFQ_INVALID_TRANSITION", `Cannot receive_partial from ${request.status}.`);

    const lineKeys = [...new Set(items.map((item) => item.lineKey))];
    const placeholders = lineKeys.map((_, index) => `?${index + 2}`).join(", ");
    const existing = await this.db.prepare(`SELECT line_key AS lineKey FROM rfq_line_items WHERE rfq_request_id = ?1 AND line_key IN (${placeholders})`)
      .bind(id, ...lineKeys).all<{ lineKey: string }>();
    const existingKeys = new Set(existing.results.map((row) => row.lineKey));
    const unknown = lineKeys.filter((lineKey) => !existingKeys.has(lineKey));
    if (unknown.length) throw new AppError(400, "RFQ_UNKNOWN_LINE", `Unknown RFQ lineKey: ${unknown[0]}.`);

    const statements: D1PreparedStatement[] = [];
    for (const item of items) {
      statements.push(this.db.prepare(`UPDATE rfq_line_items SET
          quote_unit_price_minor = COALESCE(?1, quote_unit_price_minor),
          quote_currency = COALESCE(?2, quote_currency),
          supplier_id = COALESCE(?3, supplier_id),
          supplier_sku = COALESCE(?4, supplier_sku),
          lead_time_days = COALESCE(?5, lead_time_days),
          is_substitute = CASE WHEN ?6 IS NULL THEN is_substitute ELSE ?6 END
        WHERE rfq_request_id = ?7 AND line_key = ?8`)
        .bind(item.quoteUnitPriceMinor ?? null, item.quoteCurrency ?? null, item.supplierId ?? null, item.supplierSku ?? null,
          item.leadTimeDays ?? null, item.isSubstitute === undefined ? null : item.isSubstitute ? 1 : 0, id, item.lineKey));
    }
    if (statements.length) await this.db.batch(statements);
    await this.transition(id, "receive_partial");
  }

  async reconcile(id: string): Promise<RfqState> {
    await this.transition(id, "reconcile");
    return this.transition(id, "review");
  }

  async approve(id: string): Promise<RfqState> {
    return this.transition(id, "approve");
  }

  async cancel(id: string): Promise<RfqState> {
    return this.transition(id, "cancel");
  }

  async expire(id: string): Promise<RfqState> {
    return this.transition(id, "expire");
  }
}
