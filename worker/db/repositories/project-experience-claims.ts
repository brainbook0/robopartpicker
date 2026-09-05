export type ExperienceClaimType = "owner" | "operator" | "manufacturer_representative";
export type ExperienceClaimStatus = "pending" | "verified" | "rejected" | "revoked";

export type ExperienceClaimReceipt = { id: string; projectId: string; claimType: ExperienceClaimType; status: ExperienceClaimStatus; createdAt: string; updatedAt: string };
export type ExperienceBadgeDto = { badgeType: ExperienceClaimType; verifiedAt: string; displayName: string };

type ClaimRow = {
  id: string; project_id: string; user_id: string; claim_type: ExperienceClaimType; status: ExperienceClaimStatus;
  created_at: string; updated_at: string; verified_at: string | null;
};

export class ProjectExperienceClaimsRepository {
  constructor(private readonly db: D1Database) {}

  async submit(input: { projectId: string; userId: string; claimType: ExperienceClaimType; evidenceFileId: string; evidenceReference: string | null }): Promise<ExperienceClaimReceipt> {
    const existing = await this.db.prepare("SELECT id FROM project_experience_claims WHERE project_id = ?1 AND user_id = ?2 AND claim_type = ?3")
      .bind(input.projectId, input.userId, input.claimType).first<{ id: string }>();
    const id = existing?.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.prepare(`INSERT INTO project_experience_claims
      (id, project_id, user_id, claim_type, evidence_file_id, evidence_reference, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?7)
      ON CONFLICT(project_id, user_id, claim_type) DO UPDATE SET
        evidence_file_id = excluded.evidence_file_id, evidence_reference = excluded.evidence_reference,
        status = 'pending', reviewer_user_id = NULL, private_moderator_notes = NULL, updated_at = excluded.updated_at,
        reviewed_at = NULL, verified_at = NULL, revoked_at = NULL`)
      .bind(id, input.projectId, input.userId, input.claimType, input.evidenceFileId, input.evidenceReference, now).run();
    return { id, projectId: input.projectId, claimType: input.claimType, status: "pending", createdAt: now, updatedAt: now };
  }

  async listBadges(projectId: string): Promise<ExperienceBadgeDto[]> {
    const rows = await this.db.prepare(`SELECT claim.claim_type, claim.verified_at, u.name AS display_name
      FROM project_experience_claims claim JOIN "user" u ON u.id = claim.user_id
      WHERE claim.project_id = ?1 AND claim.status = 'verified' ORDER BY claim.verified_at, claim.claim_type`)
      .bind(projectId).all<{ claim_type: ExperienceClaimType; verified_at: string; display_name: string }>();
    return rows.results.map((row) => ({ badgeType: row.claim_type, verifiedAt: row.verified_at, displayName: row.display_name }));
  }

  async findPrivate(id: string): Promise<ClaimRow | null> {
    return this.db.prepare(`SELECT id, project_id, user_id, claim_type, status, created_at, updated_at, verified_at
      FROM project_experience_claims WHERE id = ?1`).bind(id).first<ClaimRow>();
  }

  async review(input: { id: string; reviewerUserId: string; status: "verified" | "rejected" | "revoked"; privateModeratorNotes: string }): Promise<ExperienceClaimReceipt | null> {
    const existing = await this.findPrivate(input.id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const verifiedAt = input.status === "verified" ? now : null;
    const revokedAt = input.status === "revoked" ? now : null;
    const updated = await this.db.prepare(`UPDATE project_experience_claims SET status = ?2, reviewer_user_id = ?3,
      private_moderator_notes = ?4, reviewed_at = ?5, verified_at = ?6, revoked_at = ?7, updated_at = ?5
      WHERE id = ?1 AND status IN ('pending', 'verified')`)
      .bind(input.id, input.status, input.reviewerUserId, input.privateModeratorNotes, now, verifiedAt, revokedAt).run();
    if (Number(updated.meta.changes) !== 1) return null;
    return { id: existing.id, projectId: existing.project_id, claimType: existing.claim_type, status: input.status, createdAt: existing.created_at, updatedAt: now };
  }
}
