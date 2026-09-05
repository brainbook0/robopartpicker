export type ProjectProposalType = "assembly_step" | "assembly_video" | "integration" | "source" | "identity_correction" | "bom_correction" | "issue_report";
export type ProjectProposalStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type ProjectProposalDto = {
  id: string;
  projectId: string;
  proposalType: ProjectProposalType;
  title: string;
  details: string;
  sourceUrls: string[];
  status: ProjectProposalStatus;
  reviewNote: string | null;
  resultingProjectVersionId: string | null;
  reviewedByUserId?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

type ProposalRow = {
  id: string; project_id: string; author_user_id: string; proposal_type: ProjectProposalType;
  payload_json: string; source_urls_json: string; status: ProjectProposalStatus;
  reviewed_by_user_id: string | null; review_note: string | null; resulting_project_version_id: string | null;
  created_at: string; updated_at: string; reviewed_at: string | null;
};

export class ProjectProposalsRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: { projectId: string; authorUserId: string; proposalType: ProjectProposalType; title: string; details: string; sourceUrls: string[] }): Promise<ProjectProposalDto> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.prepare(`INSERT INTO project_change_proposals
      (id, project_id, author_user_id, proposal_type, payload_json, source_urls_json, rationale, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?8)`)
      .bind(id, input.projectId, input.authorUserId, input.proposalType, JSON.stringify({ title: input.title, details: input.details }), JSON.stringify(input.sourceUrls), input.details, now).run();
    return { id, projectId: input.projectId, proposalType: input.proposalType, title: input.title, details: input.details, sourceUrls: input.sourceUrls, status: "pending", reviewNote: null, resultingProjectVersionId: null, createdAt: now, updatedAt: now, reviewedAt: null };
  }

  async listApproved(projectId: string): Promise<ProjectProposalDto[]> {
    const rows = await this.db.prepare(`SELECT id, project_id, author_user_id, proposal_type, payload_json, source_urls_json, status,
      reviewed_by_user_id, review_note, resulting_project_version_id, created_at, updated_at, reviewed_at
      FROM project_change_proposals WHERE project_id = ?1 AND status = 'approved' ORDER BY reviewed_at DESC, created_at DESC LIMIT 100`)
      .bind(projectId).all<ProposalRow>();
    return rows.results.map((row) => mapRow(row, false));
  }

  async listPending(projectId: string): Promise<ProjectProposalDto[]> {
    const rows = await this.db.prepare(`SELECT id, project_id, author_user_id, proposal_type, payload_json, source_urls_json, status,
      reviewed_by_user_id, review_note, resulting_project_version_id, created_at, updated_at, reviewed_at
      FROM project_change_proposals WHERE project_id = ?1 AND status = 'pending' ORDER BY created_at ASC LIMIT 100`)
      .bind(projectId).all<ProposalRow>();
    return rows.results.map((row) => mapRow(row, false));
  }

  async find(id: string, projectId: string): Promise<(ProjectProposalDto & { authorUserId: string }) | null> {
    const row = await this.db.prepare(`SELECT id, project_id, author_user_id, proposal_type, payload_json, source_urls_json, status,
      reviewed_by_user_id, review_note, resulting_project_version_id, created_at, updated_at, reviewed_at
      FROM project_change_proposals WHERE id = ?1 AND project_id = ?2`).bind(id, projectId).first<ProposalRow>();
    if (!row) return null;
    return { ...mapRow(row, true), authorUserId: row.author_user_id };
  }

  async review(input: { id: string; projectId: string; reviewerUserId: string; status: "approved" | "rejected"; reviewNote: string; resultingProjectVersionId: string | null }): Promise<ProjectProposalDto | null> {
    const now = new Date().toISOString();
    const updated = await this.db.prepare(`UPDATE project_change_proposals SET status = ?3, reviewed_by_user_id = ?4,
      review_note = ?5, resulting_project_version_id = ?6, reviewed_at = ?7, updated_at = ?7
      WHERE id = ?1 AND project_id = ?2 AND status = 'pending'`)
      .bind(input.id, input.projectId, input.status, input.reviewerUserId, input.reviewNote, input.resultingProjectVersionId, now).run();
    if (Number(updated.meta.changes) !== 1) return null;
    const item = await this.find(input.id, input.projectId);
    return item ? stripPrivate(item) : null;
  }

  async withdraw(id: string, projectId: string, authorUserId: string): Promise<ProjectProposalDto | null> {
    const now = new Date().toISOString();
    const updated = await this.db.prepare(`UPDATE project_change_proposals SET status = 'withdrawn', updated_at = ?4
      WHERE id = ?1 AND project_id = ?2 AND author_user_id = ?3 AND status = 'pending'`)
      .bind(id, projectId, authorUserId, now).run();
    if (Number(updated.meta.changes) !== 1) return null;
    const item = await this.find(id, projectId);
    return item ? stripPrivate(item) : null;
  }
}

function mapRow(row: ProposalRow, includeReviewer: boolean): ProjectProposalDto {
  const payload = parseObject(row.payload_json);
  return {
    id: row.id,
    projectId: row.project_id,
    proposalType: row.proposal_type,
    title: typeof payload.title === "string" ? payload.title : "Technical proposal",
    details: typeof payload.details === "string" ? payload.details : "",
    sourceUrls: parseStrings(row.source_urls_json),
    status: row.status,
    reviewNote: row.review_note,
    resultingProjectVersionId: row.resulting_project_version_id,
    ...(includeReviewer && row.reviewed_by_user_id ? { reviewedByUserId: row.reviewed_by_user_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
  };
}
function stripPrivate(item: ProjectProposalDto & { authorUserId: string }): ProjectProposalDto { const { authorUserId: _author, ...publicItem } = item; return publicItem; }
function parseObject(value: string): Record<string, unknown> { try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; } }
function parseStrings(value: string): string[] { try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; } }
