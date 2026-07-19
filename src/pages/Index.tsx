import { Link } from "react-router-dom";
import { Sparkles, Compass, FileCode2, Wrench, Share2 } from "lucide-react";
import logoUrl from "@/assets/logo.png";
import { parts, partsByCategory, lowestPrice, priceDelta30, type Actuator, type Hand } from "@/data/parts";
import { listings, wanted, sellers } from "@/data/listings";
import { failures } from "@/data/failures";
import { boms, bomCost, bomMass, bomPartCount } from "@/data/boms";
import { partById } from "@/data/parts";
import { PriceDeltaPill } from "@/components/common/PriceDeltaPill";
import { Sparkline } from "@/components/common/Sparkline";
import { SectionHead } from "@/components/common/SectionHead";

const sortedByDelta = [...parts].sort((a, b) => Math.abs(priceDelta30(b)) - Math.abs(priceDelta30(a)));

export default function Index() {
  const movers = sortedByDelta.slice(0, 6);
  const trendingAct = partsByCategory("actuator").slice(0, 8);
  const trendingHand = partsByCategory("hand").slice(0, 5);
  const latestListings = listings.slice(0, 4);
  const latestWanted = wanted.slice(0, 4);
  const latestFails = failures.slice(0, 4);
  const activeBoms = boms.slice(0, 3);

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1400px] px-4 py-5">
          <div className="flex items-start gap-5 flex-wrap">
            <img src={logoUrl} alt="" className="h-12 w-12 rounded-full shrink-0" />
            <div className="flex-1 min-w-[260px]">
              <div className="section-title mb-1">Robopartpicker</div>
              <h1 className="text-[20px] sm:text-[24px] font-bold tracking-tight leading-tight max-w-3xl">
                Build, document, source, share, and sell DIY robots.
              </h1>
              <p className="mt-1 text-[12px] text-muted-foreground max-w-3xl">
                RoboPartPicker turns fragmented robotics projects into structured, buildable records—then helps you source the parts, collaborate with other builders, and bring completed robots to market.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Link to="/builder" className="btn-primary btn-sm">Start a build</Link>
                <Link to="/projects" className="btn-ghost btn-sm">Explore projects</Link>
                <Link to="/marketplace" className="btn-ghost btn-sm">Browse marketplace</Link>
                <Link to="/assistant" className="btn-ghost btn-sm"><Sparkles className="h-3.5 w-3.5" /> Ask the AI builder</Link>
              </div>
            </div>
          </div>

          {/* Capability strip */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { icon: Compass, title: "Discover", body: "Projects, components, suppliers, and technical evidence.", to: "/projects" },
              { icon: FileCode2, title: "Standardize", body: "Turn repositories and docs into RPPS project records.", to: "/rpps" },
              { icon: Wrench, title: "Build with AI", body: "Source BOMs, organize progress, and troubleshoot.", to: "/assistant" },
              { icon: Share2, title: "Share or sell", body: "Publish builds, collaborate, or list completed robots.", to: "/marketplace" },
            ].map(({ icon: Icon, title, body, to }) => (
              <Link key={title} to={to} className="surface-card p-2.5 hover:border-foreground/25">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                  <Icon className="h-3.5 w-3.5 text-primary" /> {title}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground leading-snug">{body}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Price movers strip */}
      <section className="mx-auto max-w-[1400px] px-4 py-5">
        <SectionHead kicker="Live" title="Price movers — last 30 days" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {movers.map(p => (
            <Link key={p.id} to={`/parts/${p.category}/${p.slug}`} className="surface-card p-2.5 hover:border-foreground/25">
              <div className="text-[11px] text-muted-foreground truncate">{p.maker}</div>
              <div className="text-[13px] font-semibold truncate">{p.name}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="mono text-[12px]">${lowestPrice(p).toLocaleString()}</span>
                <PriceDeltaPill pct={priceDelta30(p)} />
              </div>
              <div className="mt-1"><Sparkline data={p.priceHistory} width={140} height={20} /></div>
            </Link>
          ))}
        </div>
      </section>

      <div className="mx-auto max-w-[1400px] px-4 py-2 grid gap-6 lg:grid-cols-3">
        {/* Trending actuators */}
        <section className="lg:col-span-2">
          <SectionHead kicker="Trending" title="Actuators" href="/parts/actuator" />
          <div className="surface-card overflow-x-auto">
            <table className="data-table">
              <thead><tr>
                <th>Part</th><th>Peak Nm</th><th>V</th><th>Lowest $</th><th>30d Δ</th><th>Sup.</th><th></th>
              </tr></thead>
              <tbody>
                {trendingAct.map(p => { const a = p as Actuator; return (
                  <tr key={p.id}>
                    <td><Link to={`/parts/${p.category}/${p.slug}`} className="font-medium hover:text-primary">{p.name}</Link><div className="text-[11px] text-muted-foreground">{p.maker}</div></td>
                    <td className="mono">{a.peakNm}</td>
                    <td className="mono">{a.voltageV}</td>
                    <td className="mono font-semibold">${lowestPrice(p).toLocaleString()}</td>
                    <td><PriceDeltaPill pct={priceDelta30(p)} /></td>
                    <td className="mono">{p.offers.length}</td>
                    <td><Link to="/builder" className="btn-ghost btn-sm">+ BOM</Link></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Active BOMs */}
        <section>
          <SectionHead kicker="Workflows" title="Active BOMs" href="/boms" />
          <div className="space-y-2">
            {activeBoms.map(b => (
              <Link key={b.id} to={`/boms/${b.slug}`} className="surface-card p-3 block hover:border-foreground/25">
                <div className="flex items-center gap-2"><span className="pill pill-yellow">{b.subsystem}</span><div className="font-semibold truncate">{b.name}</div></div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
                  <div><div className="text-muted-foreground">Cost</div><div className="mono font-semibold">${bomCost(b).toLocaleString()}</div></div>
                  <div><div className="text-muted-foreground">Mass</div><div className="mono">{bomMass(b).toFixed(1)}kg</div></div>
                  <div><div className="text-muted-foreground">Parts</div><div className="mono">{bomPartCount(b)}</div></div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Trending hands */}
        <section className="lg:col-span-2">
          <SectionHead kicker="Trending" title="Dexterous hands" href="/parts/hand" />
          <div className="surface-card overflow-x-auto">
            <table className="data-table">
              <thead><tr>
                <th>Hand</th><th>DoF</th><th>Payload kg</th><th>Tactile</th><th>Lowest $</th><th>30d Δ</th>
              </tr></thead>
              <tbody>
                {trendingHand.map(p => { const h = p as Hand; return (
                  <tr key={p.id}>
                    <td><Link to={`/parts/${p.category}/${p.slug}`} className="font-medium hover:text-primary">{p.name}</Link><div className="text-[11px] text-muted-foreground">{p.maker}</div></td>
                    <td className="mono">{h.actuatedDof}/{h.dof}</td>
                    <td className="mono">{h.payloadKg}</td>
                    <td>{h.tactile ? "yes" : "no"}</td>
                    <td className="mono font-semibold">${lowestPrice(p).toLocaleString()}</td>
                    <td><PriceDeltaPill pct={priceDelta30(p)} /></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Latest wanted */}
        <section>
          <SectionHead kicker="Demand" title="Latest wanted" href="/marketplace" />
          <div className="space-y-2">
            {latestWanted.map(w => (
              <div key={w.id} className="surface-card p-3">
                <div className="flex items-center gap-2"><span className="pill pill-yellow">wanted</span><span className="pill">{w.partCategory}</span><span className="pill">{w.region}</span></div>
                <div className="mt-1 font-semibold text-[13px]">{w.partName}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">qty <span className="mono">{w.qty}</span> · budget <span className="mono">${w.maxBudget.toLocaleString()}</span> · {w.postedDaysAgo}d</div>
              </div>
            ))}
          </div>
        </section>

        {/* Latest listings */}
        <section className="lg:col-span-2">
          <SectionHead kicker="Marketplace" title="Latest used listings" href="/marketplace" />
          <div className="grid sm:grid-cols-2 gap-2">
            {latestListings.map(l => { const p = partById(l.partId)!; const s = sellers[l.sellerId]; return (
              <Link key={l.id} to={`/marketplace/${l.id}`} className="surface-card p-3 hover:border-foreground/25">
                <div className="flex items-center gap-2">
                  <span className={`pill ${l.grade==="A"?"pill-good":l.grade==="ForParts"?"pill-bad":""}`}>Grade {l.grade}</span>
                  <span className="pill">{l.region}</span>
                </div>
                <div className="font-semibold mt-1 text-[13px] truncate">{l.title}</div>
                <div className="text-[11px] text-muted-foreground">{p.name} · {l.runtimeHours ?? "untested"}h · {s.name}</div>
                <div className="mt-1 mono font-bold">${l.price.toLocaleString()} <span className="text-[11px] font-normal text-muted-foreground">{l.priceVsNewPct}% vs new</span></div>
              </Link>
            ); })}
          </div>
        </section>

        {/* Latest failures */}
        <section>
          <SectionHead kicker="Reliability" title="Recent failure reports" href="/community" />
          <div className="surface-card overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Part</th><th>Symptom</th><th>Hr</th><th>Resolution</th></tr></thead>
              <tbody>
                {latestFails.map(f => { const p = partById(f.partId)!; return (
                  <tr key={f.id}>
                    <td><Link to={`/parts/${p.category}/${p.slug}`} className="hover:text-primary">{p.name}</Link></td>
                    <td className="text-[12px]">{f.symptom}</td>
                    <td className="mono">{f.runtimeHours}</td>
                    <td><span className={`pill ${f.resolution==="RMA approved"?"pill-good":f.resolution==="No response"||f.resolution==="RMA denied"?"pill-bad":"pill-warn"}`}>{f.resolution}</span></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="h-10" />
    </div>
  );
}
