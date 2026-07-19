import { Link } from "react-router-dom";
import { boms, bomCost, bomMass, bomPartCount } from "@/data/boms";
import { PageHeader } from "@/components/common/PageHeader";

export default function BomsIndex() {
  return (
    <>
      <PageHeader kicker="BOMs" title="Public bills of materials" sub="Subsystem builds shared by the community. Fork, customize, track cost over time."
        actions={<Link to="/builder" className="btn-primary">New BOM</Link>} />
      <div className="mx-auto max-w-[1400px] px-4 py-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {boms.map(b => (
          <Link to={`/boms/${b.slug}`} key={b.id} className="surface-card surface-card-hover p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="pill pill-yellow">{b.subsystem}</span>
              <span className="text-[11px] text-muted-foreground">forks {b.forks}</span>
            </div>
            <div className="font-semibold">{b.name}</div>
            <div className="text-[12px] text-muted-foreground mt-1">{b.description}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
              <div><div className="text-muted-foreground">Cost</div><div className="mono font-semibold">${bomCost(b).toLocaleString()}</div></div>
              <div><div className="text-muted-foreground">Mass</div><div className="mono">{bomMass(b).toFixed(1)} kg</div></div>
              <div><div className="text-muted-foreground">Parts</div><div className="mono">{bomPartCount(b)}</div></div>
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">{b.author} · updated {b.updatedDaysAgo}d ago</div>
          </Link>
        ))}
      </div>
    </>
  );
}
