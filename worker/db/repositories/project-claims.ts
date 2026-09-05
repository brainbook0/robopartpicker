import type {
  ProjectClaimEligibility,
  ProjectClaimEligibilityReason,
  ProjectClaimReceipt,
  ProjectClaimReviewItem,
  ProjectClaimStatus,
} from "../../../src/shared/projectClaims";

const IMPORTER_USER_ID = "robotics-catalog-import";
const CLOSED_LICENSES = new Set([
  "proprietary",
  "manufacturer terms",
  "manufacturer-terms",
  "unknown",
  "other",
  "none",
  "noassertion",
  "unlicensed",
]);

type EligibilityRow = {
  id: string;
  owner_user_id: string | null;
  organization_id: string | null;
  visibility: string;
  status: string;
  license_spdx: string | null;
  repository_url: string | null;
  project_kind: string;
  is_demo: number;
  version: number;
};

type ReceiptRow = {
  id: string;
  project_id: string;
  status: ProjectClaimStatus;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  transferred_at: string | null;
  withdrawn_at: string | null;
};

export class ProjectClaimsRepository {
  constructor(private readonly db: D1Database) {}

  async eligibility(projectId: string): Promise<{ item: ProjectClaimEligibility; row: EligibilityRow } | null> {
    const row = await this.db.prepare(`SELECT id, owner_user_id, organization_id, visibility, status,
        license_spdx, repository_url, project_kind, is_demo, version
      FROM projects WHERE id = ?1 AND deleted_at IS NULL`).bind(projectId).first<EligibilityRow>();
    if (!row || row.is_demo === 1) return null;
    const reason = eligibilityReason(row);
    return { item: { projectId: row.id, claimable: reason === null, reason }, row };
  }

  async submit(input: {
    project: EligibilityRow;
    claimantUserId: string;
    evidenceFileId: string;
    evidenceReference: string | null;
  }): Promise<ProjectClaimReceipt> {
    const existing = await this.db.prepare(`SELECT id FROM project_claim_requests
      WHERE project_id = ?1 AND claimant_user_id = ?2 AND status = 'pending'`)
      .bind(input.project.id, input.claimantUserId).first<{ id: string }>();
    const now = new Date().toISOString();
    const id = existing?.id ?? crypto.randomUUID();
    if (existing) {
      await this.db.prepare(`UPDATE project_claim_requests
        SET evidence_file_id = ?2, evidence_reference = ?3,
          owner_user_id_snapshot = ?4, project_version_snapshot = ?5, updated_at = ?6
        WHERE id = ?1 AND status = 'pending'`)
        .bind(id, input.evidenceFileId, input.evidenceReference, input.project.owner_user_id, input.project.version, now).run();
    } else {
      await this.db.prepare(`INSERT INTO project_claim_requests
        (id, project_id, claimant_user_id, evidence_file_id, evidence_reference, status,
         owner_user_id_snapshot, project_version_snapshot, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?7, ?8, ?8)`)
        .bind(id, input.project.id, input.claimantUserId, input.evidenceFileId, input.evidenceReference,
          input.project.owner_user_id, input.project.version, now).run();
    }
    return {
      id,
      projectId: input.project.id,
      status: "pending",
      createdAt: existing ? (await this.findReceipt(id))!.createdAt : now,
      updatedAt: now,
      reviewedAt: null,
      transferredAt: null,
      withdrawnAt: null,
    };
  }

  async listMine(claimantUserId: string, projectId?: string): Promise<ProjectClaimReceipt[]> {
    const rows = await this.db.prepare(`SELECT id, project_id, status, created_at, updated_at,
        reviewed_at, transferred_at, withdrawn_at
      FROM project_claim_requests WHERE claimant_user_id = ?1 AND (?2 IS NULL OR project_id = ?2)
      ORDER BY created_at DESC LIMIT 100`).bind(claimantUserId, projectId ?? null).all<ReceiptRow>();
    return rows.results.map(receipt);
  }

  async findReceipt(id: string): Promise<ProjectClaimReceipt | null> {
    const row = await this.db.prepare(`SELECT id, project_id, status, created_at, updated_at,
        reviewed_at, transferred_at, withdrawn_at FROM project_claim_requests WHERE id = ?1`)
      .bind(id).first<ReceiptRow>();
    return row ? receipt(row) : null;
  }

  async findPrivate(id: string): Promise<(ReceiptRow & {
    claimant_user_id: string;
    owner_user_id_snapshot: string;
    project_version_snapshot: number;
  }) | null> {
    return this.db.prepare(`SELECT id, project_id, claimant_user_id, status, owner_user_id_snapshot,
      project_version_snapshot, created_at, updated_at, reviewed_at, transferred_at, withdrawn_at
      FROM project_claim_requests WHERE id = ?1`).bind(id).first();
  }

  async review(input: {
    id: string;
    reviewerUserId: string;
    action: "approve" | "reject";
    privateModeratorNotes: string;
  }): Promise<ProjectClaimReceipt | null> {
    const now = new Date().toISOString();
    const status: ProjectClaimStatus = input.action === "approve" ? "approved" : "rejected";
    const result = await this.db.prepare(`UPDATE project_claim_requests
      SET status = ?2, reviewer_user_id = ?3, private_moderator_notes = ?4,
        reviewed_at = ?5, transferred_at = CASE WHEN ?2 = 'approved' THEN ?5 ELSE NULL END,
        updated_at = ?5
      WHERE id = ?1 AND status = 'pending'`)
      .bind(input.id, status, input.reviewerUserId, input.privateModeratorNotes, now).run();
    if (Number(result.meta.changes) < 1) return null;
    return this.findReceipt(input.id);
  }

  async withdraw(id: string, claimantUserId: string): Promise<ProjectClaimReceipt | null> {
    const now = new Date().toISOString();
    const result = await this.db.prepare(`UPDATE project_claim_requests
      SET status = 'withdrawn', withdrawn_at = ?3, updated_at = ?3
      WHERE id = ?1 AND claimant_user_id = ?2 AND status = 'pending'`)
      .bind(id, claimantUserId, now).run();
    if (Number(result.meta.changes) < 1) return null;
    return this.findReceipt(id);
  }

  async listForReview(status: ProjectClaimStatus = "pending"): Promise<ProjectClaimReviewItem[]> {
    const rows = await this.db.prepare(`SELECT claim.id, claim.project_id, claim.claimant_user_id,
        claim.status, claim.created_at, claim.updated_at, claim.reviewed_at, claim.transferred_at,
        claim.withdrawn_at, claim.evidence_reference, user.name AS claimant_display_name,
        project.name AS project_name, project.slug AS project_slug,
        file.id AS evidence_file_id, file.original_name, file.media_type, file.size_bytes,
        file.status AS file_status, file.visibility AS file_visibility
      FROM project_claim_requests claim
      JOIN "user" user ON user.id = claim.claimant_user_id
      JOIN projects project ON project.id = claim.project_id
      JOIN files file ON file.id = claim.evidence_file_id
      WHERE claim.status = ?1 ORDER BY claim.created_at LIMIT 100`).bind(status).all<Record<string, unknown>>();
    return rows.results.map((row) => ({
      id: String(row.id), projectId: String(row.project_id), claimantUserId: String(row.claimant_user_id),
      claimantDisplayName: String(row.claimant_display_name), projectName: String(row.project_name), projectSlug: String(row.project_slug),
      status: row.status as ProjectClaimStatus, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      reviewedAt: nullable(row.reviewed_at), transferredAt: nullable(row.transferred_at), withdrawnAt: nullable(row.withdrawn_at),
      evidenceReference: nullable(row.evidence_reference),
      evidenceFile: { id: String(row.evidence_file_id), originalName: String(row.original_name), mediaType: String(row.media_type),
        sizeBytes: Number(row.size_bytes), status: String(row.file_status), visibility: String(row.file_visibility),
        contentUrl: `/api/v1/admin/project-claims/${encodeURIComponent(String(row.id))}/evidence` },
    }));
  }
}

function eligibilityReason(row: EligibilityRow): ProjectClaimEligibilityReason | null {
  if (row.visibility !== "public" || row.status !== "published") return "not_public";
  if (row.organization_id) return "organization_owned";
  if (row.owner_user_id !== IMPORTER_USER_ID) return "not_importer_owned";
  if (row.project_kind === "commercial_showcase") return "commercial_project";
  if (!row.repository_url?.trim()) return "repository_missing";
  const license = row.license_spdx?.trim().toLocaleLowerCase("en-US");
  if (!license || CLOSED_LICENSES.has(license)) return "open_source_license_missing";
  return null;
}

function receipt(row: ReceiptRow): ProjectClaimReceipt {
  return { id: row.id, projectId: row.project_id, status: row.status, createdAt: row.created_at,
    updatedAt: row.updated_at, reviewedAt: row.reviewed_at, transferredAt: row.transferred_at, withdrawnAt: row.withdrawn_at };
}

function nullable(value: unknown): string | null {
  return value == null ? null : String(value);
}
