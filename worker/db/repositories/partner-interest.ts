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

export type PartnerInterestStatus = "received" | "reviewing" | "qualified" | "closed" | "spam";

export type PartnerInterestAdminRecord = Omit<PartnerInterestRecord, "status"> & {
  websiteUrl: string | null;
  message: string;
  status: PartnerInterestStatus;
  source: string;
  requestId: string | null;
  adminNotes: string | null;
  updatedAt: string;
};

type PartnerInterestRow = {
  id: string;
  inquiry_type: PartnerInterestKind;
  organization_name: string;
  contact_name: string;
  email: string;
  website_url: string | null;
  message: string;
  status: PartnerInterestStatus;
  source: string;
  request_id: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapAdminRecord(row: PartnerInterestRow): PartnerInterestAdminRecord {
  return {
    id: row.id,
    inquiryType: row.inquiry_type,
    organizationName: row.organization_name,
    contactName: row.contact_name,
    email: row.email,
    websiteUrl: row.website_url,
    message: row.message,
    status: row.status,
    source: row.source,
    requestId: row.request_id,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createPartnerInterest(db: D1Database, input: CreatePartnerInterestInput): Promise<PartnerInterestRecord> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedOrganization = input.organizationName.trim().replace(/\s+/g, " ");
  const contactName = input.contactName.trim().replace(/\s+/g, " ");
  const recentCutoff = new Date(Date.now() - 6 * 60 * 60 * 1_000).toISOString();

  const duplicate = await db.prepare(`SELECT id, inquiry_type, organization_name, contact_name, email, created_at FROM partner_interest_submissions
    WHERE normalized_email = ?1 AND normalized_organization = ?2 AND created_at >= ?3
    LIMIT 1`)
    .bind(normalizedEmail, normalizedOrganization.toLowerCase(), recentCutoff)
    .first<{ id: string; inquiry_type: PartnerInterestKind; organization_name: string; contact_name: string; email: string; created_at: string }>();
  if (duplicate) {
    return {
      id: duplicate.id,
      inquiryType: duplicate.inquiry_type,
      organizationName: duplicate.organization_name,
      contactName: duplicate.contact_name,
      email: duplicate.email,
      status: "received",
      createdAt: duplicate.created_at,
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

export async function listSupplierPartnerInterests(
  db: D1Database,
  options: { status?: PartnerInterestStatus; limit: number },
): Promise<{ items: PartnerInterestAdminRecord[]; total: number }> {
  const statusClause = options.status ? "AND status = ?2" : "";
  const statement = db.prepare(`SELECT id, inquiry_type, organization_name, contact_name, email, website_url, message,
    status, source, request_id, admin_notes, created_at, updated_at
    FROM partner_interest_submissions
    WHERE inquiry_type IN ('supplier', 'partner') ${statusClause}
    ORDER BY created_at DESC LIMIT ?1`);
  const rows = await (options.status ? statement.bind(options.limit, options.status) : statement.bind(options.limit)).all<PartnerInterestRow>();
  const countStatement = db.prepare(`SELECT COUNT(*) AS value FROM partner_interest_submissions
    WHERE inquiry_type IN ('supplier', 'partner') ${options.status ? "AND status = ?1" : ""}`);
  const count = await (options.status ? countStatement.bind(options.status) : countStatement).first<{ value: number }>();
  return { items: rows.results.map(mapAdminRecord), total: Number(count?.value ?? 0) };
}

export async function triageSupplierPartnerInterest(
  db: D1Database,
  id: string,
  input: { status: PartnerInterestStatus; adminNotes: string | null },
): Promise<{ before: PartnerInterestAdminRecord; after: PartnerInterestAdminRecord } | null> {
  const beforeRow = await db.prepare(`SELECT id, inquiry_type, organization_name, contact_name, email, website_url, message,
    status, source, request_id, admin_notes, created_at, updated_at
    FROM partner_interest_submissions WHERE id = ?1 AND inquiry_type IN ('supplier', 'partner')`)
    .bind(id).first<PartnerInterestRow>();
  if (!beforeRow) return null;

  const now = new Date().toISOString();
  const updated = await db.prepare(`UPDATE partner_interest_submissions SET status = ?2, admin_notes = ?3, updated_at = ?4
    WHERE id = ?1 AND inquiry_type IN ('supplier', 'partner') AND updated_at = ?5`)
    .bind(id, input.status, input.adminNotes, now, beforeRow.updated_at).run();
  if (Number(updated.meta.changes ?? 0) !== 1) return null;

  const afterRow = await db.prepare(`SELECT id, inquiry_type, organization_name, contact_name, email, website_url, message,
    status, source, request_id, admin_notes, created_at, updated_at
    FROM partner_interest_submissions WHERE id = ?1`).bind(id).first<PartnerInterestRow>();
  if (!afterRow) return null;
  return { before: mapAdminRecord(beforeRow), after: mapAdminRecord(afterRow) };
}
