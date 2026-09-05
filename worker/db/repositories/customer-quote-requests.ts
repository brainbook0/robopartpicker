export type CustomerQuoteContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  deliveryNotes: string | null;
};

export type CreateCustomerQuoteRequestInput = {
  requesterUserId: string;
  projectId: string | null;
  bomId: string | null;
  bomVersionId: string | null;
  contact: CustomerQuoteContact;
  materialsEstimateMinor: number;
  shippingEstimateMinor: number;
  shippingMethodVersion: string;
  shippingConfidence: "high" | "medium" | "low";
  estimateSnapshot: Record<string, unknown>;
  consentAt: string;
  retentionExpiresAt: string;
};

export type CustomerQuoteReceipt = {
  id: string;
  status: "submitted";
  currency: "USD";
  materialsEstimateMinor: number;
  shippingEstimateMinor: number;
  totalEstimateMinor: number;
  shippingConfidence: "high" | "medium" | "low";
  humanReviewRequired: true;
  createdAt: string;
  retentionExpiresAt: string;
};

export type CustomerQuotePrivateRecord = CustomerQuoteReceipt & {
  requesterUserId: string;
  projectId: string | null;
  bomId: string | null;
  bomVersionId: string | null;
  contact: CustomerQuoteContact;
  status: "submitted" | "reviewing" | "quoted" | "closed" | "deleted";
  shippingMethodVersion: string;
  estimateSnapshot: Record<string, unknown>;
  consentAt: string;
  updatedAt: string;
};

export class CustomerQuoteRequestsRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: CreateCustomerQuoteRequestInput): Promise<CustomerQuoteReceipt> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await this.db.prepare(`INSERT INTO customer_quote_requests (
      id, requester_user_id, project_id, bom_id, bom_version_id,
      first_name, last_name, email, phone, address_line1, address_line2, city, region, postal_code, country_code, delivery_notes,
      currency, materials_estimate_minor, shipping_estimate_minor, shipping_method_version, shipping_confidence,
      estimate_snapshot_json, consent_at, retention_expires_at, status, created_at, updated_at
    ) VALUES (
      ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
      'USD', ?17, ?18, ?19, ?20, ?21, ?22, ?23, 'submitted', ?24, ?24
    )`).bind(
      id, input.requesterUserId, input.projectId, input.bomId, input.bomVersionId,
      input.contact.firstName, input.contact.lastName, input.contact.email, input.contact.phone,
      input.contact.addressLine1, input.contact.addressLine2, input.contact.city, input.contact.region,
      input.contact.postalCode, input.contact.countryCode, input.contact.deliveryNotes,
      input.materialsEstimateMinor, input.shippingEstimateMinor, input.shippingMethodVersion,
      input.shippingConfidence, JSON.stringify(input.estimateSnapshot), input.consentAt,
      input.retentionExpiresAt, createdAt,
    ).run();
    return {
      id,
      status: "submitted",
      currency: "USD",
      materialsEstimateMinor: input.materialsEstimateMinor,
      shippingEstimateMinor: input.shippingEstimateMinor,
      totalEstimateMinor: input.materialsEstimateMinor + input.shippingEstimateMinor,
      shippingConfidence: input.shippingConfidence,
      humanReviewRequired: true,
      createdAt,
      retentionExpiresAt: input.retentionExpiresAt,
    };
  }

  async getForUser(id: string, userId: string): Promise<CustomerQuotePrivateRecord | null> {
    const row = await this.db.prepare(`SELECT id, requester_user_id, project_id, bom_id, bom_version_id,
      first_name, last_name, email, phone, address_line1, address_line2, city, region, postal_code, country_code, delivery_notes,
      materials_estimate_minor, shipping_estimate_minor, shipping_method_version, shipping_confidence, estimate_snapshot_json,
      consent_at, retention_expires_at, status, created_at, updated_at
      FROM customer_quote_requests WHERE id = ?1 AND requester_user_id = ?2 AND status <> 'deleted'`)
      .bind(id, userId).first<Record<string, unknown>>();
    if (!row) return null;
    const materialsEstimateMinor = Number(row.materials_estimate_minor);
    const shippingEstimateMinor = Number(row.shipping_estimate_minor);
    return {
      id: String(row.id),
      requesterUserId: String(row.requester_user_id),
      projectId: textOrNull(row.project_id),
      bomId: textOrNull(row.bom_id),
      bomVersionId: textOrNull(row.bom_version_id),
      contact: {
        firstName: String(row.first_name), lastName: String(row.last_name), email: String(row.email), phone: textOrNull(row.phone),
        addressLine1: String(row.address_line1), addressLine2: textOrNull(row.address_line2), city: String(row.city),
        region: String(row.region), postalCode: String(row.postal_code), countryCode: String(row.country_code), deliveryNotes: textOrNull(row.delivery_notes),
      },
      status: row.status as CustomerQuotePrivateRecord["status"],
      currency: "USD",
      materialsEstimateMinor,
      shippingEstimateMinor,
      totalEstimateMinor: materialsEstimateMinor + shippingEstimateMinor,
      shippingConfidence: row.shipping_confidence as CustomerQuotePrivateRecord["shippingConfidence"],
      shippingMethodVersion: String(row.shipping_method_version),
      estimateSnapshot: parseObject(row.estimate_snapshot_json),
      humanReviewRequired: true,
      consentAt: String(row.consent_at),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      retentionExpiresAt: String(row.retention_expires_at),
    };
  }
}

function textOrNull(value: unknown): string | null { return typeof value === "string" ? value : null; }
function parseObject(value: unknown): Record<string, unknown> {
  try { const parsed: unknown = JSON.parse(String(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }
  catch { return {}; }
}
