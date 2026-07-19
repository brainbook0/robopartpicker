import { api } from "@/lib/api/client";

export type ForumThreadInsert = {
  user_id?: string;
  category_id: string;
  title: string;
  slug: string;
  body: string;
  tags: string[];
  thread_type: ThreadType;
  status?: ThreadStatus;
  related_entity_type?: RelatedEntityType | null;
  related_entity_id?: string | null;
  linked_entity_label?: string | null;
  linked_entity_path?: string | null;
  structured_data: Record<string, unknown>;
};

export const THREAD_TYPES = [
  "question",
  "discussion",
  "build_log",
  "integration_report",
  "substitution_report",
  "bom_correction",
  "supplier_report",
  "teardown",
  "project_update",
  "measured_test",
] as const;
export type ThreadType = typeof THREAD_TYPES[number];

export const threadTypeLabel: Record<ThreadType, string> = {
  question: "Question",
  discussion: "Discussion",
  build_log: "Build log",
  integration_report: "Integration report",
  substitution_report: "Substitution report",
  bom_correction: "BOM correction",
  supplier_report: "Supplier report",
  teardown: "Teardown",
  project_update: "Project update",
  measured_test: "Measured test",
};

export const threadTypeHint: Record<ThreadType, string> = {
  question: "Objective, current setup, observed behavior, attempts, evidence, precise question.",
  discussion: "Open-ended topic — state your context and what you'd like to hear.",
  build_log: "A checkpoint on an in-progress build with measurements and next step.",
  integration_report: "How two or more components performed together in a real setup.",
  substitution_report: "One component swapped for another in a specific project — fit, function, side effects.",
  bom_correction: "A proposed correction to a published project BOM with evidence.",
  supplier_report: "First-person supplier experience — individual report, not adjudicated.",
  teardown: "Observations from disassembly with evidence quality and uncertainty.",
  project_update: "Notable changes to a published project — migration and compatibility notes.",
  measured_test: "A repeatable measurement of a component or subsystem, with method and instruments.",
};

export const THREAD_STATUSES = ["open", "solved", "closed"] as const;
export type ThreadStatus = typeof THREAD_STATUSES[number];

export const RELATED_ENTITY_TYPES = [
  "project",
  "component",
  "marketplace_listing",
  "build",
  "supplier",
] as const;
export type RelatedEntityType = typeof RELATED_ENTITY_TYPES[number];

export const relatedEntityLabel: Record<RelatedEntityType, string> = {
  project: "Project",
  component: "Component",
  marketplace_listing: "Marketplace listing",
  build: "Build",
  supplier: "Supplier",
};

export type ForumCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  sort_order: number;
};

export type ForumThreadRow = {
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
};

export type ProfileMini = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export type ThreadWithMeta = ForumThreadRow & {
  author: ProfileMini | null;
  category: ForumCategory | null;
};

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "thread";

// Accept only internal application paths — must start with exactly one "/",
// contain no control characters, backslashes, protocol-relative "//" prefix,
// or external schemes (javascript:, data:, mailto:, http:, etc.).
export const isInternalPath = (s: string): boolean => {
  if (typeof s !== "string" || s.length === 0 || s.length > 301) return false;
  if (s[0] !== "/") return false;
  if (s[1] === "/") return false; // protocol-relative
  if (/[\\\x00-\x1F\x7F]/.test(s)) return false; // control chars / backslash
  return /^\/[A-Za-z0-9/_%\-?=&.#]{0,300}$/.test(s);
};

export const normalizeTags = (raw: string, max = 6, perTag = 24): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of raw.split(",")) {
    const t = chunk.trim().replace(/^#/, "").toLowerCase().slice(0, perTag);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
};

export const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 2_592_000) return `${Math.floor(s / 86_400)}d`;
  if (s < 31_536_000) return `${Math.floor(s / 2_592_000)}mo`;
  return `${Math.floor(s / 31_536_000)}y`;
};

export async function listCategories(): Promise<ForumCategory[]> {
  return (await api.get<{ items: ForumCategory[] }>("/api/v1/community/categories")).items;
}

export async function listThreads(opts: {
  categoryId?: string;
  limit?: number;
  sort?: "recent" | "active" | "top" | "unanswered" | "solved";
  search?: string;
  threadType?: ThreadType;
  status?: ThreadStatus;
  tag?: string;
  relatedType?: RelatedEntityType;
  relatedId?: string;
} = {}): Promise<ThreadWithMeta[]> {
  const search = new URLSearchParams();
  if (opts.categoryId) search.set("categoryId", opts.categoryId);
  if (opts.threadType) search.set("threadType", opts.threadType);
  if (opts.status) search.set("status", opts.status);
  if (opts.tag) search.set("tag", opts.tag);
  if (opts.relatedType) search.set("relatedType", opts.relatedType);
  if (opts.relatedId) search.set("relatedId", opts.relatedId);
  if (opts.search?.trim()) search.set("search", opts.search.trim());
  if (opts.sort) search.set("sort", opts.sort);
  search.set("limit", String(opts.limit ?? 50));
  return (await api.get<{ items: ThreadWithMeta[] }>(`/api/v1/community/threads?${search}`)).items;
}

export type ForumPost = {
  id: string;
  thread_id: string;
  user_id: string | null;
  body: string;
  parent_id: string | null;
  reaction_count: number;
  created_at: string;
  edited_at: string | null;
  author: ProfileMini | null;
};

export async function getThread(id: string) {
  try {
    return (await getThreadBundle(id)).item;
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) return null;
    throw error;
  }
}

export async function getThreadPosts(threadId: string): Promise<ForumPost[]> {
  return (await getThreadBundle(threadId)).posts;
}

export type ThreadBundle = {
  item: ThreadWithMeta;
  posts: ForumPost[];
  reactions: { counts: Record<string, Record<string, number>>; mine: Record<string, string[]> };
};

export function getThreadBundle(threadId: string): Promise<ThreadBundle> {
  return api.get<ThreadBundle>(`/api/v1/community/threads/${encodeURIComponent(threadId)}`, { retry: false });
}

export const authorName = (p: ProfileMini | null) =>
  p?.display_name || p?.username || "anon";

export const authorInitials = (p: ProfileMini | null) => {
  const n = authorName(p);
  return n.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
};

// ---------- Related entity resolution ----------
export type ResolvedRelated =
  | { kind: RelatedEntityType; ok: true; label: string; sub?: string; href: string }
  | { kind: RelatedEntityType; ok: false; label: string; href: null };

export async function resolveRelated(
  kind: RelatedEntityType | null,
  id: string | null
): Promise<ResolvedRelated | null> {
  if (!kind || !id) return null;
  return (await api.get<{ item: ResolvedRelated }>(`/api/v1/community/related/${kind}/${encodeURIComponent(id)}`)).item;
}

export async function resolveManyRelated(items: Array<{ kind: RelatedEntityType | null; id: string | null }>): Promise<Array<ResolvedRelated | null>> {
  return Promise.all(items.map(i => resolveRelated(i.kind, i.id)));
}

// ---------- Thread actions ----------
export async function updateThreadStatus(threadId: string, status: ThreadStatus) {
  await api.patch(`/api/v1/community/threads/${encodeURIComponent(threadId)}/status`, { status });
}

export async function setAcceptedAnswer(threadId: string, postId: string | null) {
  await api.put(`/api/v1/community/threads/${encodeURIComponent(threadId)}/accepted-answer`, { postId });
}

export async function createThread(input: ForumThreadInsert): Promise<ThreadWithMeta> {
  return (await api.post<{ item: ThreadWithMeta }>("/api/v1/community/threads", {
    categoryId: input.category_id,
    title: input.title,
    slug: input.slug,
    body: input.body,
    tags: input.tags,
    threadType: input.thread_type,
    relatedEntityType: input.related_entity_type ?? null,
    relatedEntityId: input.related_entity_id ?? null,
    linkedEntityLabel: input.linked_entity_label ?? null,
    linkedEntityPath: input.linked_entity_path ?? null,
    structuredData: input.structured_data,
  })).item;
}

export async function createThreadPost(threadId: string, body: string, parentId?: string | null): Promise<ForumPost> {
  return (await api.post<{ item: ForumPost }>(`/api/v1/community/threads/${encodeURIComponent(threadId)}/posts`, { body, parentId: parentId ?? null })).item;
}

export function deleteThreadPost(postId: string): Promise<void> {
  return api.delete(`/api/v1/community/posts/${encodeURIComponent(postId)}`);
}

export async function toggleThreadReaction(target: { threadId?: string; postId?: string }, emoji: string): Promise<boolean> {
  return (await api.post<{ active: boolean }>("/api/v1/community/reactions/toggle", { ...target, emoji })).active;
}

export async function getCommunityBookmarks(): Promise<string[]> {
  return (await api.get<{ threadIds: string[] }>("/api/v1/community/bookmarks", { retry: false })).threadIds;
}

export async function setCommunityBookmark(threadId: string, active: boolean): Promise<void> {
  if (active) await api.put(`/api/v1/community/bookmarks/${encodeURIComponent(threadId)}`);
  else await api.delete(`/api/v1/community/bookmarks/${encodeURIComponent(threadId)}`);
}

// ---------- Contributor stats ----------
export type ContributorStats = { threads: number; replies: number; reactions: number; accepted: number };

export async function contributorStatsFor(userIds: string[]): Promise<Map<string, ContributorStats>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return new Map();
  const response = await api.post<{ stats: Record<string, ContributorStats> }>("/api/v1/community/contributor-stats", { userIds: ids });
  return new Map(Object.entries(response.stats));
}
