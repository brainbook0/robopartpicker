import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Bot, Boxes, GitFork, Layers3, MessageCircle, MessageSquare, Package, PlugZap, ShoppingBag, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { useComponents } from "@/lib/api/catalog";
import { useMarketplace } from "@/lib/api/marketplace";

import { listProjectsPage } from "@/lib/projects";
import { ProjectPreviewCard } from "@/components/projects/ProjectPreviewCard";
import { BuildWorkspacePreview } from "@/components/home/BuildWorkspacePreview";
import { FeaturedProjectScroller } from "@/components/home/FeaturedProjectScroller";
import { ProductStatusBadge } from "@/components/common/ProductStatusBadge";
import { PRODUCT_STATUSES, type ProductStatus } from "@/lib/product-status";
import { DISCORD_INVITE_URL, SOCIAL_LINKS } from "@/lib/site-config";

const workflow = [
  { to: "/projects", icon: Package, title: "1. Discover a design", text: "Browse source-linked open robotics projects and clearly labeled commercial showcases." },
  { to: "/projects/new", icon: Layers3, title: "2. Import or upload", text: "Analyze repositories, BOMs, robot descriptions, CAD metadata, firmware, and documentation.", status: PRODUCT_STATUSES.projectImport },
  { to: "/boms", icon: Boxes, title: "3. Inspect the BOM", text: "Keep verified, probable, unresolved, fabricated, optional, and unpriced lines visible." },
  { to: "/suppliers", icon: Truck, title: "4. Generate the completed quote", text: "Use fresh verified internal prices, review each itemized line, and exclude shipping and tax explicitly.", status: PRODUCT_STATUSES.completedQuotes },
  { to: "/builder", icon: GitFork, title: "5. Reproduce or fork", text: "Lock a build to a release, modify it, and preserve upstream attribution and lineage.", status: PRODUCT_STATUSES.buildWorkspace },
  { to: "/community", icon: MessageSquare, title: "6. Share evidence", text: "Publish build results, issues, corrections, discussions, and derivative projects." },
];

export default function Index() {
  const components = useComponents({ limit: 8 });
  const [featuredMode, setFeaturedMode] = useState<"open" | "closed">("open");

  const openFeatured = useQuery({
    queryKey: ["home-featured", "completeness", "open"],
    queryFn: () => listProjectsPage(1, 6, { kind: "physical_design", sort: "completeness" }),
    enabled: featuredMode === "open",
  });
  const closedFeatured = useQuery({
    queryKey: ["home-featured", "completeness", "closed"],
    queryFn: () => listProjectsPage(1, 6, { kind: "commercial_showcase", category: "humanoid", sort: "completeness" }),
    enabled: featuredMode === "closed",
  });
  const featuredProjects = featuredMode === "open" ? openFeatured : closedFeatured;
  const projects = useQuery({ queryKey: ["home-projects"], queryFn: () => listProjectsPage(1, 6, { sort: "popularity" }) });
  const showcases = useQuery({
    queryKey: ["home-showcases", "humanoid"],
    queryFn: () => listProjectsPage(1, 8, { kind: "commercial_showcase", category: "humanoid", sort: "trend" }),
  });

  const marketplace = useMarketplace({ type: "sell" });
  const projectRows = projects.data?.items ?? [];
  const featuredShowcases = showcases.data?.items ?? [];
  const liveListings = (marketplace.data?.items ?? []).filter((item) => !item.isDemo);



  return <main>
    <section className="border-b border-border bg-surface/40">
      <div className="mx-auto max-w-[1400px] px-4 py-8 lg:py-10">
        <div className="grid min-w-0 gap-x-6 gap-y-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,.95fr)] lg:grid-rows-[auto_auto] lg:items-start">
          <div className="min-w-0 py-2 lg:py-5">
            <div className="section-title mb-2">Build robots from real designs</div>
            <h1 className="max-w-4xl text-3xl font-bold leading-tight tracking-tight md:text-5xl">Find the project. Compile the BOM. Source the complete build.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">RoboPartPicker preserves a project's source and revision, extracts BOM candidates from documents and supported CAD, keeps unresolved evidence visible, and generates a completed itemized quote only after every required line is confirmed and freshly priced.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/projects" className="btn-primary inline-flex items-center gap-1">Explore robotics projects <ArrowRight className="h-3.5 w-3.5" /></Link>
              <Link to="/projects/new" className="btn-ghost">Import a project <ProductStatusBadge status={PRODUCT_STATUSES.projectImport} className="px-1 py-0 text-[8px]" /></Link>
              <Link to="/developers" className="btn-ghost">Connect an agent</Link>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="pill pill-good">Project-first catalog</span>
              <span className="pill">Line-level BOM evidence</span>
              <span className="pill">Completed quote email</span>
              <span className="pill">Fork and lineage</span>
            </div>
          </div>
          <div className="min-w-0 lg:row-span-2 lg:col-start-2 lg:row-start-1">
            <FeaturedProjectScroller projects={featuredProjects.data?.items ?? []} loading={featuredProjects.isLoading} mode={featuredMode} onModeChange={setFeaturedMode} />
          </div>
          <div data-home-catalog-metrics className="surface-card grid grid-cols-3 divide-x divide-border overflow-hidden lg:col-start-1 lg:row-start-2">
            <Metric label="Robotics projects" value={projects.data?.total} />
            <Metric label="Normalized BOM lines" value={projects.data?.stats?.totalParts} />
            <Metric label="Components" value={components.data?.total} />
          </div>
        </div>
      </div>
    </section>

    <div className="mx-auto max-w-[1400px] space-y-10 px-4 py-8">
      <section>
        <div className="mb-3 flex items-end justify-between gap-4"><div><div className="section-title">The product spine</div><h2 className="text-xl font-bold">From an upstream design to a buildable procurement plan</h2></div></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{workflow.map(({ to, icon: Icon, title, text, status }) => <Link key={title} to={to} className="surface-card surface-card-hover p-4"><div className="flex items-center justify-between gap-2"><Icon className="h-5 w-5 text-primary" />{status && <ProductStatusBadge status={status} />}</div><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></Link>)}</div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between"><div><div className="section-title">Robotics project catalog</div><h2 className="text-xl font-bold">Popular source-linked projects</h2><p className="mt-1 text-xs text-muted-foreground">A repository is not called reproducible until its license, revision, BOM, files, and evidence support that claim.</p></div><Link to="/projects" className="text-xs hover:text-primary">Browse all {projects.data?.total?.toLocaleString() ?? ""} →</Link></div>
        {projects.isLoading ? <State>Loading projects…</State> : projects.error ? <State error>{projects.error.message}</State> : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {projectRows.map((project) => <ProjectPreviewCard key={project.id} project={project} variant="catalog" />)}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between"><div><div className="section-title">Closed-source humanoid showcase</div><h2 className="text-xl font-bold">Commercial humanoid robots</h2><p className="mt-1 text-xs text-muted-foreground">Vendor-published systems are tracked separately from open designs. If no humanoids are indexed yet, the section falls back to other commercial showcases instead of disappearing.</p></div><Link to="/projects?kind=commercial_showcase&category=humanoid" className="text-xs hover:text-primary">All humanoids →</Link></div>
        {showcases.isLoading ? <State>Loading commercial showcases…</State> : showcases.error ? <State error>{showcases.error.message}</State> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {featuredShowcases.slice(0, 8).map((project) => <ProjectPreviewCard key={project.id} project={project} variant="compact" />)}
          </div>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Roadmap icon={Bot} title="AI robotics workspace" text="Coming soon: an AI-native workspace for changing CAD, project descriptions, firmware context, and BOMs with reviewable diffs." status={PRODUCT_STATUSES.futureBuildWorkspace} />
        <Roadmap icon={PlugZap} title="Completed quote email" text="Generate a frozen itemized quote from a confirmed BOM, preview it, then send one isolated message per recipient after a second confirmation." status={PRODUCT_STATUSES.completedQuotes} />
        <Roadmap icon={ShoppingBag} title="Design marketplace" text="List custom designs, parts, robots, services, and wanted requests now. AI-assisted uploads and managed payments remain future integrations." status={PRODUCT_STATUSES.marketplacePublishing} />
      </section>

      <CommunityCTA />

      <BuildWorkspacePreview />

      <div className="grid gap-6 lg:grid-cols-2">
        <section><div className="mb-3 flex justify-between"><div><div className="flex items-center gap-2"><div className="section-title">Marketplace</div><ProductStatusBadge status={PRODUCT_STATUSES.marketplacePublishing} /></div><h2 className="font-bold">Parts, designs, robots, and services</h2></div><Link to="/marketplace" className="text-xs hover:text-primary">Marketplace →</Link></div><div className="space-y-2">{liveListings.length === 0 ? <div className="surface-card p-4 text-sm text-muted-foreground">No public listings have been published yet. <Link to="/marketplace" className="text-primary hover:underline">Go to the marketplace</Link> to create the first one.</div> : liveListings.slice(0, 4).map((listing) => <Link key={listing.id} to={`/marketplace/${listing.slug}`} className="surface-card surface-card-hover flex items-center justify-between gap-4 p-3"><div><div className="font-medium">{listing.title}</div><div className="text-[10px] text-muted-foreground">{listing.category} · {listing.region ?? "region n/a"}</div></div><div className="mono text-sm font-semibold">{listing.price == null ? "Quote" : `${listing.currency} ${listing.price.toLocaleString()}`}</div></Link>)}</div></section>
        <section className="surface-card p-5"><div className="section-title">For project owners and partners</div><h2 className="mt-1 text-lg font-bold">Improve source-backed BOM coverage</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Claim a project, pin its revision, attach better CAD or BOM exports, resolve exact part identities, or discuss a clearly labeled partnership. Payment never changes technical evidence or quote eligibility.</p><div className="mt-4 flex flex-wrap gap-2"><Link to="/partners" className="btn-primary">Partnership options</Link><Link to="/developers" className="btn-ghost">MCP and APIs</Link></div></section>
      </div>
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: number | string | undefined }) { return <div className="p-4 sm:p-5"><div className="section-title">{label}</div><div className="mt-1 mono text-xl font-bold sm:text-2xl">{typeof value === "number" ? value.toLocaleString() : value ?? "Loading"}</div></div>; }
function State({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return <div className={`surface-card p-5 text-center text-sm ${error ? "text-negative" : "text-muted-foreground"}`}>{children}</div>; }
function Roadmap({ icon: Icon, title, text, status }: { icon: typeof Bot; title: string; text: string; status: ProductStatus }) { return <div className="surface-card p-4"><div className="flex items-center justify-between"><Icon className="h-5 w-5 text-primary" /><ProductStatusBadge status={status} /></div><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>; }

function CommunityCTA() {
  return (
    <section className="surface-card overflow-hidden p-0">
      <div className="grid gap-0 md:grid-cols-[1fr_1fr]">
        <div className="p-6 lg:p-8">
          <div className="section-title">Join the build</div>
          <h2 className="mt-1 text-xl font-bold">Robotics builders, source-checkers, and BOM wranglers wanted</h2>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            RoboPartPicker is early. Supplier lists and quotes are still being verified. If you build robots,
            maintain an open-source design, or want to help source and validate BOMs, this is the ground floor.
            Join the Discord to shape what the platform becomes.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" /> Join the Discord
            </a>
            <Link to="/community" className="btn-ghost inline-flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Community forum
            </Link>
            <Link to="/projects/new" className="btn-ghost">Import your project</Link>
          </div>
        </div>
        <div className="border-t border-border bg-muted/30 p-6 md:border-l md:border-t-0 lg:p-8">
          <div className="section-title">What's coming</div>
          <ul className="mt-3 space-y-2.5 text-xs leading-5 text-muted-foreground">
            <li className="flex gap-2"><span className="pill pill-good shrink-0 text-[9px]">live</span> Project discovery with source-linked BOMs</li>
            <li className="flex gap-2"><span className="pill pill-good shrink-0 text-[9px]">live</span> Normalized BOM lines with evidence tracking</li>
            <li className="flex gap-2"><span className="pill pill-yellow shrink-0 text-[9px]">beta</span> AI-assisted project import and BOM generation</li>
            <li className="flex gap-2"><span className="pill pill-yellow shrink-0 text-[9px]">beta</span> Completed quote email delivery</li>
            <li className="flex gap-2"><span className="pill shrink-0 text-[9px]">next</span> Supplier verification and real-time price indexing</li>
            <li className="flex gap-2"><span className="pill shrink-0 text-[9px]">next</span> Build workspace with revision locking and forking</li>
            <li className="flex gap-2"><span className="pill shrink-0 text-[9px]">next</span> Community-contributed supplier reviews and teardowns</li>
          </ul>
          <p className="mt-4 text-[11px] text-muted-foreground">
            Supplier coverage is partial. Prices shown are estimates, not binding quotes. We are building this in the open.
          </p>
        </div>
      </div>
    </section>
  );
}
