import { supabase } from "@/integrations/supabase/client";
import { partById } from "@/data/parts";
import { listingById } from "@/data/listings";
import { suppliers } from "@/data/suppliers";
import type { TablesInsert } from "@/integrations/supabase/types";

export type ForumThreadInsert = TablesInsert<"forum_threads">;

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
  user_id: string;
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
  const { data, error } = await supabase
    .from("forum_categories")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []) as ForumCategory[];
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
  let q = supabase.from("forum_threads").select("*");
  if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts.threadType) q = q.eq("thread_type", opts.threadType);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.tag) q = q.contains("tags", [opts.tag]);
  if (opts.relatedType) q = q.eq("related_entity_type", opts.relatedType);
  if (opts.relatedId) q = q.eq("related_entity_id", opts.relatedId);
  if (opts.search && opts.search.trim()) {
    const s = opts.search.trim().replace(/[,%()]/g, " ");
    q = q.or(`title.ilike.%${s}%,body.ilike.%${s}%`);
  }
  switch (opts.sort) {
    case "top":
      q = q.order("reaction_count", { ascending: false }).order("reply_count", { ascending: false });
      break;
    case "active":
      q = q.order("reply_count", { ascending: false }).order("last_activity_at", { ascending: false });
      break;
    case "unanswered":
      q = q.eq("thread_type", "question").eq("status", "open").order("last_activity_at", { ascending: false });
      break;
    case "solved":
      q = q.eq("status", "solved").order("last_activity_at", { ascending: false });
      break;
    case "recent":
    default:
      q = q.order("pinned", { ascending: false }).order("last_activity_at", { ascending: false });
  }
  if (opts.limit) q = q.limit(opts.limit);
  const { data: threads, error } = await q;
  if (error) throw error;
  const t = (threads ?? []) as ForumThreadRow[];
  if (!t.length) return [];
  const [{ data: profiles }, { data: cats }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, username, avatar_url").in("id", Array.from(new Set(t.map(x => x.user_id)))),
    supabase.from("forum_categories").select("*").in("id", Array.from(new Set(t.map(x => x.category_id)))),
  ]);
  const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p as ProfileMini]));
  const cMap = new Map((cats ?? []).map((c: any) => [c.id, c as ForumCategory]));
  return t.map(x => ({ ...x, author: pMap.get(x.user_id) ?? null, category: cMap.get(x.category_id) ?? null }));
}

export type ForumPost = {
  id: string;
  thread_id: string;
  user_id: string;
  body: string;
  parent_id: string | null;
  reaction_count: number;
  created_at: string;
  edited_at: string | null;
  author: ProfileMini | null;
};

export async function getThread(id: string) {
  const { data, error } = await supabase.from("forum_threads").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ForumThreadRow | null;
}

export async function getThreadPosts(threadId: string): Promise<ForumPost[]> {
  const { data, error } = await supabase
    .from("forum_posts")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const posts = (data ?? []) as Omit<ForumPost, "author">[];
  if (!posts.length) return [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .in("id", Array.from(new Set(posts.map(p => p.user_id))));
  const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p as ProfileMini]));
  return posts.map(p => ({ ...p, author: pMap.get(p.user_id) ?? null }));
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
  if (kind === "component") {
    const p = partById(id);
    return p
      ? { kind, ok: true, label: p.name, sub: `${p.maker} · ${p.category}`, href: `/parts/${p.category}/${p.slug}` }
      : { kind, ok: false, label: `Component ${id} (unavailable)`, href: null };
  }
  if (kind === "marketplace_listing") {
    const l = listingById(id);
    return l
      ? { kind, ok: true, label: l.title, sub: `Grade ${l.grade} · $${l.price.toLocaleString()}`, href: `/marketplace/${l.id}` }
      : { kind, ok: false, label: `Listing ${id} (unavailable)`, href: null };
  }
  if (kind === "project") {
    const { data } = await supabase
      .from("projects")
      .select("slug, name, version")
      .eq("id", id)
      .maybeSingle();
    return data
      ? { kind, ok: true, label: data.name, sub: `v${data.version}`, href: `/projects/${data.slug}` }
      : { kind, ok: false, label: "Project (unavailable)", href: null };
  }
  if (kind === "build") {
    const { data } = await supabase.from("builds").select("slug, name, user_id").eq("id", id).maybeSingle();
    return data
      ? { kind, ok: true, label: data.name, href: `/builder?build=${data.slug}` }
      : { kind, ok: false, label: "Build (unavailable)", href: null };
  }
  if (kind === "supplier") {
    const s = suppliers.find(x => x.id === id || x.slug === id);
    return s
      ? { kind, ok: true, label: s.name, sub: `${s.region} · ${s.categories.join(", ")}`, href: `/suppliers/${s.slug}` }
      : { kind, ok: false, label: `Supplier ${id} (unavailable)`, href: null };
  }
  return null;
}

export async function resolveManyRelated(items: Array<{ kind: RelatedEntityType | null; id: string | null }>): Promise<Array<ResolvedRelated | null>> {
  return Promise.all(items.map(i => resolveRelated(i.kind, i.id)));
}

// ---------- Thread actions ----------
export async function updateThreadStatus(threadId: string, status: ThreadStatus) {
  const { error } = await supabase.from("forum_threads").update({ status }).eq("id", threadId);
  if (error) throw error;
}

export async function setAcceptedAnswer(threadId: string, postId: string | null) {
  // Uses SECURITY DEFINER RPC to enforce owner-only, belongs-to-thread, and
  // question-only checks. `_post_id` defaults to NULL in Postgres, and the
  // generated Supabase types make it optional/nullable — no cast needed.
  const { error } = await supabase.rpc("set_accepted_answer", {
    _thread_id: threadId,
    _post_id: postId ?? undefined,
  });
  if (error) throw error;
}

// ---------- Contributor stats ----------
export type ContributorStats = { threads: number; replies: number; reactions: number; accepted: number };

export async function contributorStatsFor(userIds: string[]): Promise<Map<string, ContributorStats>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const out = new Map<string, ContributorStats>();
  if (!ids.length) return out;
  for (const id of ids) out.set(id, { threads: 0, replies: 0, reactions: 0, accepted: 0 });
  const [threadsRes, postsRes, acceptedRes] = await Promise.all([
    supabase.from("forum_threads").select("user_id, id").in("user_id", ids),
    supabase.from("forum_posts").select("user_id, id, reaction_count").in("user_id", ids),
    supabase.from("forum_threads").select("accepted_post_id").not("accepted_post_id", "is", null),
  ]);
  (threadsRes.data ?? []).forEach((r: any) => {
    const s = out.get(r.user_id); if (s) s.threads++;
  });
  const postIdToOwner = new Map<string, string>();
  (postsRes.data ?? []).forEach((r: any) => {
    const s = out.get(r.user_id);
    if (s) { s.replies++; s.reactions += r.reaction_count ?? 0; }
    postIdToOwner.set(r.id, r.user_id);
  });
  (acceptedRes.data ?? []).forEach((r: any) => {
    const owner = postIdToOwner.get(r.accepted_post_id);
    if (owner && out.has(owner)) out.get(owner)!.accepted++;
  });
  return out;
}