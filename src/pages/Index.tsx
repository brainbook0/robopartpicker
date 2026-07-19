import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, Boxes, GitBranch, MessageSquare, Package, ShoppingBag, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { useComponents, useSuppliers } from "@/lib/api/catalog";
import { useMarketplace } from "@/lib/api/marketplace";
import { bomsApi } from "@/lib/api/builds";
import { listPublicProjects } from "@/lib/projects";
import { lowestPrice } from "@/shared/catalog";

const actions = [
  { to: "/projects", icon: GitBranch, title: "Discover projects", text: "Versioned RPPS packages, BOMs, steps, files, and evidence." },
  { to: "/parts/actuator", icon: Boxes, title: "Component intelligence", text: "Compare specifications and observed supplier offers." },
  { to: "/builder", icon: Wrench, title: "Build workspace", text: "Persist BOM decisions, sourcing, steps, tests, and problems." },
  { to: "/assistant", icon: Bot, title: "Build assistant", text: "Grounded tools with confirmation-gated technical changes." },
  { to: "/community", icon: MessageSquare, title: "Technical Community", text: "Structured questions, reports, build logs, and accepted answers." },
  { to: "/marketplace", icon: ShoppingBag, title: "Marketplace", text: "Parts, robots, fabrication, services, and wanted requests." },
];

export default function Index() {
  const components = useComponents({ limit: 8 });
  const suppliers = useSuppliers();
  const projects = useQuery({ queryKey: ["home-projects"], queryFn: listPublicProjects });
  const boms = useQuery({ queryKey: ["home-boms"], queryFn: ({ signal }) => bomsApi.list(signal) });
  const marketplace = useMarketplace({ type: "sell" });
  const demoOnly = components.data?.items.every((item) => item.isDemo) ?? true;
  return <main>
    <section className="border-b border-border bg-surface/40">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 lg:grid-cols-[1.25fr_.75fr] lg:py-14">
        <div><div className="section-title mb-2">DIY robotics engineering platform</div><h1 className="max-w-4xl text-3xl font-bold leading-tight tracking-tight md:text-4xl">Discover, source, build, troubleshoot, and document robots with structured data.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">RoboPartPicker unifies fragmented component data, project standards, persistent builds, technical collaboration, sourcing, Marketplace records, and evidence-grounded AI.</p><div className="mt-5 flex flex-wrap gap-2"><Link to="/projects" className="btn-primary inline-flex items-center gap-1">Explore projects <ArrowRight className="h-3.5 w-3.5" /></Link><Link to="/builder" className="btn-ghost">Start a build</Link><Link to="/rpps" className="btn-ghost">RPPS format</Link></div></div>
        <div className="surface-card grid grid-cols-2 divide-x divide-y divide-border overflow-hidden"><Metric label="Components" value={components.data?.total} /><Metric label="Suppliers" value={suppliers.data?.total} /><Metric label="Projects" value={projects.data?.length} /><Metric label="BOMs" value={boms.data?.total} /></div>
      </div>
    </section>
    <div className="mx-auto max-w-[1400px] space-y-8 px-4 py-7">
      <section><div className="mb-3 flex items-end justify-between"><div><div className="section-title">Platform</div><h2 className="text-lg font-bold">One technical workspace from discovery to tested build</h2></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{actions.map(({ to, icon: Icon, title, text }) => <Link key={to} to={to} className="surface-card surface-card-hover p-4"><Icon className="h-5 w-5 text-primary" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></Link>)}</div></section>
      <section><div className="mb-3 flex items-end justify-between"><div><div className="section-title">Component intelligence</div><h2 className="text-lg font-bold">Recently indexed components</h2></div><Link to="/parts/actuator" className="text-xs hover:text-primary">Full catalog →</Link></div>{components.isLoading ? <State>Loading from D1…</State> : components.error ? <State error>{components.error.message}</State> : <div className="surface-card overflow-x-auto"><table className="data-table min-w-[850px]"><thead><tr><th>Component</th><th>Maker</th><th>Category</th><th className="text-right">Known offers</th><th className="text-right">Lowest observed</th><th>Freshness</th></tr></thead><tbody>{components.data?.items.map((part) => <tr key={part.id}><td><Link className="font-medium hover:text-primary" to={`/parts/${part.category}/${part.slug}`}>{part.name}</Link>{part.isDemo && <span className="pill pill-yellow ml-2">demo</span>}</td><td>{part.maker}</td><td className="uppercase text-muted-foreground">{part.category}</td><td className="text-right mono">{part.offers.length}</td><td className="text-right mono">{part.offers.length ? `$${lowestPrice(part).toLocaleString()}` : "—"}</td><td className="text-xs text-muted-foreground">{part.freshnessAt ? new Date(part.freshnessAt).toLocaleDateString() : "unknown"}</td></tr>)}</tbody></table></div>} {demoOnly && <div className="mt-2 border border-warning/30 bg-warning/5 p-2 text-[11px] text-muted-foreground">Catalog values currently come from the idempotent D1 demo seed and are not live commercial data.</div>}</section>
      <div className="grid gap-6 lg:grid-cols-2"><section><div className="mb-3 flex justify-between"><div><div className="section-title">Projects</div><h2 className="font-bold">Published RPPS packages</h2></div><Link to="/projects" className="text-xs hover:text-primary">All projects →</Link></div><div className="space-y-2">{projects.data?.slice(0, 4).map((project) => <Link key={project.id} to={`/projects/${project.slug}`} className="surface-card surface-card-hover block p-3"><div className="flex justify-between gap-3"><span className="font-medium">{project.name}</span><span className="mono text-[10px] text-muted-foreground">v{project.version}</span></div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{project.summary ?? "No summary."}</p></Link>)}{!projects.isLoading && projects.data?.length === 0 && <State>No published projects yet.</State>}</div></section><section><div className="mb-3 flex justify-between"><div><div className="section-title">Marketplace</div><h2 className="font-bold">Technical listings</h2></div><Link to="/marketplace" className="text-xs hover:text-primary">Marketplace →</Link></div><div className="space-y-2">{marketplace.data?.items.slice(0, 4).map((listing) => <Link key={listing.id} to={`/marketplace/${listing.slug}`} className="surface-card surface-card-hover flex items-center justify-between gap-4 p-3"><div><div className="font-medium">{listing.title}</div><div className="text-[10px] text-muted-foreground">{listing.category} · {listing.region ?? "region n/a"}{listing.isDemo ? " · demo" : ""}</div></div><div className="mono text-sm font-semibold">{listing.price == null ? "Quote" : `${listing.currency} ${listing.price.toLocaleString()}`}</div></Link>)}</div></section></div>
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: number | undefined }) { return <div className="p-5"><div className="section-title">{label}</div><div className="mt-1 mono text-2xl font-bold">{value ?? "—"}</div></div>; }
function State({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return <div className={`surface-card p-5 text-center text-sm ${error ? "text-negative" : "text-muted-foreground"}`}>{children}</div>; }
