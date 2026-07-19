import { Link } from "react-router-dom";
import { robots } from "@/data/robots";
import { teardownBySlug } from "@/data/teardowns";
import { PageHeader } from "@/components/common/PageHeader";
import { ExpandableImage } from "@/components/common/ExpandableImage";
import { gallery } from "@/lib/media";

export default function Robots() {
  return (
    <>
      <PageHeader kicker="Robots" title="Humanoid & biped platforms"
        sub="Procurement-evidence pages: estimated BOM range, supplier dependencies, teardown-confirmed components."
        actions={<Link to="/teardowns" className="btn-ghost">Browse teardowns</Link>} />
      <div className="mx-auto max-w-[1400px] px-4 py-6 surface-card overflow-x-auto">
        <table className="data-table">
          <thead><tr>
            <th></th><th>Robot</th><th>Maker</th><th>Status</th><th>Height</th><th>Weight</th><th>DoF</th><th>BOM (est)</th><th>Evidence</th><th>Year</th>
          </tr></thead>
          <tbody>
            {robots.map(r => {
              const td = teardownBySlug(r.slug);
              const g = gallery("robot", r.slug, 3);
              return <tr key={r.slug}>
                <td><ExpandableImage src={g.hero} alt={r.name} thumbs={g.thumbs} caption={`${r.name} — ${r.maker}`} className="h-10 w-14" /></td>
                <td><Link to={`/robots/${r.slug}`} className="font-medium hover:text-primary">{r.name}</Link>{r.openSource && <span className="ml-1 pill pill-good">OS</span>}</td>
                <td>{r.maker}</td>
                <td><span className={`pill ${r.status==="shipping"?"pill-good":r.status==="preorder"?"pill-warn":r.status==="discontinued"?"pill-bad":""}`}>{r.status}</span></td>
                <td className="mono">{r.heightCm} cm</td>
                <td className="mono">{r.weightKg} kg</td>
                <td className="mono">{r.dof}</td>
                <td className="mono">{td ? `$${(td.bomLowUsd/1000).toFixed(0)}–${(td.bomHighUsd/1000).toFixed(0)}k` : "—"}</td>
                <td className="mono">{td ? `${td.evidenceScore}/100` : "—"}</td>
                <td className="mono">{r.releaseYear}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
