import { Link, useParams } from "react-router-dom";
import { bomBySlug, bomCost, bomMass, bomPartCount } from "@/data/boms";
import { partById, lowestPrice } from "@/data/parts";

export default function BomDetail() {
  const { slug } = useParams();
  const b = bomBySlug(slug ?? "");
  if (!b) return <div className="p-8">BOM not found.</div>;
  const cost = bomCost(b);
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="text-[12px] text-muted-foreground mb-1"><Link to="/boms" className="hover:text-primary">BOMs</Link> / {b.name}</div>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{b.name}</h1>
          <div className="text-[13px] text-muted-foreground">{b.author} · {b.subsystem} · updated {b.updatedDaysAgo}d ago</div>
          <p className="mt-2 max-w-2xl text-[14px]">{b.description}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/builder" className="btn-primary">Fork into builder</Link>
          <button className="btn-ghost">Price alert</button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 surface-card p-4">
        <Stat label="Total cost" value={`$${cost.toLocaleString()}`} />
        <Stat label="Total mass" value={`${bomMass(b).toFixed(2)} kg`} />
        <Stat label="Parts" value={bomPartCount(b)} />
        <Stat label="Forks" value={b.forks} />
      </div>
      <div className="mt-4 surface-card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Slot</th><th>Part</th><th>Qty</th><th>Unit $</th><th>Ext $</th><th>Lead</th><th>Suppliers</th></tr></thead>
          <tbody>
            {b.slots.map((s, i) => {
              const p = partById(s.partId); if (!p) return null;
              const unit = lowestPrice(p);
              const minLead = p.offers.reduce((m, o) => Math.min(m, o.leadDays), 999);
              return <tr key={i}>
                <td className="text-[12px] text-muted-foreground">{s.slot}</td>
                <td><Link to={`/parts/${p.category}/${p.slug}`} className="font-medium hover:text-primary">{p.name}</Link></td>
                <td className="mono">{s.qty}</td>
                <td className="mono">${unit.toLocaleString()}</td>
                <td className="mono font-semibold">${(unit * s.qty).toLocaleString()}</td>
                <td className="mono">{minLead}d</td>
                <td className="mono">{p.offers.length}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="section-title">{label}</div>
    <div className="mono text-[18px] font-bold">{value}</div>
  </div>
);
