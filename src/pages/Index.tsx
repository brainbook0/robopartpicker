import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, Boxes, GitFork, Layers3, MessageSquare, Package, PlugZap, ShoppingBag, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { useComponents, useSuppliers } from "@/lib/api/catalog";
import { useMarketplace } from "@/lib/api/marketplace";
import { bomsApi } from "@/lib/api/builds";
import { listProjectsPage } from "@/lib/projects";
import type { CatalogPart } from "@/shared/catalog";
import { ComingSoon } from "@/components/common/ComingSoon";

function liveOffers(part: CatalogPart) {
  return (part.offers ?? []).filter((o) => !o.isDemo && o.price > 0);
}

function lowestLivePrice(part: CatalogPart): number | null {
  const offers = liveOffers(part);
  return offers.length ? Math.min(...offers.map((o) => o.price)) : null;
}

function projectMedia(project: { cover_image_url: string | null; rpps: { files?: Array<{ kind: string; url?: string }> } }) {
  return [
    ...(project.cover_image_url ? [project.cover_image_url] : []),
    ...(project.rpps.files ?? []).filter((file) => file.kind === "image" && Boolean(file.url)).map((file) => file.url as string),
  ].filter((url, index, all) => all.indexOf(url) === index).slice(0, 4);
}

const workflow = [
  { to: "/projects", icon: Package, title: "1. Discover a design", text: "Browse source-linked open robotics projects and clearly labeled commercial showcases." },
  { to: "/projects/new", icon: Layers3, title: "2. Import or upload", text: "Analyze repositories, BOMs, robot descriptions, CAD metadata, firmware, and documentation." },
  { to: "/boms", icon: Boxes, title: "3. Inspect the BOM", text: "Keep verified, probable, unresolved, fabricated, optional, and unpriced lines visible." },
  { to: "/builder", icon: Truck, title: "4. Plan sourcing", text: "Compare whole-build baskets, suppliers, substitutions, lead times, and split deliveries." },
  { to: "/builder", icon: GitFork, title: "5. Reproduce or fork", text: "Lock a build to a release, modify it, and preserve upstream attribution and lineage." },
  { to: "/community", icon: MessageSquare, title: "6. Share evidence", text: "Publish build results, issues, corrections, discussions, and derivative projects." },
];

export default function Index() {
  const components = useComponents({ limit: 8 });
  const suppliers = useSuppliers();
  const projects = useQuery({ queryKey: ["home-projects"], queryFn: () => listProjectsPage(1, 6) });
  const showcases = useQuery({ queryKey: ["home-showcases"], queryFn: () => listProjectsPage(1, 8, { kind: "commercial_showcase" }) });
  const boms = useQuery({ queryKey: ["home-boms"], queryFn: ({ signal }) => bomsApi.list(signal) });
  const marketplace = useMarketplace({ type: "sell" });
  const projectRows = projects.data?.items ?? [];
  const showcaseRows = showcases.data?.items ?? [];
  const humanoidRows = showcaseRows.filter((project) => project.robot_category === "humanoid");
  const featuredShowcases = humanoidRows.length > 0 ? humanoidRows : showcaseRows;
  const liveComponents = (components.data?.items ?? []).filter((item) => !item.isDemo);
  const liveListings = (marketplace.data?.items ?? []).filter((item) => !item.isDemo);
  const liveSuppliers = (suppliers.data?.items ?? []).filter((item) => !item.isDemo);

  return <main>
    <section className="border-b border-border bg-surface/40">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 lg:grid-cols-[1.25fr_.75fr] lg:py-16">
        <div>
          <div className="section-title mb-2">Build robots from real designs</div>
          <h1 className="max-w-4xl text-3xl font-bold leading-tight tracking-tight md:text-5xl">Find the project. Compile the BOM. Source the complete build.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">RoboPartPicker aggregates robotics designs, preserves their source and revision, extracts parts lists, prices every line it can, and turns the result into a supplier and delivery plan. Missing evidence stays visible.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/projects" className="btn-primary inline-flex items-center gap-1">Explore robotics projects <ArrowRight className="h-3.5 w-3.5" /></Link>
            <Link to="/projects/new" className="btn-ghost">Import a project</Link>
            <Link to="/developers" className="btn-ghost">Connect an agent</Link>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="pill pill-good">Project-first catalog</span>
            <span className="pill">Line-level BOM evidence</span>
            <span className="pill">Whole-build sourcing</span>
            <span className="pill">Fork and lineage</span>
          </div>
        </div>
        <div className="surface-card grid grid-cols-2 divide-x divide-y divide-border overflow-hidden self-start">
          <Metric label="Robotics projects" value={projects.data?.total} />
          <Metric label="BOMs" value={boms.data?.total} />
          <Metric label="Components" value={components.data?.total} />
          <Metric label="Suppliers" value={suppliers.isLoading ? undefined : liveSuppliers.length} />
        </div>
      </div>
    </section>

    <div className="mx-auto max-w-[1400px] space-y-10 px-4 py-8">
      <section>
        <div className="mb-3 flex items-end justify-between gap-4"><div><div className="section-title">The product spine</div><h2 className="text-xl font-bold">From an upstream design to a buildable procurement plan</h2></div></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{workflow.map(({ to, icon: Icon, title, text }) => <Link key={title} to={to} className="surface-card surface-card-hover p-4"><Icon className="h-5 w-5 text-primary" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></Link>)}</div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between"><div><div className="section-title">Robotics project catalog</div><h2 className="text-xl font-bold">Popular source-linked projects</h2><p className="mt-1 text-xs text-muted-foreground">A repository is not called reproducible until its license, revision, BOM, files, and evidence support that claim.</p></div><Link to="/projects" className="text-xs hover:text-primary">Browse all {projects.data?.total?.toLocaleString() ?? ""} →</Link></div>
        {projects.isLoading ? <State>Loading projects…</State> : projects.error ? <State error>{projects.error.message}</State> : <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{projectRows.map((project) => { const media = projectMedia(project); return <Link key={project.id} to={`/projects/${project.slug}`} className="surface-card surface-card-hover overflow-hidden"><div className="aspect-[16/7] bg-muted">{media.length ? <div className="grid h-full grid-cols-4 gap-0.5">{media.map((url, index) => <img key={url} src={url} alt="" className={`${index === 0 && media.length > 1 ? "col-span-3" : media.length === 1 ? "col-span-4" : ""} h-full w-full object-cover`} loading="lazy" />)}</div> : <div className="grid h-full place-items-center text-muted-foreground"><Package className="h-8 w-8 opacity-40" /></div>}</div><div className="p-3"><div className="flex items-start justify-between gap-3"><span className="font-semibold">{project.name}</span><span className={`pill ${project.license ? "pill-good" : "pill-yellow"}`}>{project.license ? project.license : "license unclear"}</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{project.summary ?? "Source-linked robotics project. Structured summary enrichment is pending."}</p><div className="mt-3 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground"><span>{project.bom_line_count ?? project.rpps.bom?.length ?? 0} BOM lines</span><span>{project.githubStars?.toLocaleString() ?? "—"} stars</span><span>{project.publishability}</span></div></div></Link>; })}</div>}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between"><div><div className="section-title">Closed-source humanoid showcase</div><h2 className="text-xl font-bold">Commercial humanoid robots</h2><p className="mt-1 text-xs text-muted-foreground">Vendor-published systems are tracked separately from open designs. If no humanoids are indexed yet, the section falls back to other commercial showcases instead of disappearing.</p></div><Link to="/projects?kind=commercial_showcase&category=humanoid" className="text-xs hover:text-primary">All humanoids →</Link></div>
        {showcases.isLoading ? <State>Loading commercial showcases…</State> : showcases.error ? <State error>{showcases.error.message}</State> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{featuredShowcases.slice(0, 8).map((project) => { const media = projectMedia(project); return <Link key={project.id} to={`/projects/${project.slug}`} className="surface-card surface-card-hover overflow-hidden"><div className="aspect-[16/9] bg-muted">{media.length ? <div className="grid h-full grid-cols-4 gap-0.5">{media.map((url, index) => <img key={url} src={url} alt="" className={`${index === 0 && media.length > 1 ? "col-span-3" : media.length === 1 ? "col-span-4" : ""} h-full w-full object-cover`} loading="lazy" />)}</div> : <div className="grid h-full place-items-center text-muted-foreground"><Package className="h-8 w-8 opacity-40" /></div>}</div><div className="p-3"><div className="flex items-start justify-between gap-2"><span className="font-semibold text-[13px] leading-tight">{project.name}</span><span className="pill pill-yellow shrink-0">{project.robot_category === "humanoid" ? "closed-source" : "commercial"}</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{project.summary ?? (project.robot_category === "humanoid" ? "Closed-source commercial humanoid showcase." : "Closed-source commercial robot showcase.")}</p><div className="mt-2 text-[10px] text-muted-foreground">{project.maintainer ?? "Vendor"}</div></div></Link>; })}</div>}
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Roadmap icon={Bot} title="AI robotics workspace" text="Coming soon: an AI-native workspace for changing CAD, project descriptions, firmware context, and BOMs with reviewable diffs." />
        <Roadmap icon={PlugZap} title="Automated supplier outreach" text="Coming soon: provider-backed RFQ delivery and automatic response ingestion. Current workflows prepare and reconcile quotes without pretending a draft was sent." />
        <Roadmap icon={ShoppingBag} title="Design marketplace" text="List custom designs, parts, robots, services, and wanted requests now. AI-assisted uploads and managed payments remain future integrations." />
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between"><div><div className="section-title">Supporting component intelligence</div><h2 className="text-lg font-bold">Recently indexed parts and observed offers</h2></div><Link to="/parts/actuator" className="text-xs hover:text-primary">Full component catalog →</Link></div>
        {components.isLoading ? <State>Loading from D1…</State> : components.error ? <State error>{components.error.message}</State> : liveComponents.length === 0 ? <ComingSoon icon={Boxes} kicker="Coming soon" title="Component catalog not yet available" body="No real, non-demo component records are published yet. Demonstration fixtures with fabricated pricing and offers are withheld from this view." actionLabel="Submit a component" actionTo="/parts/actuator" /> : <div className="surface-card overflow-x-auto"><table className="data-table min-w-[850px]"><thead><tr><th>Component</th><th>Maker</th><th>Category</th><th className="text-right">Known offers</th><th className="text-right">Lowest observed</th><th>Freshness</th></tr></thead><tbody>{liveComponents.map((part) => { const price = lowestLivePrice(part); return <tr key={part.id}><td><Link className="font-medium hover:text-primary" to={`/parts/${part.category}/${part.slug}`}>{part.name}</Link></td><td>{part.maker}</td><td className="uppercase text-muted-foreground">{part.category}</td><td className="text-right mono">{liveOffers(part).length}</td><td className="text-right mono">{price != null ? `$${price.toLocaleString()}` : "—"}</td><td className="text-xs text-muted-foreground">{part.freshnessAt ? new Date(part.freshnessAt).toLocaleDateString() : "unknown"}</td></tr>; })}</tbody></table></div>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section><div className="mb-3 flex justify-between"><div><div className="section-title">Marketplace</div><h2 className="font-bold">Parts, designs, robots, and services</h2></div><Link to="/marketplace" className="text-xs hover:text-primary">Marketplace →</Link></div><div className="space-y-2">{liveListings.length === 0 ? <div className="surface-card p-4 text-sm text-muted-foreground">No public listings have been published yet. <Link to="/marketplace" className="text-primary hover:underline">Go to the marketplace</Link> to create the first one.</div> : liveListings.slice(0, 4).map((listing) => <Link key={listing.id} to={`/marketplace/${listing.slug}`} className="surface-card surface-card-hover flex items-center justify-between gap-4 p-3"><div><div className="font-medium">{listing.title}</div><div className="text-[10px] text-muted-foreground">{listing.category} · {listing.region ?? "region n/a"}</div></div><div className="mono text-sm font-semibold">{listing.price == null ? "Quote" : `${listing.currency} ${listing.price.toLocaleString()}`}</div></Link>)}</div></section>
        <section className="surface-card p-5"><div className="section-title">For suppliers, project owners, and partners</div><h2 className="mt-1 text-lg font-bold">Add data without buying placement in technical results</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Claim a project, improve its BOM, publish a supplier profile, list fabrication services, or discuss a clearly labeled sponsorship. Organic ranking and evidence quality remain separate from advertising.</p><div className="mt-4 flex flex-wrap gap-2"><Link to="/partners" className="btn-primary">Partnership options</Link><Link to="/developers" className="btn-ghost">MCP and APIs</Link></div></section>
      </div>
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: number | undefined }) { return <div className="p-5"><div className="section-title">{label}</div><div className="mt-1 mono text-2xl font-bold">{value?.toLocaleString() ?? "—"}</div></div>; }
function State({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return <div className={`surface-card p-5 text-center text-sm ${error ? "text-negative" : "text-muted-foreground"}`}>{children}</div>; }
function Roadmap({ icon: Icon, title, text }: { icon: typeof Bot; title: string; text: string }) { return <div className="surface-card p-4"><div className="flex items-center justify-between"><Icon className="h-5 w-5 text-primary" /><span className="pill pill-yellow">coming soon</span></div><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>; }
