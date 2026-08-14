import {
  ArrowRight,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  CircleDot,
  Code2,
  Factory,
  FileBox,
  GitFork,
  Github,
  PackageCheck,
  Search,
  Sparkles,
  Store,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageMeta } from "@/components/PageMeta";

const liveNow = [
  "A source-linked catalog of robotics projects and commercial showcases",
  "Project provenance, revision, license, file, and BOM evidence where available",
  "Component, supplier, marketplace, import, fork, and public MCP foundations",
  "Honest unresolved and unpriced states instead of invented completeness",
];

const beingBuilt = [
  "Automatic BOM extraction and validation across CAD, documentation, and repositories",
  "Source-backed pricing for every resolvable BOM line and supplier quote requests",
  "Whole-build optimization across cost, substitutions, lead time, and split deliveries",
  "An AI-native robotics workspace and mature creator marketplace workflows",
];

const steps = [
  {
    icon: Search,
    number: "01",
    title: "Find a real design",
    text: "Start from a source-linked robot, mechanism, controller, sensor stack, or commercial showcase instead of another disconnected product page.",
  },
  {
    icon: FileBox,
    number: "02",
    title: "Understand the build",
    text: "Bring the exact revision, files, license, documentation, and bill of materials into one evidence-aware project record.",
  },
  {
    icon: PackageCheck,
    number: "03",
    title: "Source the whole BOM",
    text: "Resolve parts, compare suppliers and substitutions, request missing quotes, and see the real gaps before spending money.",
  },
  {
    icon: GitFork,
    number: "04",
    title: "Reproduce or improve it",
    text: "Build a versioned release, document what changed, and publish a derivative without losing attribution or provenance.",
  },
];

const audiences = [
  { icon: Wrench, title: "Builders", text: "Go from “I want to build that” to a concrete, sourceable plan." },
  { icon: Users, title: "Teams and educators", text: "Standardize builds, revisions, procurement evidence, and handoffs." },
  { icon: Sparkles, title: "Project maintainers", text: "Make a design easier to reproduce, support, fork, and discover." },
  { icon: Factory, title: "Suppliers and fabricators", text: "Respond to structured demand tied to real projects and BOM lines." },
];

const faqs = [
  {
    question: "Is RoboPartPicker only for open-source robots?",
    answer: "No. Open designs are the core because they can be reproduced and improved. Closed-source projects can also appear as clearly labeled showcases, but they are not presented as reproducible when the necessary files or rights are unavailable.",
  },
  {
    question: "Can I buy a complete robot build today?",
    answer: "Not yet as a guaranteed one-click checkout. The catalog, project records, BOMs, supplier data, and sourcing foundations are live. Automated supplier outreach, reconciled quotes, and delivery coordination are still being completed and are labeled accordingly.",
  },
  {
    question: "Will every price and compatibility claim be reliable?",
    answer: "The goal is traceable evidence, not false certainty. Observed prices can change, quotes are not binding until a supplier confirms them, and unresolved or unpriced BOM lines stay visible. Provenance and freshness matter as much as the number shown.",
  },
  {
    question: "Can I modify and sell my own designs?",
    answer: "Project importing, forking, lineage, and marketplace foundations exist now. The full AI-assisted workspace and creator-grade publishing and selling journey are part of the active roadmap.",
  },
  {
    question: "Can agents and developer tools use the data?",
    answer: "Yes. RoboPartPicker exposes a public read-only MCP endpoint and developer documentation today, with authenticated project workflows expanding over time.",
  },
];

export default function About() {
  return (
    <div className="overflow-hidden">
      <PageMeta
        title="What is RoboPartPicker? | Build real robots from proven designs"
        description="RoboPartPicker brings robotics designs, files, BOMs, parts, suppliers, pricing evidence, and build lineage into one place so real robots are easier to reproduce."
        path="/about"
      />

      <section className="relative border-b border-border bg-surface/40">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-50" />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-10 px-4 py-14 md:py-20 lg:grid-cols-[1.08fr_.92fr] lg:py-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
              <CircleDot className="h-3 w-3 text-primary" /> Robotics should be reproducible
            </div>
            <h1 className="mt-5 max-w-4xl text-4xl font-bold leading-[1.04] tracking-[-0.035em] sm:text-5xl md:text-6xl">
              Build real robots from proven designs, <span className="bg-primary px-1 text-primary-foreground">not scattered tabs.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
              RoboPartPicker is building the missing layer between discovering a robotics project and actually reproducing it: the files, exact revision, BOM, parts, suppliers, prices, quotes, delivery plan, and build lineage in one place.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/projects" className="btn-primary px-4 py-2 text-sm">
                Explore robotics projects <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/community/new" className="btn-ghost px-4 py-2 text-sm">
                Tell us what you would build
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-positive" /> Source-linked projects</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-positive" /> Evidence-aware BOMs</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-positive" /> Honest missing data</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="absolute -inset-5 rotate-2 rounded-2xl bg-primary/20 blur-sm" />
            <div className="surface-card relative overflow-hidden shadow-2xl shadow-foreground/10">
              <div className="flex items-center justify-between border-b border-border bg-foreground px-4 py-3 text-background">
                <div className="flex items-center gap-2 text-xs font-semibold"><Bot className="h-4 w-4 text-primary" /> BUILD BRIEF</div>
                <span className="mono text-[10px] text-background/60">REVISION LOCKED</span>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                <FlowRow icon={FileBox} label="Design" value="Files + revision + license" status="source linked" />
                <FlowConnector />
                <FlowRow icon={Boxes} label="BOM" value="Required + optional + fabricated" status="gaps visible" />
                <FlowConnector />
                <FlowRow icon={Store} label="Sourcing" value="Offers + substitutes + quotes" status="evidence first" />
                <FlowConnector />
                <FlowRow icon={Truck} label="Delivery" value="Supplier groups + lead times" status="being built" pending />
              </div>
              <div className="grid grid-cols-3 border-t border-border bg-surface text-center">
                <MiniMetric value="CAD" label="files" />
                <MiniMetric value="BOM" label="parts" />
                <MiniMetric value="RFQ" label="quotes" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-foreground text-background">
        <div className="mx-auto grid max-w-[1240px] gap-6 px-4 py-8 md:grid-cols-[.7fr_1.3fr] md:items-center">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">The problem</div>
            <h2 className="mt-2 text-2xl font-bold leading-tight md:text-3xl">A repository is not a build plan.</h2>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-background/70 md:text-base md:leading-7">
            Robotics knowledge is split across repositories, CAD portals, spreadsheets, forum posts, distributor pages, and private supplier conversations. Even excellent designs become difficult to reproduce when revisions drift, BOM lines lack identities, prices expire, or fabrication steps disappear. RoboPartPicker connects those fragments into an auditable path from design to physical build.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-4 py-14 md:py-20">
        <div className="max-w-2xl">
          <div className="section-title">How it should work</div>
          <h2 className="mt-2 text-3xl font-bold">From “that robot is cool” to “here is how we build it.”</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">One continuous, evidence-aware workflow instead of a new spreadsheet at every step.</p>
        </div>
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, number, title, text }) => (
            <article key={number} className="bg-card p-5 md:p-6">
              <div className="flex items-center justify-between"><Icon className="h-6 w-6 text-primary" /><span className="mono text-xs text-muted-foreground">{number}</span></div>
              <h3 className="mt-8 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface/60">
        <div className="mx-auto max-w-[1240px] px-4 py-14 md:py-20">
          <div className="grid gap-5 lg:grid-cols-2">
            <StatusPanel title="Useful today" eyebrow="Live now" items={liveNow} tone="live" />
            <StatusPanel title="The complete product" eyebrow="Actively being built" items={beingBuilt} tone="roadmap" />
          </div>
          <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
            We label unfinished workflows instead of using a polished mock to imply they already work. If evidence is missing, the product should say so.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-4 py-14 md:py-20">
        <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <div className="section-title">Who this is for</div>
            <h2 className="mt-2 text-3xl font-bold">A shared system for everyone between the design and the finished robot.</h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">The same project record can help a hobbyist understand the build, a lab reproduce it, a maintainer support it, and a supplier quote it.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {audiences.map(({ icon: Icon, title, text }) => (
              <div key={title} className="surface-card p-5">
                <div className="grid h-9 w-9 place-items-center rounded bg-primary/15"><Icon className="h-5 w-5 text-foreground" /></div>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-foreground text-background">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-12 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary"><Code2 className="h-4 w-4" /> Open data interface</div>
            <h2 className="mt-2 text-2xl font-bold md:text-3xl">Built for humans, agents, and robotics tools.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-background/70">The public MCP endpoint lets compatible AI agents search project, component, and supplier data. The platform itself is open source so its claims and progress can be inspected.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/developers" className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Developers & MCP <ChevronRight className="h-4 w-4" /></Link>
            <a href="https://github.com/lucadominguez/robopartpicker" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded border border-background/25 px-4 py-2 text-sm font-semibold hover:bg-background/10"><Github className="h-4 w-4" /> GitHub</a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[900px] px-4 py-14 md:py-20">
        <div className="text-center">
          <div className="section-title">Questions before you share it</div>
          <h2 className="mt-2 text-3xl font-bold">What RoboPartPicker is, and is not, today.</h2>
        </div>
        <div className="mt-8 divide-y divide-border border-y border-border">
          {faqs.map(({ question, answer }) => (
            <details key={question} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold">
                {question}<span className="text-lg text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="max-w-3xl pt-3 text-xs leading-5 text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-4 pb-8 md:pb-12">
        <div className="relative mx-auto max-w-[1240px] overflow-hidden rounded-xl border border-primary/40 bg-primary p-7 text-primary-foreground md:p-12">
          <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
          <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]">Help validate the idea</div>
              <h2 className="mt-2 max-w-3xl text-3xl font-bold leading-tight md:text-4xl">What would you build if the files, BOM, sourcing, and delivery plan were already connected?</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-primary-foreground/75">Explore what exists, then tell us which project or missing workflow would make RoboPartPicker genuinely useful to you.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/projects" className="inline-flex items-center gap-2 rounded bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/90">Browse projects <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/community/new" className="inline-flex items-center gap-2 rounded border border-primary-foreground/30 bg-primary-foreground/10 px-4 py-2 text-sm font-semibold hover:bg-primary-foreground/20">Share your use case</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FlowRow({ icon: Icon, label, value, status, pending = false }: { icon: typeof FileBox; label: string; value: string; status: string; pending?: boolean }) {
  return <div className="flex items-center gap-3"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded border ${pending ? "border-dashed border-border bg-muted" : "border-primary/40 bg-primary/10"}`}><Icon className={`h-5 w-5 ${pending ? "text-muted-foreground" : "text-foreground"}`} /></div><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-2"><span className="text-xs font-semibold">{label}</span><span className={`pill ${pending ? "pill-warn" : "pill-good"}`}>{status}</span></div><div className="mt-0.5 truncate text-[11px] text-muted-foreground">{value}</div></div></div>;
}

function FlowConnector() {
  return <div className="ml-5 h-3 border-l border-dashed border-border" />;
}

function MiniMetric({ value, label }: { value: string; label: string }) {
  return <div className="border-r border-border px-2 py-3 last:border-r-0"><div className="mono text-sm font-bold">{value}</div><div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div></div>;
}

function StatusPanel({ title, eyebrow, items, tone }: { title: string; eyebrow: string; items: string[]; tone: "live" | "roadmap" }) {
  const live = tone === "live";
  return <article className={`surface-card overflow-hidden ${live ? "border-[hsl(var(--positive)/.35)]" : "border-primary/40"}`}><div className={`border-b border-border px-5 py-4 ${live ? "bg-[hsl(var(--positive)/.08)]" : "bg-primary/10"}`}><div className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${live ? "text-positive" : "text-foreground"}`}>{eyebrow}</div><h2 className="mt-1 text-xl font-bold">{title}</h2></div><ul className="space-y-3 p-5">{items.map(item => <li key={item} className="flex gap-3 text-xs leading-5 text-muted-foreground">{live ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" /> : <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}{item}</li>)}</ul></article>;
}
