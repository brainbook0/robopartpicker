import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  Boxes,
  GitBranch,
  MessageSquare,
  ShoppingBag,
  Users,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useComponents, useSuppliers } from "@/lib/api/catalog";
import { useMarketplace } from "@/lib/api/marketplace";
import { bomsApi } from "@/lib/api/builds";
import { listPublicProjects, type ProjectRow } from "@/lib/projects";
import { selectFeaturedProjects } from "@/lib/featured-projects";
import { lowestPrice } from "@/shared/catalog";

const actions = [
  { to: "/projects", icon: GitBranch, title: "Discover projects", text: "Versioned project packages, BOMs, steps, files, and build evidence." },
  { to: "/parts/actuator", icon: Boxes, title: "Component intelligence", text: "Compare specifications and observed supplier offers." },
  { to: "/builder", icon: Wrench, title: "Build workspace", text: "Track sourcing, assembly, tests, substitutions, and problems." },
  { to: "/assistant", icon: Bot, title: "Build assistant", text: "Grounded help with previewed, confirmation-gated technical changes." },
  { to: "/community", icon: MessageSquare, title: "Technical community", text: "Structured questions, reports, build logs, and accepted answers." },
  { to: "/marketplace", icon: ShoppingBag, title: "Marketplace", text: "Parts, robots, fabrication, services, and wanted requests." },
];

const metricLinks = [
  { label: "Components", to: "/parts/actuator" },
  { label: "Suppliers", to: "/suppliers" },
  { label: "Projects", to: "/projects" },
  { label: "BOMs", to: "/boms" },
] as const;

export default function Index() {
  const components = useComponents({ limit: 8 });
  const suppliers = useSuppliers();
  const projects = useQuery({ queryKey: ["home-projects"], queryFn: listPublicProjects });
  const boms = useQuery({ queryKey: ["home-boms"], queryFn: ({ signal }) => bomsApi.list(signal) });
  const marketplace = useMarketplace({ type: "sell" });
  const featuredProjects = useMemo(() => selectFeaturedProjects(projects.data ?? []), [projects.data]);
  const demoOnly = components.data?.items.every((item) => item.isDemo) ?? true;
  const metricValues = [components.data?.total, suppliers.data?.total, projects.data?.length, boms.data?.total];

  return <main>
    <section className="border-b border-border bg-surface/40">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 lg:grid-cols-[1.25fr_.75fr] lg:py-14">
        <div>
          <div className="section-title mb-2">DIY robotics engineering platform</div>
          <h1 className="max-w-4xl text-3xl font-bold leading-tight tracking-tight md:text-4xl">Build robots from information you can inspect, source, and reproduce.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">RoboPartPicker brings project files, bills of materials, component identities, supplier observations, build records, community evidence, and grounded assistance into one technical workspace.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/projects" className="btn-primary inline-flex items-center gap-1">Explore projects <ArrowRight className="h-3.5 w-3.5" /></Link>
            <Link to="/builder" className="btn-ghost">Start a build</Link>
          </div>
        </div>
        <div className="surface-card grid grid-cols-2 divide-x divide-y divide-border overflow-hidden" aria-label="Browse RoboPartPicker data">
          {metricLinks.map((metric, index) => <Metric key={metric.label} {...metric} value={metricValues[index]} />)}
        </div>
      </div>
    </section>

    <div className="mx-auto max-w-[1400px] space-y-8 px-4 py-7">
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><div className="section-title">Featured projects</div><h2 className="text-lg font-bold">Robot projects with the strongest build information</h2></div>
          <Link to="/projects" className="shrink-0 text-xs hover:text-primary">All projects →</Link>
        </div>
        {projects.isLoading ? <State>Loading featured projects…</State> : projects.error ? <State error>{projects.error.message}</State> : featuredProjects.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{featuredProjects.map((project) => <FeaturedProject key={project.id} project={project} />)}</div> : <State>No published projects yet.</State>}
      </section>

      <section>
        <div className="mb-3"><div className="section-title">Platform</div><h2 className="text-lg font-bold">One technical workspace from discovery to tested build</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{actions.map(({ to, icon: Icon, title, text }) => <Link key={to} to={to} className="surface-card surface-card-hover p-4"><Icon className="h-5 w-5 text-primary" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></Link>)}</div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between"><div><div className="section-title">Component intelligence</div><h2 className="text-lg font-bold">Recently indexed components</h2></div><Link to="/parts/actuator" className="text-xs hover:text-primary">Full catalog →</Link></div>
        {components.isLoading ? <State>Loading from D1…</State> : components.error ? <State error>{components.error.message}</State> : <div className="surface-card overflow-x-auto"><table className="data-table min-w-[850px]"><thead><tr><th>Component</th><th>Maker</th><th>Category</th><th className="text-right">Known offers</th><th className="text-right">Lowest observed</th><th>Freshness</th></tr></thead><tbody>{components.data?.items.map((part) => <tr key={part.id}><td><Link className="font-medium hover:text-primary" to={`/parts/${part.category}/${part.slug}`}>{part.name}</Link>{part.isDemo && <span className="pill pill-yellow ml-2">demo</span>}</td><td>{part.maker}</td><td className="uppercase text-muted-foreground">{part.category}</td><td className="text-right mono">{part.offers.length}</td><td className="text-right mono">{part.offers.length ? `$${lowestPrice(part).toLocaleString()}` : "—"}</td><td className="text-xs text-muted-foreground">{part.freshnessAt ? new Date(part.freshnessAt).toLocaleDateString() : "unknown"}</td></tr>)}</tbody></table></div>}
        {demoOnly && <div className="mt-2 border border-warning/30 bg-warning/5 p-2 text-[11px] text-muted-foreground">Catalog values currently come from the idempotent D1 demo seed and are not live commercial data.</div>}
      </section>

      <section>
        <div className="mb-3 flex justify-between"><div><div className="section-title">Marketplace</div><h2 className="font-bold">Technical listings</h2></div><Link to="/marketplace" className="text-xs hover:text-primary">Marketplace →</Link></div>
        <div className="grid gap-2 md:grid-cols-2">{marketplace.data?.items.slice(0, 4).map((listing) => <Link key={listing.id} to={`/marketplace/${listing.slug}`} className="surface-card surface-card-hover flex items-center justify-between gap-4 p-3"><div><div className="font-medium">{listing.title}</div><div className="text-[10px] text-muted-foreground">{listing.category} · {listing.region ?? "region n/a"}{listing.isDemo ? " · demo" : ""}</div></div><div className="mono text-sm font-semibold">{listing.price == null ? "Quote" : `${listing.currency} ${listing.price.toLocaleString()}`}</div></Link>)}</div>
      </section>

      <section className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-4xl">
          <div className="section-title">Project standard</div>
          <h2 className="mt-1 text-sm font-semibold">RPPS means RoboPartPicker Project Standard</h2>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">An open draft format for a robot project’s manifest, exact dependency lockfile, and supporting build evidence. It links to native CAD, firmware, configuration, and documentation without replacing them.</p>
        </div>
        <Link to="/rpps" className="shrink-0 text-xs font-semibold text-primary hover:underline">Read the draft specification →</Link>
      </section>
    </div>
  </main>;
}

function Metric({ label, value, to }: { label: string; value: number | undefined; to: string }) {
  return <Link to={to} className="group p-5 outline-none transition-colors hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><div className="flex items-center justify-between gap-2"><div className="section-title">{label}</div><ArrowRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" /></div><div className="mt-1 mono text-2xl font-bold">{value ?? "—"}</div><div className="mt-1 text-[10px] text-muted-foreground group-hover:text-foreground">Browse {label.toLowerCase()}</div></Link>;
}

function FeaturedProject({ project }: { project: ProjectRow }) {
  const bomLines = project.rpps.bom?.length ?? 0;
  return <Link to={`/projects/${project.slug}`} className="surface-card surface-card-hover group flex min-h-48 flex-col p-4">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold group-hover:text-primary">{project.name}</div><div className="mono mt-0.5 text-[9.5px] text-muted-foreground">release {project.version}</div></div>{project.is_demo && <span className="pill pill-yellow">demo</span>}</div>
    <p className="mt-3 line-clamp-3 text-xs leading-5 text-muted-foreground">{project.summary ?? "No project summary has been published yet."}</p>
    <div className="mt-auto flex flex-wrap gap-1 pt-4 text-[10px] text-muted-foreground"><span className="rounded bg-muted px-1.5 py-0.5">{bomLines} BOM lines</span>{project.difficulty && <span className="rounded bg-muted px-1.5 py-0.5">{project.difficulty}</span>}<span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"><Users className="h-3 w-3" /> {project.successful_reproduction_count} verified</span></div>
  </Link>;
}

function State({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`surface-card p-5 text-center text-sm ${error ? "text-negative" : "text-muted-foreground"}`}>{children}</div>;
}
