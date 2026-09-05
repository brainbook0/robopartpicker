export type ProjectReviewInput = {
  overallRating: number;
  reliabilityRating: number | null;
  usabilityRating: number | null;
  valueRating: number | null;
  supportRating: number | null;
  relationship: "owner" | "operator" | "evaluator" | "observer";
  title: string;
  body: string;
};

export type ProjectReviewDto = ProjectReviewInput & {
  id: string;
  projectId: string;
  authorName: string;
  experienceBadges: Array<{ badgeType: string; verifiedAt: string }>;
  moderationStatus: "published" | "under_review" | "removed";
  version: number;
  editCount: number;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
};

export type ProjectReviewAggregate = {
  count: number;
  overallAverage: number | null;
  reliabilityAverage: number | null;
  usabilityAverage: number | null;
  valueAverage: number | null;
  supportAverage: number | null;
};

type ReviewRow = {
  id: string; project_id: string; user_id: string; author_name: string;
  overall_rating: number; reliability_rating: number | null; usability_rating: number | null;
  value_rating: number | null; support_rating: number | null; relationship: ProjectReviewInput["relationship"];
  title: string; body: string; moderation_status: ProjectReviewDto["moderationStatus"];
  version: number; edit_count: number; created_at: string; updated_at: string; edited_at: string | null;
};

export class ProjectReviewsRepository {
  constructor(private readonly db: D1Database) {}

  async upsert(projectId: string, userId: string, input: ProjectReviewInput): Promise<ProjectReviewDto> {
    const existing = await this.db.prepare(`SELECT pr.*, u.name AS author_name FROM project_reviews pr JOIN "user" u ON u.id = pr.user_id
      WHERE pr.project_id = ?1 AND pr.user_id = ?2`).bind(projectId, userId).first<ReviewRow>();
    const now = new Date().toISOString();
    if (!existing) {
      const id = crypto.randomUUID();
      await this.db.prepare(`INSERT INTO project_reviews
        (id, project_id, user_id, overall_rating, reliability_rating, usability_rating, value_rating, support_rating,
         relationship, title, body, moderation_status, version, edit_count, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'published', 1, 0, ?12, ?12)`)
        .bind(id, projectId, userId, input.overallRating, input.reliabilityRating, input.usabilityRating, input.valueRating,
          input.supportRating, input.relationship, input.title, input.body, now).run();
      return (await this.getById(id))!;
    }

    const nextVersion = existing.version + 1;
    const [revision, updated] = await this.db.batch([
      this.db.prepare(`INSERT INTO project_review_revisions (id, review_id, editor_user_id, review_version, snapshot_json, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(crypto.randomUUID(), existing.id, userId, existing.version, JSON.stringify(snapshot(existing)), now),
      this.db.prepare(`UPDATE project_reviews SET overall_rating = ?2, reliability_rating = ?3, usability_rating = ?4,
        value_rating = ?5, support_rating = ?6, relationship = ?7, title = ?8, body = ?9,
        moderation_status = 'published', version = ?10, edit_count = edit_count + 1, updated_at = ?11, edited_at = ?11,
        removed_at = NULL WHERE id = ?1 AND user_id = ?12 AND version = ?13`)
        .bind(existing.id, input.overallRating, input.reliabilityRating, input.usabilityRating, input.valueRating,
          input.supportRating, input.relationship, input.title, input.body, nextVersion, now, userId, existing.version),
    ]);
    if (Number(revision.meta.changes) !== 1 || Number(updated.meta.changes) !== 1) throw new Error("PROJECT_REVIEW_VERSION_CONFLICT");
    return (await this.getById(existing.id))!;
  }

  async listPublished(projectId: string): Promise<{ items: ProjectReviewDto[]; aggregate: ProjectReviewAggregate }> {
    const [reviewResult, aggregateResult, badgeResult] = await this.db.batch([
      this.db.prepare(`SELECT pr.*, u.name AS author_name FROM project_reviews pr JOIN "user" u ON u.id = pr.user_id
        WHERE pr.project_id = ?1 AND pr.moderation_status = 'published' ORDER BY pr.updated_at DESC LIMIT 200`).bind(projectId),
      this.db.prepare(`SELECT COUNT(*) AS count, AVG(overall_rating) AS overall_average,
        AVG(reliability_rating) AS reliability_average, AVG(usability_rating) AS usability_average,
        AVG(value_rating) AS value_average, AVG(support_rating) AS support_average
        FROM project_reviews WHERE project_id = ?1 AND moderation_status = 'published'`).bind(projectId),
      this.db.prepare(`SELECT user_id, claim_type, verified_at FROM project_experience_claims
        WHERE project_id = ?1 AND status = 'verified' ORDER BY verified_at`).bind(projectId),
    ]);
    const badges = new Map<string, Array<{ badgeType: string; verifiedAt: string }>>();
    for (const row of badgeResult.results as Array<{ user_id: string; claim_type: string; verified_at: string }>) {
      const values = badges.get(row.user_id) ?? [];
      values.push({ badgeType: row.claim_type, verifiedAt: row.verified_at });
      badges.set(row.user_id, values);
    }
    const items = (reviewResult.results as unknown as ReviewRow[]).map((row) => mapReview(row, badges.get(row.user_id) ?? []));
    const aggregateRow = aggregateResult.results[0] as Record<string, unknown> | undefined;
    return { items, aggregate: mapAggregate(aggregateRow) };
  }

  private async getById(id: string): Promise<ProjectReviewDto | null> {
    const row = await this.db.prepare(`SELECT pr.*, u.name AS author_name FROM project_reviews pr JOIN "user" u ON u.id = pr.user_id WHERE pr.id = ?1`)
      .bind(id).first<ReviewRow>();
    if (!row) return null;
    const badges = await this.db.prepare(`SELECT claim_type, verified_at FROM project_experience_claims WHERE project_id = ?1 AND user_id = ?2 AND status = 'verified' ORDER BY verified_at`)
      .bind(row.project_id, row.user_id).all<{ claim_type: string; verified_at: string }>();
    return mapReview(row, badges.results.map((item) => ({ badgeType: item.claim_type, verifiedAt: item.verified_at })));
  }
}

function mapReview(row: ReviewRow, experienceBadges: ProjectReviewDto["experienceBadges"]): ProjectReviewDto {
  return { id: row.id, projectId: row.project_id, authorName: row.author_name, overallRating: row.overall_rating,
    reliabilityRating: row.reliability_rating, usabilityRating: row.usability_rating, valueRating: row.value_rating,
    supportRating: row.support_rating, relationship: row.relationship, title: row.title, body: row.body,
    experienceBadges, moderationStatus: row.moderation_status, version: row.version, editCount: row.edit_count,
    createdAt: row.created_at, updatedAt: row.updated_at, editedAt: row.edited_at };
}
function mapAggregate(row: Record<string, unknown> | undefined): ProjectReviewAggregate {
  const numberOrNull = (value: unknown) => value == null ? null : Number(value);
  return { count: Number(row?.count ?? 0), overallAverage: numberOrNull(row?.overall_average),
    reliabilityAverage: numberOrNull(row?.reliability_average), usabilityAverage: numberOrNull(row?.usability_average),
    valueAverage: numberOrNull(row?.value_average), supportAverage: numberOrNull(row?.support_average) };
}
function snapshot(row: ReviewRow): Record<string, unknown> {
  return { overallRating: row.overall_rating, reliabilityRating: row.reliability_rating, usabilityRating: row.usability_rating,
    valueRating: row.value_rating, supportRating: row.support_rating, relationship: row.relationship, title: row.title,
    body: row.body, moderationStatus: row.moderation_status, version: row.version, updatedAt: row.updated_at };
}
