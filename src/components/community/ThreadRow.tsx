import { Link } from "react-router-dom";
import {
  MessageSquare, Eye, Heart, Pin, Lock, HelpCircle, CheckCircle2, Link2,
} from "lucide-react";
import {
  authorInitials, authorName, timeAgo, threadTypeLabel,
  type ThreadWithMeta, type ThreadType, type ThreadStatus,
} from "@/lib/forum";
import { hasStructured, hasLinked } from "./threadFilters";

export function ThreadRow({ t, onTag }: { t: ThreadWithMeta; onTag?: (tag: string) => void }) {
  return (
    <div className="flex items-start gap-3 p-3 hover:bg-muted/40">
      <Link to={`/community/t/${t.id}`} aria-label={t.title}>
        {t.author?.avatar_url
          ? <img src={t.author.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover border border-border" />
          : <div className="h-8 w-8 shrink-0 rounded-full bg-primary/15 text-primary border border-primary/30 grid place-items-center text-[11px] font-semibold">{authorInitials(t.author)}</div>}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {t.pinned && <Pin className="h-3 w-3 text-primary" aria-label="pinned" />}
          {t.locked && <Lock className="h-3 w-3 text-muted-foreground" aria-label="locked" />}
          <TypeBadge type={t.thread_type} status={t.status} />
          {t.category && (
            <Link to={`/community?category=${t.category.slug}`} className="pill" style={{ borderColor: t.category.color + "66", background: t.category.color + "22", color: t.category.color }}>
              {t.category.name}
            </Link>
          )}
          {hasStructured(t) && <span className="pill" title="Author supplied structured fields">structured fields</span>}
          {hasLinked(t) && <span className="pill" title="Links to a project, component, listing, supplier, or internal page"><Link2 className="h-3 w-3" /> linked object</span>}
          <Link to={`/community/t/${t.id}`} className="font-semibold text-[13.5px] truncate hover:text-primary">{t.title}</Link>
        </div>
        <div className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1">{t.body}</div>
        {(t.linked_entity_label || t.linked_entity_path) && (
          <div className="mt-0.5 text-[10.5px] text-muted-foreground mono truncate">
            → {t.linked_entity_label || t.linked_entity_path}
            {t.linked_entity_label && t.linked_entity_path ? ` · ${t.linked_entity_path}` : ""}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
          <span>{authorName(t.author)}</span>
          <span>·</span>
          <span>{timeAgo(t.last_activity_at)}</span>
          {t.tags?.length > 0 && onTag && (
            <>
              <span>·</span>
              {t.tags.slice(0, 3).map(tag => (
                <button key={tag} onClick={() => onTag(tag)} className="mono hover:text-primary">#{tag}</button>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1 text-[11px] text-muted-foreground mono">
        <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{t.reply_count}</span>
        <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{t.reaction_count}</span>
        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{t.view_count}</span>
      </div>
    </div>
  );
}

function TypeBadge({ type, status }: { type: ThreadType; status: ThreadStatus }) {
  const cls =
    status === "solved" ? "pill-good" :
    status === "closed" ? "" :
    type === "question" ? "pill-warn" : "pill-yellow";
  return (
    <span className={`pill ${cls}`}>
      {status === "solved" && <CheckCircle2 className="h-3 w-3" />}
      {status === "closed" && <Lock className="h-3 w-3" />}
      {status === "open" && type === "question" && <HelpCircle className="h-3 w-3" />}
      {threadTypeLabel[type]}{status !== "open" ? ` · ${status}` : ""}
    </span>
  );
}