import { Link, useParams } from "react-router-dom";
import { posts, postTypeLabel } from "@/data/posts";

export default function PostDetail() {
  const { id } = useParams();
  const p = posts.find(x => x.id === id);
  if (!p) return <div className="p-8">Post not found.</div>;
  return (
    <div className="mx-auto max-w-[860px] px-4 py-6">
      <div className="text-[12px] text-muted-foreground mb-1"><Link to="/community" className="hover:text-primary">Community</Link> / {postTypeLabel[p.type]}</div>
      <h1 className="text-[22px] font-bold tracking-tight">{p.title}</h1>
      <div className="text-[13px] text-muted-foreground mt-0.5">{p.author} · {p.postedDaysAgo}d ago · ▲ {p.upvotes} · {p.replies} replies</div>
      <div className="mt-4 surface-card p-4">
        <div className="section-title mb-2">{postTypeLabel[p.type]} — required fields</div>
        {Object.entries(p.fields).map(([k, v]) => (
          <div key={k} className="grid grid-cols-2 gap-4 border-b border-border/60 py-1.5 text-[13px]">
            <div className="text-muted-foreground">{k}</div><div className="mono">{String(v)}</div>
          </div>
        ))}
      </div>
      {p.body && <div className="mt-4 surface-card p-4 text-[14px] leading-relaxed">{p.body}</div>}
    </div>
  );
}
