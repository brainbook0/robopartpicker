export type ProjectCommentDto = {
  id: string;
  projectId: string;
  parentId: string | null;
  body: string;
  authorName: string;
  experienceBadges: Array<{ badgeType: string; verifiedAt: string }>;
  helpfulCount: number;
  helpfulByMe: boolean;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
};

type CommentRow = {
  id: string; project_id: string; user_id: string; parent_id: string | null; body: string; author_name: string;
  helpful_count: number; created_at: string; updated_at: string; edited_at: string | null; helpful_by_me: number;
};

export class ProjectCommentsRepository {
  constructor(private readonly db: D1Database) {}

  async create(projectId: string, userId: string, body: string, parentId: string | null): Promise<{ item?: ProjectCommentDto; error?: "invalid_parent" | "nested_reply" }> {
    if (parentId) {
      const parent = await this.db.prepare("SELECT project_id, parent_id FROM project_comments WHERE id = ?1 AND deleted_at IS NULL AND moderation_status <> 'removed'")
        .bind(parentId).first<{ project_id: string; parent_id: string | null }>();
      if (!parent || parent.project_id !== projectId) return { error: "invalid_parent" };
      if (parent.parent_id) return { error: "nested_reply" };
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.prepare(`INSERT INTO project_comments (id, project_id, user_id, parent_id, body, moderation_status, helpful_count, version, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, 'published', 0, 1, ?6, ?6)`).bind(id, projectId, userId, parentId, body, now).run();
    return { item: (await this.getById(id, userId))! };
  }

  async listPublished(projectId: string, viewerUserId: string | null): Promise<ProjectCommentDto[]> {
    const [commentResult, badgeResult] = await this.db.batch([
      this.db.prepare(`SELECT pc.id, pc.project_id, pc.user_id, pc.parent_id, pc.body, u.name AS author_name,
        pc.helpful_count, pc.created_at, pc.updated_at, pc.edited_at,
        CASE WHEN EXISTS (SELECT 1 FROM project_comment_reactions reaction WHERE reaction.comment_id = pc.id AND reaction.user_id = ?2) THEN 1 ELSE 0 END AS helpful_by_me
        FROM project_comments pc JOIN "user" u ON u.id = pc.user_id
        WHERE pc.project_id = ?1 AND pc.moderation_status = 'published' AND pc.deleted_at IS NULL
        ORDER BY COALESCE(pc.parent_id, pc.id), CASE WHEN pc.parent_id IS NULL THEN 0 ELSE 1 END, pc.created_at LIMIT 500`).bind(projectId, viewerUserId),
      this.db.prepare(`SELECT user_id, claim_type, verified_at FROM project_experience_claims WHERE project_id = ?1 AND status = 'verified'`).bind(projectId),
    ]);
    const badges = new Map<string, ProjectCommentDto["experienceBadges"]>();
    for (const row of badgeResult.results as Array<{ user_id: string; claim_type: string; verified_at: string }>) {
      const values = badges.get(row.user_id) ?? [];
      values.push({ badgeType: row.claim_type, verifiedAt: row.verified_at });
      badges.set(row.user_id, values);
    }
    return (commentResult.results as unknown as CommentRow[]).map((row) => mapComment(row, badges.get(row.user_id) ?? []));
  }

  async markHelpful(projectId: string, commentId: string, userId: string): Promise<{ helpfulCount: number; helpfulByMe: boolean } | null> {
    const comment = await this.db.prepare("SELECT id FROM project_comments WHERE id = ?1 AND project_id = ?2 AND moderation_status = 'published' AND deleted_at IS NULL")
      .bind(commentId, projectId).first<{ id: string }>();
    if (!comment) return null;
    await this.db.prepare(`INSERT OR IGNORE INTO project_comment_reactions (id, comment_id, user_id, helpful, created_at)
      VALUES (?1, ?2, ?3, 1, ?4)`).bind(crypto.randomUUID(), commentId, userId, new Date().toISOString()).run();
    const result = await this.db.prepare(`SELECT helpful_count, EXISTS (
      SELECT 1 FROM project_comment_reactions WHERE comment_id = ?1 AND user_id = ?2
    ) AS helpful_by_me FROM project_comments WHERE id = ?1`).bind(commentId, userId).first<{ helpful_count: number; helpful_by_me: number }>();
    return result ? { helpfulCount: Number(result.helpful_count), helpfulByMe: result.helpful_by_me === 1 } : null;
  }

  private async getById(id: string, viewerUserId: string): Promise<ProjectCommentDto | null> {
    const row = await this.db.prepare(`SELECT pc.id, pc.project_id, pc.user_id, pc.parent_id, pc.body, u.name AS author_name,
      pc.helpful_count, pc.created_at, pc.updated_at, pc.edited_at, 0 AS helpful_by_me
      FROM project_comments pc JOIN "user" u ON u.id = pc.user_id WHERE pc.id = ?1`).bind(id).first<CommentRow>();
    if (!row) return null;
    void viewerUserId;
    const badges = await this.db.prepare(`SELECT claim_type, verified_at FROM project_experience_claims WHERE project_id = ?1 AND user_id = ?2 AND status = 'verified'`)
      .bind(row.project_id, row.user_id).all<{ claim_type: string; verified_at: string }>();
    return mapComment(row, badges.results.map((item) => ({ badgeType: item.claim_type, verifiedAt: item.verified_at })));
  }
}

function mapComment(row: CommentRow, experienceBadges: ProjectCommentDto["experienceBadges"]): ProjectCommentDto {
  return { id: row.id, projectId: row.project_id, parentId: row.parent_id, body: row.body, authorName: row.author_name,
    experienceBadges, helpfulCount: Number(row.helpful_count), helpfulByMe: row.helpful_by_me === 1,
    createdAt: row.created_at, updatedAt: row.updated_at, editedAt: row.edited_at };
}
