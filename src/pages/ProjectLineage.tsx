import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listForks, type ForkSummary } from "@/lib/projects";

type Props = { projectId: string };

export function ProjectLineage({ projectId }: Props) {
  const upstream = useQuery({ queryKey: ["forks", projectId, "upstream"], queryFn: () => listForks(projectId, "upstream") });
  const downstream = useQuery({ queryKey: ["forks", projectId, "downstream"], queryFn: () => listForks(projectId, "downstream") });

  return (
    <div className="space-y-6">
      <ForkList title="Upstream" direction="upstream" items={upstream.data ?? []} loading={upstream.isLoading} empty="This project has no upstream (it is a root project)." />
      <ForkList title="Forks" direction="downstream" items={downstream.data ?? []} loading={downstream.isLoading} empty="No forks have been derived from this project yet." />
    </div>
  );
}

function ForkList({ title, direction, items, loading, empty }: { title: string; direction: "upstream" | "downstream"; items: ForkSummary[]; loading: boolean; empty: string }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border p-3">
              <Link to={`/projects/${item.slug}`} className="font-medium hover:underline">
                {item.name}
              </Link>
              <div className="text-xs text-muted-foreground">
                {direction === "downstream" && item.upstreamRevision ? <>forked from revision {item.upstreamRevision} · </> : null}
                {item.changeSummary ? <span>{item.changeSummary} · </span> : null}
                {item.visibility}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
