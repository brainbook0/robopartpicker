import { buildCompletedQuoteSnapshot, type CompletedQuoteSnapshot, type QuoteLineInput, type QuoteOfferInput } from "../../src/shared/completed-quote";
import { BomsRepository, type BomDetail } from "../db/repositories/boms";
import type { Env } from "../env";
import { AppError } from "../http";
import { completedQuoteAllowed } from "../../src/shared/bomPublication";
import { isEmailDeliveryConfigured, sendEmail } from "./email";

export type QuoteEmailDraft = {
  id: string;
  bomId: string;
  bomVersionId: string;
  createdByUserId: string;
  draftVersion: number;
  currency: string;
  subtotalMinor: number;
  recipients: string[];
  introduction: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  pricingSnapshot: CompletedQuoteSnapshot;
  status: "draft" | "sending" | "sent" | "partial_failed" | "failed" | "invalidated";
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deliveries: Array<{
    id: string;
    recipient: string;
    status: "pending" | "sending" | "sent" | "failed";
    providerMessageId: string | null;
    attemptCount: number;
    lastError: string | null;
    sentAt: string | null;
  }>;
  emailDeliveryConfigured: boolean;
};

type OfferRow = {
  id: string;
  componentId: string;
  currency: string;
  unitPriceMinor: number;
  observedAt: string;
  expiresAt: string | null;
  isDemo: number;
  riskLabel: string | null;
};

export class CompletedQuotesService {
  constructor(private readonly env: Env) {}

  async eligibility(bomId: string): Promise<ReturnType<typeof buildCompletedQuoteSnapshot>> {
    const detail = await new BomsRepository(this.env.DB).detail(bomId);
    if (!detail || detail.is_demo === 1 || !detail.version) throw new AppError(404, "BOM_NOT_FOUND", "BOM not found.");
    return this.buildEligibility(detail);
  }

  async createDraft(userId: string, input: { bomId: string; recipients: string[]; introduction: string }): Promise<QuoteEmailDraft> {
    const bom = await new BomsRepository(this.env.DB).detail(input.bomId);
    if (!bom || bom.is_demo === 1 || !bom.version) throw new AppError(404, "BOM_NOT_FOUND", "BOM not found.");
    if (!completedQuoteAllowed(bom.version.publicationState, bom.version.quoteReady === 1)) {
      throw new AppError(409, "BOM_NOT_QUOTE_READY", "This BOM is not ready for a completed quote.");
    }
    const eligibility = await this.buildEligibility(bom);
    if (!eligibility.ready || !eligibility.snapshot) {
      throw new AppError(409, "BOM_NOT_QUOTE_READY", "This BOM is not ready for a completed quote.", eligibility.blockers.map((blocker) => ({ message: blocker.description })));
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const recipients = Array.from(new Set(input.recipients.map(normalizeEmail)));
    const rendered = renderQuote(eligibility.snapshot, input.introduction);
    const statements: D1PreparedStatement[] = [this.env.DB.prepare(`INSERT INTO quote_email_drafts
      (id, bom_id, bom_version_id, created_by_user_id, draft_version, currency, subtotal_minor,
       shipping_tax_excluded, recipients_json, introduction, subject, html_body, text_body,
       pricing_snapshot_json, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, 1, ?7, ?8, ?9, ?10, ?11, ?12, 'draft', ?13, ?13)`)
      .bind(id, bom.id, bom.version.id, userId, eligibility.snapshot.currency, eligibility.snapshot.subtotalMinor,
        JSON.stringify(recipients), input.introduction, rendered.subject, rendered.html, rendered.text,
        JSON.stringify(eligibility.snapshot), now)];
    for (const recipient of recipients) {
      const recipientHash = await sha256(recipient);
      const idempotencyKey = await sha256(`${id}\u00001\u0000${recipient}`);
      statements.push(this.env.DB.prepare(`INSERT INTO quote_email_deliveries
        (id, quote_email_draft_id, recipient, recipient_hash, idempotency_key, status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?6)`)
        .bind(crypto.randomUUID(), id, recipient, recipientHash, idempotencyKey, now));
    }
    await this.env.DB.batch(statements);
    return (await this.get(id, userId))!;
  }

  async get(id: string, userId: string): Promise<QuoteEmailDraft | null> {
    const row = await this.env.DB.prepare(`SELECT id, bom_id AS bomId, bom_version_id AS bomVersionId,
        created_by_user_id AS createdByUserId, draft_version AS draftVersion, currency,
        subtotal_minor AS subtotalMinor, recipients_json AS recipients, introduction, subject,
        html_body AS htmlBody, text_body AS textBody, pricing_snapshot_json AS pricingSnapshot,
        status, confirmed_at AS confirmedAt, created_at AS createdAt, updated_at AS updatedAt
      FROM quote_email_drafts WHERE id = ?1 AND created_by_user_id = ?2`).bind(id, userId).first<Record<string, unknown>>();
    if (!row) return null;
    const deliveries = await this.env.DB.prepare(`SELECT id, recipient, status,
        provider_message_id AS providerMessageId, attempt_count AS attemptCount,
        last_error AS lastError, sent_at AS sentAt
      FROM quote_email_deliveries WHERE quote_email_draft_id = ?1 ORDER BY recipient`).bind(id).all<Record<string, unknown>>();
    return {
      id: String(row.id),
      bomId: String(row.bomId),
      bomVersionId: String(row.bomVersionId),
      createdByUserId: String(row.createdByUserId),
      draftVersion: Number(row.draftVersion),
      currency: String(row.currency),
      subtotalMinor: Number(row.subtotalMinor),
      recipients: parseStringArray(row.recipients),
      introduction: String(row.introduction),
      subject: String(row.subject),
      htmlBody: String(row.htmlBody),
      textBody: String(row.textBody),
      pricingSnapshot: JSON.parse(String(row.pricingSnapshot)) as CompletedQuoteSnapshot,
      status: row.status as QuoteEmailDraft["status"],
      confirmedAt: typeof row.confirmedAt === "string" ? row.confirmedAt : null,
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
      deliveries: deliveries.results.map((delivery) => ({
        id: String(delivery.id), recipient: String(delivery.recipient),
        status: delivery.status as QuoteEmailDraft["deliveries"][number]["status"],
        providerMessageId: typeof delivery.providerMessageId === "string" ? delivery.providerMessageId : null,
        attemptCount: Number(delivery.attemptCount), lastError: typeof delivery.lastError === "string" ? delivery.lastError : null,
        sentAt: typeof delivery.sentAt === "string" ? delivery.sentAt : null,
      })),
      emailDeliveryConfigured: isEmailDeliveryConfigured(this.env),
    };
  }

  async send(id: string, userId: string, replyTo: string, expectedDraftVersion: number): Promise<QuoteEmailDraft> {
    const draft = await this.get(id, userId);
    if (!draft) throw new AppError(404, "QUOTE_DRAFT_NOT_FOUND", "Completed quote draft not found.");
    if (draft.draftVersion !== expectedDraftVersion) throw new AppError(409, "QUOTE_DRAFT_VERSION_CONFLICT", "The quote draft changed; refresh before sending.");
    if (draft.status === "invalidated") throw new AppError(409, "QUOTE_DRAFT_INVALIDATED", "This draft is no longer valid. Generate a new completed quote.");
    if (!isEmailDeliveryConfigured(this.env)) throw new AppError(503, "EMAIL_DELIVERY_UNAVAILABLE", "Email delivery is not configured.");

    const bom = await new BomsRepository(this.env.DB).detail(draft.bomId);
    if (!bom?.version || bom.version.id !== draft.bomVersionId) return this.invalidateAndThrow(draft.id);
    const current = await this.buildEligibility(bom);
    if (!current.ready || !current.snapshot || !samePricing(draft.pricingSnapshot, current.snapshot)) return this.invalidateAndThrow(draft.id);

    const now = new Date().toISOString();
    await this.env.DB.prepare("UPDATE quote_email_drafts SET status = 'sending', confirmed_at = COALESCE(confirmed_at, ?1), updated_at = ?1 WHERE id = ?2")
      .bind(now, draft.id).run();
    for (const delivery of draft.deliveries.filter((item) => item.status !== "sent")) {
      const claimed = await this.env.DB.prepare(`UPDATE quote_email_deliveries SET status = 'sending', attempt_count = attempt_count + 1,
          last_error = NULL, updated_at = ?1 WHERE id = ?2 AND status IN ('pending', 'failed')`)
        .bind(new Date().toISOString(), delivery.id).run();
      if (Number(claimed.meta.changes ?? 0) !== 1) continue;
      try {
        const result = await sendEmail(this.env, { to: delivery.recipient, replyTo, subject: draft.subject, text: draft.textBody, html: draft.htmlBody });
        const sentAt = new Date().toISOString();
        await this.env.DB.prepare(`UPDATE quote_email_deliveries SET status = 'sent', provider_message_id = ?1,
          sent_at = ?2, updated_at = ?2 WHERE id = ?3`).bind(result.providerMessageId, sentAt, delivery.id).run();
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : "Email provider failed.";
        await this.env.DB.prepare(`UPDATE quote_email_deliveries SET status = 'failed', last_error = ?1,
          updated_at = ?2 WHERE id = ?3`).bind(message, new Date().toISOString(), delivery.id).run();
      }
    }
    const counts = await this.env.DB.prepare(`SELECT
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        COUNT(*) AS total FROM quote_email_deliveries WHERE quote_email_draft_id = ?1`).bind(draft.id).first<{ sent: number; failed: number; total: number }>();
    const status: QuoteEmailDraft["status"] = Number(counts?.sent) === Number(counts?.total)
      ? "sent" : Number(counts?.sent) > 0 ? "partial_failed" : "failed";
    await this.env.DB.prepare("UPDATE quote_email_drafts SET status = ?1, updated_at = ?2 WHERE id = ?3")
      .bind(status, new Date().toISOString(), draft.id).run();
    return (await this.get(draft.id, userId))!;
  }

  private async buildEligibility(bom: BomDetail) {
    const lines: QuoteLineInput[] = bom.items.map((item) => ({
      id: String(item.id), description: String(item.description), quantity: Number(item.quantity), unit: String(item.unit ?? "each"),
      componentId: typeof item.componentId === "string" ? item.componentId : null,
      classification: normalizeClassification(item.lineClassification), included: Number(item.included ?? 1) === 1,
      optional: Number(item.optional ?? 0) === 1, completeness: String(item.completeness ?? "unresolved"),
      evidenceLocator: typeof item.evidenceLocator === "string" && item.evidenceLocator ? item.evidenceLocator : null,
    }));
    const componentIds = Array.from(new Set(lines.map((line) => line.componentId).filter((value): value is string => Boolean(value))));
    const offers: QuoteOfferInput[] = componentIds.length ? (await this.env.DB.prepare(`SELECT id, component_id AS componentId,
        currency, unit_price_minor AS unitPriceMinor, observed_at AS observedAt, expires_at AS expiresAt,
        is_demo AS isDemo, risk_label AS riskLabel FROM supplier_offers
      WHERE component_id IN (${componentIds.map((_, index) => `?${index + 1}`).join(", ")}) AND is_demo = 0 AND unit_price_minor > 0`)
      .bind(...componentIds).all<OfferRow>()).results.map((row) => ({ ...row, isDemo: row.isDemo === 1 })) : [];
    return buildCompletedQuoteSnapshot({
      bomId: bom.id, bomVersionId: bom.version!.id, bomName: bom.name, currency: bom.version!.currency,
      confirmed: Boolean(bom.version!.confirmedAt), lines, offers,
    });
  }

  private async invalidateAndThrow(id: string): Promise<never> {
    await this.env.DB.prepare("UPDATE quote_email_drafts SET status = 'invalidated', updated_at = ?1 WHERE id = ?2")
      .bind(new Date().toISOString(), id).run();
    throw new AppError(409, "QUOTE_DRAFT_INVALIDATED", "The BOM or its prices changed. Generate a new completed quote.");
  }
}

function renderQuote(snapshot: CompletedQuoteSnapshot, introduction: string): { subject: string; html: string; text: string } {
  const subject = `Completed quote: ${snapshot.bomName}`.slice(0, 200);
  const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: snapshot.currency }).format(value / 100);
  const textLines = snapshot.lines.map((line) => `${line.description} | ${line.quantity} ${line.unit} | ${money(line.unitPriceMinor)} each | ${money(line.extendedPriceMinor)} | observed ${line.observedAt}`);
  const text = [introduction.trim(), "", `Completed quote for ${snapshot.bomName}`, ...textLines, "", `Subtotal: ${money(snapshot.subtotalMinor)}`, "Shipping and tax are excluded.", `Generated ${snapshot.generatedAt}. Prices are internal observations, not proof of fulfillment.`].join("\n").trim();
  const rows = snapshot.lines.map((line) => `<tr><td>${escapeHtml(line.description)}</td><td>${line.quantity} ${escapeHtml(line.unit)}</td><td>${money(line.unitPriceMinor)}</td><td>${money(line.extendedPriceMinor)}</td><td>${escapeHtml(line.observedAt)}</td></tr>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;color:#18181b"><p>${escapeHtml(introduction).replace(/\n/gu, "<br>")}</p><h2>Completed quote for ${escapeHtml(snapshot.bomName)}</h2><table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th align="left">Item</th><th align="left">Quantity</th><th align="left">Unit price</th><th align="left">Line total</th><th align="left">Observed</th></tr></thead><tbody>${rows}</tbody></table><p><strong>Subtotal: ${money(snapshot.subtotalMinor)}</strong></p><p>Shipping and tax are excluded.</p><p style="color:#71717a;font-size:12px">Generated ${escapeHtml(snapshot.generatedAt)}. Prices are internal observations, not proof of fulfillment.</p></div>`;
  return { subject, html, text };
}

function samePricing(left: CompletedQuoteSnapshot, right: CompletedQuoteSnapshot): boolean {
  return left.bomVersionId === right.bomVersionId && left.currency === right.currency
    && JSON.stringify(left.lines.map(priceIdentity)) === JSON.stringify(right.lines.map(priceIdentity));
}
function priceIdentity(line: CompletedQuoteSnapshot["lines"][number]) {
  return [line.bomItemId, line.selectedOfferId, line.quantity, line.unitPriceMinor, line.extendedPriceMinor, line.observedAt];
}
function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }
function parseStringArray(value: unknown): string[] { try { const parsed = JSON.parse(String(value)); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }
function normalizeClassification(value: unknown): QuoteLineInput["classification"] { return ["purchased", "fabricated", "optional", "non-procurement", "unresolved"].includes(String(value)) ? value as QuoteLineInput["classification"] : "unresolved"; }
function escapeHtml(value: string): string { return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;"); }
async function sha256(value: string): Promise<string> { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
