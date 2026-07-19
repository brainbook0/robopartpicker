import { Link, useParams } from "react-router-dom";
import { getRobot } from "@/data/robots";
import { teardownBySlug, type EvidenceLabel } from "@/data/teardowns";
import { partById } from "@/data/parts";
import { postsByRef, postTypeLabel } from "@/data/posts";
import { Robot3D } from "@/components/robots/Robot3D";
import { RobotSilhouette } from "@/components/robots/RobotSilhouette";
import { PriceChart } from "@/components/robots/PriceChart";
import { ExpandableImage } from "@/components/common/ExpandableImage";
import { ExpandableField } from "@/components/common/ExpandableField";
import { gallery } from "@/lib/media";

const evidenceColor: Record<EvidenceLabel, string> = {
  "verified-by-manufacturer": "pill-good",
  "teardown-confirmed": "pill-good",
  "third-party-test": "pill-good",
  "public-demo": "pill-warn",
  "customer-reported": "pill-warn",
  "unverified": "pill-bad",
};

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <ExpandableField k={k} v={v} />;

export default function RobotDetail() {
  const { slug } = useParams();
  const r = getRobot(slug ?? "");
  if (!r) return <div className="p-8">Robot not found.</div>;
  const td = teardownBySlug(r.slug);
  const ds = postsByRef("robot", r.slug);
  const g = gallery("robot", r.slug, 5);
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="text-[12px] text-muted-foreground mb-1"><Link to="/robots" className="hover:text-primary">Robots</Link> / {r.name}</div>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{r.name}</h1>
          <div className="text-[13px] text-muted-foreground">{r.maker} · {r.country} · {r.releaseYear}</div>
          <p className="mt-2 max-w-2xl text-[14px]">{r.blurb}</p>
          <div className="mt-2 flex gap-1">
            <span className={`pill ${r.status==="shipping"?"pill-good":r.status==="preorder"?"pill-warn":""}`}>{r.status}</span>
            <span className="pill">{r.category}</span>
            {r.openSource && <span className="pill pill-good">open source</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground">MSRP</div>
          <div className="mono text-[20px] font-bold">{r.commercial.msrpUsd ? `$${r.commercial.msrpUsd.toLocaleString()}` : "n/a"}</div>
          {td && <div className="text-[11px] text-muted-foreground mt-1">BOM est. ${(td.bomLowUsd/1000).toFixed(0)}–{(td.bomHighUsd/1000).toFixed(0)}k</div>}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <div className="surface-card p-3">
            <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
              <ExpandableImage src={g.hero} alt={`${r.name} hero photo`} thumbs={g.thumbs} caption={`${r.name} — ${r.maker}`} className="aspect-[3/2]" />
              <div className="grid grid-cols-2 gap-2">
                {g.thumbs.slice(0, 4).map((t, i) => (
                  <ExpandableImage key={i} src={t} alt={`${r.name} photo ${i + 1}`} thumbs={[g.hero, ...g.thumbs.filter((_, j) => j !== i)]} className="aspect-[3/2]" />
                ))}
              </div>
            </div>
          </div>

          <div className="surface-card overflow-hidden">
            <div className="px-4 pt-3 flex items-center justify-between">
              <div className="section-title">3D model — interactive</div>
              <div className="text-[11px] text-muted-foreground">drag to orbit · scroll to zoom</div>
            </div>
            <Robot3D robot={r} height={420} />
          </div>

          <div className="surface-card p-4">
            <div className="section-title mb-2">Hardware architecture</div>
            <RobotSilhouette robot={r} />
          </div>

          {td && (
            <div className="surface-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="section-title">Teardown evidence</div>
                <div className="text-[12px]"><span className="mono font-semibold">{td.evidenceScore}/100</span> · {td.confirmedCount} confirmed</div>
              </div>
              <div className="space-y-2">
                {td.components.map((c, i) => {
                  const p = c.partId ? partById(c.partId) : undefined;
                  return <div key={i} className="border-b border-border/60 pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-[13px]">{c.subsystem}:</span>{" "}
                        <span className="text-[13px]">{c.claim}</span>
                        {p && <Link to={`/parts/${p.category}/${p.slug}`} className="ml-2 pill pill-yellow">{p.name}</Link>}
                      </div>
                      <span className={`pill ${evidenceColor[c.evidence]}`}>{c.evidence}</span>
                    </div>
                    {c.source && <div className="text-[11px] text-muted-foreground mt-0.5">source: {c.source}</div>}
                  </div>;
                })}
              </div>
              {td.openQuestions.length > 0 && (
                <div className="mt-4">
                  <div className="section-title mb-1">Open questions</div>
                  <ul className="list-disc pl-5 text-[13px] text-muted-foreground">
                    {td.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="surface-card p-4">
            <div className="section-title mb-2">Engineering</div>
            <Row k="Actuator type" v={r.engineering.actuatorType} />
            <Row k="Peak joint torque" v={`${r.engineering.peakJointTorqueNm} Nm`} />
            <Row k="DoF (legs/arms/hands)" v={`${r.engineering.legDoF} / ${r.engineering.armDoF} / ${r.engineering.handDoF}`} />
            <Row k="Body material" v={r.engineering.bodyMaterial} />
            <Row k="Bus" v={r.engineering.commsBus} />
            <Row k="Battery" v={`${r.engineering.batteryV}V · ${r.engineering.batteryWh} Wh`} />
            <Row k="Compute" v={`${r.compute.primary} · ${r.compute.tops} TOPS`} />
          </div>

          <div className="surface-card p-4">
            <div className="section-title mb-2">Price history</div>
            <PriceChart data={r.priceHistory} height={180} />
          </div>

          <div className="surface-card p-4">
            <div className="section-title mb-2">Community discussions ({ds.length})</div>
            <ul className="space-y-2 text-[13px]">
              {ds.map(d => (
                <li key={d.id}><span className="pill mr-2">{postTypeLabel[d.type]}</span><Link to={`/community/${d.type}/${d.id}`} className="hover:text-primary">{d.title}</Link></li>
              ))}
              {!ds.length && <li className="text-muted-foreground">No discussions yet.</li>}
            </ul>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="surface-card p-4">
            <div className="section-title mb-2">Physical</div>
            <Row k="Height" v={`${r.heightCm} cm`} />
            <Row k="Weight" v={`${r.weightKg} kg`} />
            <Row k="DoF" v={r.dof} />
            <Row k="Payload" v={`${r.payloadKg} kg`} />
            <Row k="Walk speed" v={`${r.walkSpeedMs} m/s`} />
            <Row k="Runtime" v={`${r.runtimeMin} min`} />
            {r.ipRating && <Row k="IP rating" v={r.ipRating} />}
          </div>
          <div className="surface-card p-4">
            <div className="section-title mb-2">Commercial</div>
            <Row k="MSRP" v={r.commercial.msrpUsd ? `$${r.commercial.msrpUsd.toLocaleString()}` : "n/a"} />
            <Row k="Lead time" v={r.commercial.leadTimeWeeks ? `${r.commercial.leadTimeWeeks} wk` : "n/a"} />
            <Row k="Warranty" v={`${r.commercial.warrantyMonths} mo`} />
            <Row k="Distribution" v={r.commercial.distribution} />
            <Row k="Spares" v={r.commercial.spareAvailability} />
          </div>
          <div className="surface-card p-4">
            <div className="section-title mb-2">Resources</div>
            <ul className="space-y-1 text-[13px]">
              {r.resources.map((res, i) => <li key={i}><a className="hover:text-primary" href={res.url}>↗ {res.label}</a></li>)}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
