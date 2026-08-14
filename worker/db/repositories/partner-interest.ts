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

export type PartnerInterestStatus = "received" | "reviewing" | "qualified" | "closed" | "spam";

export type PartnerInterestAdminRecord = {
  id: string;
  inquiryType: PartnerInterestKind;
  organizationName: string;
  contactName: string;
  email: string;
  websiteUrl: string | null;
  message: string;
  status: PartnerInterestStatus;
  source: string;
  requestId: string | null;
  adminNotes: string | null;
  createdAt: string;
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

export type SupplierPartnerInterestTriageResult =
  | { ok: true; before: PartnerInterestAdminRecord; after: PartnerInterestAdminRecord }
  | { ok: false; reason: "not_found" | "conflict" | "invalid_transition" };

const allowedTransitions: Record<PartnerInterestStatus, ReadonlySet<PartnerInterestStatus>> = {
  received: new Set(["received", "reviewing", "closed", "spam"]),
  reviewing: new Set(["reviewing", "qualified", "closed", "spam"]),
  qualified: new Set(["qualified", "closed"]),
  closed: new Set(["closed"]),
  spam: new Set(["spam"]),
};

function nextUpdatedAt(previous: string): string {
  const previousTime = Date.parse(previous);
  return new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
}

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

export async function createPartnerInterest(db: D1Database, input: CreatePartnerInterestInput): Promise<void> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedOrganization = input.organizationName.trim().replace(/\s+/g, " ");
  const contactName = input.contactName.trim().replace(/\s+/g, " ");
  const recentCutoff = new Date(Date.now() - 6 * 60 * 60 * 1_000).toISOString();

  await db.prepare(`INSERT INTO partner_interest_submissions
    (id, inquiry_type, organization_name, normalized_organization, contact_name, email, normalized_email, website_url, message, status, source, ip_hash, user_agent, request_id, created_at, updated_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'received', 'public_partners_page', ?10, ?11, ?12, ?13, ?13
    WHERE NOT EXISTS (
      SELECT 1 FROM partner_interest_submissions
      WHERE normalized_email = ?7 AND normalized_organization = ?4 AND created_at >= ?14
    )`)
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
      recentCutoff,
    )
    .run();
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
  input: {
    status: PartnerInterestStatus;
    adminNotes: string | null;
    expectedUpdatedAt: string;
    actorUserId: string;
    requestId: string | null;
  },
): Promise<SupplierPartnerInterestTriageResult> {
  const beforeRow = await db.prepare(`SELECT id, inquiry_type, organization_name, contact_name, email, website_url, message,
    status, source, request_id, admin_notes, created_at, updated_at
    FROM partner_interest_submissions WHERE id = ?1 AND inquiry_type IN ('supplier', 'partner')`)
    .bind(id).first<PartnerInterestRow>();
  if (!beforeRow) return { ok: false, reason: "not_found" };
  if (beforeRow.updated_at !== input.expectedUpdatedAt) return { ok: false, reason: "conflict" };
  if (!allowedTransitions[beforeRow.status].has(input.status)) return { ok: false, reason: "invalid_transition" };

  const now = nextUpdatedAt(beforeRow.updated_at);
  const operationId = crypto.randomUUID();
  const before = mapAdminRecord(beforeRow);
  const after: PartnerInterestAdminRecord = { ...before, status: input.status, adminNotes: input.adminNotes, updatedAt: now };
  const [updated, audited] = await db.batch([
    db.prepare(`UPDATE partner_interest_submissions
      SET status = ?2, admin_notes = ?3, updated_at = ?4, last_triage_operation_id = ?5
      WHERE id = ?1 AND inquiry_type IN ('supplier', 'partner') AND status = ?6 AND updated_at = ?7`)
      .bind(id, input.status, input.adminNotes, now, operationId, beforeRow.status, input.expectedUpdatedAt),
    db.prepare(`INSERT INTO audit_events
      (id, actor_user_id, action, entity_type, entity_id, request_id, before_json, after_json, created_at)
      SELECT ?1, ?2, 'supplier_relationship.triage', 'partner_interest_submission', ?3, ?4, ?5, ?6, ?7
      FROM partner_interest_submissions
      WHERE id = ?3 AND last_triage_operation_id = ?8 AND status = ?9 AND updated_at = ?7`)
      .bind(
        crypto.randomUUID(),
        input.actorUserId,
        id,
        input.requestId,
        JSON.stringify({ status: before.status, adminNotes: before.adminNotes }),
        JSON.stringify({ status: after.status, adminNotes: after.adminNotes }),
        now,
        operationId,
        input.status,
      ),
  ]);
  const updateChanges = Number(updated.meta.changes ?? 0);
  const auditChanges = Number(audited.meta.changes ?? 0);
  if (updateChanges === 0 && auditChanges === 0) return { ok: false, reason: "conflict" };
  if (updateChanges !== 1 || auditChanges !== 1) throw new Error("Supplier relationship triage atomicity invariant failed.");
  return { ok: true, before, after };
}
