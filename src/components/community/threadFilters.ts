import type { ThreadWithMeta, ThreadType, ThreadStatus } from "@/lib/forum";

export type ThreadSort = "recent" | "newest" | "replies" | "reactions" | "views";
export const THREAD_SORTS: { key: ThreadSort; label: string }[] = [
  { key: "recent", label: "Latest activity" },
  { key: "newest", label: "Newest" },
  { key: "replies", label: "Most replies" },
  { key: "reactions", label: "Most reactions" },
  { key: "views", label: "Most viewed" },
];

export type ThreadFilterOpts = {
  q?: string;
  type?: ThreadType | null;
  status?: ThreadStatus | null;
  tag?: string | null;
  categoryId?: string | null;
  linkedOnly?: boolean;
  unansweredOnly?: boolean;
};

export function filterThreads(all: ThreadWithMeta[], o: ThreadFilterOpts): ThreadWithMeta[] {
  const needle = (o.q ?? "").trim().toLowerCase();
  return all.filter(t => {
    if (o.categoryId && t.category_id !== o.categoryId) return false;
    if (o.type && t.thread_type !== o.type) return false;
    if (o.status && t.status !== o.status) return false;
    if (o.tag && !(t.tags ?? []).includes(o.tag)) return false;
    if (o.linkedOnly && !(t.related_entity_id || t.linked_entity_path)) return false;
    if (o.unansweredOnly && !(t.thread_type === "question" && t.status === "open")) return false;
    if (needle) {
      const hay = [
        t.title, t.body ?? "",
        (t.tags ?? []).join(" "),
        t.category?.name ?? "",
        t.author?.display_name ?? "", t.author?.username ?? "",
        t.linked_entity_label ?? "", t.linked_entity_path ?? "",
      ].join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export function sortThreads(list: ThreadWithMeta[], sort: ThreadSort): ThreadWithMeta[] {
  const arr = [...list];
  const pin = (a: ThreadWithMeta, b: ThreadWithMeta) => Number(b.pinned) - Number(a.pinned);
  switch (sort) {
    case "newest":
      arr.sort((a, b) => pin(a, b) || +new Date(b.created_at) - +new Date(a.created_at));
      break;
    case "replies":
      arr.sort((a, b) => pin(a, b) || b.reply_count - a.reply_count);
      break;
    case "reactions":
      arr.sort((a, b) => pin(a, b) || b.reaction_count - a.reaction_count);
      break;
    case "views":
      arr.sort((a, b) => pin(a, b) || b.view_count - a.view_count);
      break;
    case "recent":
    default:
      arr.sort((a, b) => pin(a, b) || +new Date(b.last_activity_at) - +new Date(a.last_activity_at));
  }
  return arr;
}

export function hasStructured(t: ThreadWithMeta): boolean {
  return !!(t.structured_data && Object.keys(t.structured_data).length > 0);
}

export function hasLinked(t: ThreadWithMeta): boolean {
  return !!(t.related_entity_id || t.linked_entity_path);
}