export type PartnerInterestKind = "advertiser" | "supplier" | "partner" | "project_owner" | "service_provider";

export type CreatePartnerInterestInput = {
  inquiryType: PartnerInterestKind;
  organizationName: string;
  contactName: string;
  email: string;
  websiteUrl?: string | null;
  message: string;
  ipHash?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

export type PartnerInterestRecord = {
  id: string;
  inquiryType: PartnerInterestKind;
  organizationName: string;
  contactName: string;
  email: string;
  status: "received";
  createdAt: string;
};

export async function createPartnerInterest(db: D1Database, input: CreatePartnerInterestInput): Promise<PartnerInterestRecord> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedOrganization = input.organizationName.trim().replace(/\s+/g, " ");
  const contactName = input.contactName.trim().replace(/\s+/g, " ");
  const recentCutoff = new Date(Date.now() - 6 * 60 * 60 * 1_000).toISOString();

  const duplicate = await db.prepare(`SELECT id FROM partner_interest_submissions
    WHERE normalized_email = ?1 AND normalized_organization = ?2 AND created_at >= ?3
    LIMIT 1`)
    .bind(normalizedEmail, normalizedOrganization.toLowerCase(), recentCutoff)
    .first<{ id: string }>();
  if (duplicate) {
    return {
      id: duplicate.id,
      inquiryType: input.inquiryType,
      organizationName: normalizedOrganization,
      contactName,
      email: normalizedEmail,
      status: "received",
      createdAt: now,
    };
  }

  await db.prepare(`INSERT INTO partner_interest_submissions
    (id, inquiry_type, organization_name, normalized_organization, contact_name, email, normalized_email, website_url, message, status, source, ip_hash, user_agent, request_id, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'received', 'public_partners_page', ?10, ?11, ?12, ?13, ?13)`)
    .bind(
      id,
      input.inquiryType,
      normalizedOrganization,
      normalizedOrganization.toLowerCase(),
      contactName,
      normalizedEmail,
      normalizedEmail,
      input.websiteUrl?.trim() || null,
      input.message.trim(),
      input.ipHash ?? null,
      input.userAgent?.slice(0, 300) ?? null,
      input.requestId ?? null,
      now,
    )
    .run();

  return { id, inquiryType: input.inquiryType, organizationName: normalizedOrganization, contactName, email: normalizedEmail, status: "received", createdAt: now };
}
