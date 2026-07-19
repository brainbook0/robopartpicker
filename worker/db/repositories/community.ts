import { AppError } from "../../http";

export type ThreadType = "question" | "discussion" | "build_log" | "integration_report" | "substitution_report" | "bom_correction" | "supplier_report" | "teardown" | "project_update" | "measured_test";
export type ThreadStatus = "open" | "solved" | "closed";
export type RelatedEntityType = "project" | "component" | "marketplace_listing" | "build" | "supplier";

export type CommunityThread = {
  id: string;
  category_id: string;
  user_id: string | null;
  title: string;
  slug: string;
  body: string;
  tags: string[];
  pinned: boolean;
  locked: boolean;
  view_count: number;
  reply_count: number;
  reaction_count: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  thread_type: ThreadType;
  status: ThreadStatus;
  related_entity_type: RelatedEntityType | null;
  related_entity_id: string | null;
  accepted_post_id: string | null;
  structured_data: Record<string, unknown>;
  linked_entity_label: string | null;
  linked_entity_path: string | null;
  author: ProfileMini | null;
  category: ForumCategory | null;
};

export type ForumCategory = { id: string; slug: string; name: string; description: string | null; color: string; icon: string | null; sort_order: number };
export type ProfileMini = { id: string; display_name: string | null; username: string | null; avatar_url: string | null };
export type CommunityPost = {
  id: string; thread_id: string; user_id: string | null; body: string; parent_id: string | null;
  reaction_count: number; created_at: string; edited_at: string | null; author: ProfileMini | null;
};

type ThreadQueryRow = Omit<CommunityThread, "tags" | "structured_data" | "pinned" | "locked" | "author" | "category"> & {
  tags_json: string; structured_data_json: string; pinned: number; locked: number;
  author_id: string | null; author_display_name: string | null; author_username: string | null; author_avatar_url: string | null;
  category_slug: string | null; category_name: string | null; category_description: string | null; category_color: string | null; category_icon: string | null; category_sort_order: number | null;
};

const THREAD_SELECT = `SELECT t.*, p.id AS author_id, p.display_name AS author_display_name,
  p.username AS author_username, p.avatar_url AS author_avatar_url,
  c.slug AS category_slug, c.name AS category_name, c.description AS category_description,
  c.color AS category_color, c.icon AS category_icon, c.sort_order AS category_sort_order
  FROM forum_threads t LEFT JOIN profiles p ON p.id = t.user_id
  LEFT JOIN forum_categories c ON c.id = t.category_id`;

export class CommunityRepository {
  constructor(private readonly db: D1Database) {}

  async categories(): Promise<ForumCategory[]> {
    const rows = await this.db.prepare(`SELECT id, slug, name, description, color, icon, sort_order
      FROM forum_categories ORDER BY sort_order, name COLLATE NOCASE`).all<ForumCategory>();
    return rows.results;
  }

  async listThreads(options: {
    categoryId?: string; search?: string; threadType?: ThreadType; status?: ThreadStatus; tag?: string;
    relatedType?: RelatedEntityType; relatedId?: string; sort?: string; limit: number; offset: number;
  }): Promise<{ items: CommunityThread[]; total: number }> {
    const clauses = ["1 = 1"];
    const values: unknown[] = [];
    const bind = (value: unknown) => { values.push(value); return `?${values.length}`; };
    if (options.categoryId) clauses.push(`t.category_id = ${bind(options.categoryId)}`);
    if (options.threadType) clauses.push(`t.thread_type = ${bind(options.threadType)}`);
    if (options.status) clauses.push(`t.status = ${bind(options.status)}`);
    if (options.relatedType) clauses.push(`t.related_entity_type = ${bind(options.relatedType)}`);
    if (options.relatedId) clauses.push(`t.related_entity_id = ${bind(options.relatedId)}`);
    if (options.tag) clauses.push(`EXISTS (SELECT 1 FROM json_each(t.tags_json) WHERE value = ${bind(options.tag)})`);
    if (options.search) {
      const term = bind(`%${options.search.toLowerCase()}%`);
      clauses.push(`(lower(t.title) LIKE ${term} OR lower(t.body) LIKE ${term})`);
    }
    if (options.sort === "unanswered") clauses.push("t.thread_type = 'question' AND t.status = 'open'");
    if (options.sort === "solved") clauses.push("t.status = 'solved'");
    const where = `WHERE ${clauses.join(" AND ")}`;
    const order = options.sort === "top" ? "t.reaction_count DESC, t.reply_count DESC, t.last_activity_at DESC"
      : options.sort === "active" ? "t.reply_count DESC, t.last_activity_at DESC"
        : "t.pinned DESC, t.last_activity_at DESC";
    const count = await this.db.prepare(`SELECT COUNT(*) AS total FROM forum_threads t ${where}`).bind(...values).first<{ total: number }>();
    const rows = await this.db.prepare(`${THREAD_SELECT} ${where} ORDER BY ${order} LIMIT ?${values.length + 1} OFFSET ?${values.length + 2}`)
      .bind(...values, options.limit, options.offset).all<ThreadQueryRow>();
    return { items: rows.results.map(mapThread), total: Number(count?.total ?? 0) };
  }

  async findThread(id: string): Promise<CommunityThread | null> {
    const row = await this.db.prepare(`${THREAD_SELECT} WHERE t.id = ?1 OR t.slug = ?1`).bind(id).first<ThreadQueryRow>();
    return row ? mapThread(row) : null;
  }

  async createThread(userId: string, input: {
    categoryId: string; title: string; slug: string; body: string; tags: string[]; threadType: ThreadType;
    relatedEntityType?: RelatedEntityType | null; relatedEntityId?: string | null; linkedEntityLabel?: string | null;
    linkedEntityPath?: string | null; structuredData: Record<string, unknown>;
  }): Promise<CommunityThread> {
    const category = await this.db.prepare("SELECT id FROM forum_categories WHERE id = ?1").bind(input.categoryId).first();
    if (!category) throw new AppError(422, "CATEGORY_NOT_FOUND", "Forum category not found.");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await this.db.prepare(`INSERT INTO forum_threads
        (id, category_id, user_id, title, slug, body, thread_type, status, tags_json, structured_data_json,
         related_entity_type, related_entity_id, linked_entity_label, linked_entity_path, last_activity_at, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14, ?14)`)
        .bind(id, input.categoryId, userId, input.title, input.slug, input.body, input.threadType, JSON.stringify(input.tags),
          JSON.stringify(input.structuredData), input.relatedEntityType ?? null, input.relatedEntityId ?? null,
          input.linkedEntityLabel ?? null, input.linkedEntityPath ?? null, now).run();
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new AppError(409, "THREAD_SLUG_CONFLICT", "A thread with that URL already exists.");
      throw error;
    }
    return (await this.findThread(id))!;
  }

  async posts(threadId: string): Promise<CommunityPost[]> {
    type PostRow = Omit<CommunityPost, "author"> & { author_id: string | null; display_name: string | null; username: string | null; avatar_url: string | null };
    const rows = await this.db.prepare(`SELECT fp.id, fp.thread_id, fp.user_id, fp.parent_id,
      CASE WHEN fp.deleted_at IS NULL THEN fp.body ELSE '[deleted]' END AS body,
      fp.reaction_count, fp.created_at, fp.edited_at,
      p.id AS author_id, p.display_name, p.username, p.avatar_url
      FROM forum_posts fp LEFT JOIN profiles p ON p.id = fp.user_id
      WHERE fp.thread_id = ?1 ORDER BY fp.created_at`).bind(threadId).all<PostRow>();
    return rows.results.map((row) => ({ ...row, author: row.author_id ? { id: row.author_id, display_name: row.display_name, username: row.username, avatar_url: row.avatar_url } : null }));
  }

  async createPost(userId: string, threadId: string, body: string, parentId?: string | null): Promise<CommunityPost> {
    const thread = await this.findThread(threadId);
    if (!thread) throw new AppError(404, "THREAD_NOT_FOUND", "Thread not found.");
    if (thread.locked || thread.status === "closed") throw new AppError(409, "THREAD_CLOSED", "This thread is closed to replies.");
    if (parentId) {
      const parent = await this.db.prepare("SELECT id FROM forum_posts WHERE id = ?1 AND thread_id = ?2 AND deleted_at IS NULL").bind(parentId, thread.id).first();
      if (!parent) throw new AppError(422, "PARENT_POST_INVALID", "The reply anchor does not belong to this thread.");
    }
    const id = crypto.randomUUID();
    await this.db.prepare(`INSERT INTO forum_posts (id, thread_id, user_id, parent_id, body, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(id, thread.id, userId, parentId ?? null, body, new Date().toISOString()).run();
    return (await this.posts(thread.id)).find((post) => post.id === id)!;
  }

  async deletePost(userId: string, postId: string, moderator: boolean): Promise<void> {
    const post = await this.db.prepare(`SELECT fp.id, fp.thread_id, fp.user_id, ft.accepted_post_id
      FROM forum_posts fp JOIN forum_threads ft ON ft.id = fp.thread_id
      WHERE fp.id = ?1 AND fp.deleted_at IS NULL`).bind(postId).first<{ id: string; thread_id: string; user_id: string | null; accepted_post_id: string | null }>();
    if (!post) throw new AppError(404, "POST_NOT_FOUND", "Reply not found.");
    if (post.user_id !== userId && !moderator) throw new AppError(403, "POST_DELETE_DENIED", "You can only delete your own replies.");
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`UPDATE forum_threads SET accepted_post_id = CASE WHEN accepted_post_id = ?1 THEN NULL ELSE accepted_post_id END,
        status = CASE WHEN accepted_post_id = ?1 AND thread_type = 'question' THEN 'open' ELSE status END,
        reply_count = MAX(reply_count - 1, 0), updated_at = ?2 WHERE id = ?3`).bind(postId, now, post.thread_id),
      this.db.prepare(`UPDATE forum_posts SET body = '[deleted]', deleted_at = ?1, edited_at = ?1 WHERE id = ?2`).bind(now, postId),
    ]);
  }

  async setAcceptedAnswer(userId: string, threadId: string, postId: string | null): Promise<void> {
    const thread = await this.db.prepare("SELECT user_id, thread_type FROM forum_threads WHERE id = ?1").bind(threadId)
      .first<{ user_id: string | null; thread_type: ThreadType }>();
    if (!thread || thread.user_id !== userId) throw new AppError(403, "ACCEPTED_ANSWER_DENIED", "Only the question owner can accept a reply.");
    if (thread.thread_type !== "question") throw new AppError(422, "ACCEPTED_ANSWER_QUESTION_REQUIRED", "Accepted answers are only valid on question threads.");
    if (postId) {
      const post = await this.db.prepare("SELECT id FROM forum_posts WHERE id = ?1 AND thread_id = ?2 AND deleted_at IS NULL")
        .bind(postId, threadId).first();
      if (!post) throw new AppError(422, "ACCEPTED_ANSWER_REPLY_INVALID", "The accepted reply must belong to this question.");
    }
    await this.db.prepare(`UPDATE forum_threads SET accepted_post_id = ?1,
      status = CASE WHEN ?1 IS NULL THEN 'open' ELSE 'solved' END, updated_at = ?2 WHERE id = ?3`)
      .bind(postId, new Date().toISOString(), threadId).run();
  }

  async updateStatus(userId: string, threadId: string, status: ThreadStatus, moderator: boolean): Promise<void> {
    const result = await this.db.prepare(`UPDATE forum_threads SET status = ?1, updated_at = ?2
      WHERE id = ?3 AND (?4 = 1 OR user_id = ?5)`).bind(status, new Date().toISOString(), threadId, moderator ? 1 : 0, userId).run();
    if (result.meta.changes !== 1) throw new AppError(403, "THREAD_UPDATE_DENIED", "Only the thread owner or a moderator can change its status.");
  }

  async toggleReaction(userId: string, target: { threadId?: string; postId?: string }, emoji: string): Promise<boolean> {
    const column = target.postId ? "post_id" : "thread_id";
    const id = target.postId ?? target.threadId;
    if (!id) throw new AppError(422, "REACTION_TARGET_REQUIRED", "A reaction target is required.");
    const existing = await this.db.prepare(`SELECT id FROM forum_reactions WHERE user_id = ?1 AND ${column} = ?2 AND emoji = ?3`)
      .bind(userId, id, emoji).first<{ id: string }>();
    if (existing) {
      await this.db.prepare("DELETE FROM forum_reactions WHERE id = ?1").bind(existing.id).run();
      return false;
    }
    await this.db.prepare(`INSERT INTO forum_reactions (id, user_id, emoji, ${column}, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`)
      .bind(crypto.randomUUID(), userId, emoji, id, new Date().toISOString()).run();
    return true;
  }

  async reactions(threadId: string, userId: string | null): Promise<{ counts: Record<string, Record<string, number>>; mine: Record<string, string[]> }> {
    const rows = await this.db.prepare(`SELECT fr.user_id, fr.emoji, fr.thread_id, fr.post_id
      FROM forum_reactions fr WHERE fr.thread_id = ?1 OR fr.post_id IN (SELECT id FROM forum_posts WHERE thread_id = ?1)`)
      .bind(threadId).all<{ user_id: string; emoji: string; thread_id: string | null; post_id: string | null }>();
    const counts: Record<string, Record<string, number>> = {};
    const mine: Record<string, string[]> = {};
    for (const row of rows.results) {
      const target = row.post_id ?? row.thread_id!;
      counts[target] ??= {};
      counts[target][row.emoji] = (counts[target][row.emoji] ?? 0) + 1;
      if (row.user_id === userId) (mine[target] ??= []).push(row.emoji);
    }
    return { counts, mine };
  }

  async contributorStats(userIds: string[]): Promise<Record<string, { threads: number; replies: number; reactions: number; accepted: number }>> {
    const unique = [...new Set(userIds.filter(Boolean))].slice(0, 100);
    const result: Record<string, { threads: number; replies: number; reactions: number; accepted: number }> = {};
    if (!unique.length) return result;
    unique.forEach((id) => { result[id] = { threads: 0, replies: 0, reactions: 0, accepted: 0 }; });
    const placeholders = unique.map((_, index) => `?${index + 1}`).join(", ");
    const [threads, posts, accepted] = await this.db.batch([
      this.db.prepare(`SELECT user_id, COUNT(*) AS count FROM forum_threads WHERE user_id IN (${placeholders}) GROUP BY user_id`).bind(...unique),
      this.db.prepare(`SELECT user_id, COUNT(*) AS count, COALESCE(SUM(reaction_count), 0) AS reactions FROM forum_posts WHERE user_id IN (${placeholders}) GROUP BY user_id`).bind(...unique),
      this.db.prepare(`SELECT p.user_id, COUNT(*) AS count FROM forum_threads t JOIN forum_posts p ON p.id = t.accepted_post_id WHERE p.user_id IN (${placeholders}) GROUP BY p.user_id`).bind(...unique),
    ]);
    for (const row of threads.results as Array<{ user_id: string; count: number }>) result[row.user_id].threads = Number(row.count);
    for (const row of posts.results as Array<{ user_id: string; count: number; reactions: number }>) { result[row.user_id].replies = Number(row.count); result[row.user_id].reactions = Number(row.reactions); }
    for (const row of accepted.results as Array<{ user_id: string; count: number }>) result[row.user_id].accepted = Number(row.count);
    return result;
  }
}

function mapThread(row: ThreadQueryRow): CommunityThread {
  return {
    ...row,
    pinned: row.pinned === 1,
    locked: row.locked === 1,
    tags: JSON.parse(row.tags_json) as string[],
    structured_data: JSON.parse(row.structured_data_json) as Record<string, unknown>,
    author: row.author_id ? { id: row.author_id, display_name: row.author_display_name, username: row.author_username, avatar_url: row.author_avatar_url } : null,
    category: row.category_slug ? { id: row.category_id, slug: row.category_slug, name: row.category_name!, description: row.category_description, color: row.category_color!, icon: row.category_icon, sort_order: row.category_sort_order! } : null,
  };
}
