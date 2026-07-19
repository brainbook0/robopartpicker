import { Link } from "react-router-dom";
import { teardowns } from "@/data/teardowns";
import { getRobot } from "@/data/robots";
import { PageHeader } from "@/components/common/PageHeader";

export default function Teardowns() {
  return (
    <>
      <PageHeader kicker="Teardowns" title="Robot teardown evidence packs"
        sub="Component identifications labeled by evidence quality. Estimated BOM ranges per platform." />
      <div className="mx-auto max-w-[1400px] px-4 py-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {teardowns.map(t => {
          const r = getRobot(t.robotSlug);
          if (!r) return null;
          return <Link to={`/robots/${r.slug}`} key={t.robotSlug} className="surface-card surface-card-hover p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{r.name}</div>
              <span className="pill mono">{t.evidenceScore}/100</span>
            </div>
            <div className="text-[12px] text-muted-foreground">{r.maker}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
              <div><div className="text-muted-foreground">Confirmed</div><div className="mono">{t.confirmedCount}</div></div>
              <div><div className="text-muted-foreground">BOM low</div><div className="mono">${(t.bomLowUsd/1000).toFixed(0)}k</div></div>
              <div><div className="text-muted-foreground">BOM high</div><div className="mono">${(t.bomHighUsd/1000).toFixed(0)}k</div></div>
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">{t.openQuestions.length} open questions · updated {t.updatedDaysAgo}d ago</div>
          </Link>;
        })}
      </div>
    </>
  );
}
