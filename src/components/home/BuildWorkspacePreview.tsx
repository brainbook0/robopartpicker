import { Boxes, CheckCircle2, Clock3, PackageSearch, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export function BuildWorkspacePreview() {
  return (
    <section aria-label="Build Workspace preview" className="overflow-hidden border border-primary/30 bg-background">
      <div className="grid lg:grid-cols-[0.8fr_1.2fr]">
        <div className="border-b border-border bg-primary/5 p-5 lg:border-b-0 lg:border-r"><div className="flex items-center justify-between gap-3"><span className="section-title text-primary">Build Workspace</span><span className="inline-flex items-center gap-1 border border-primary/30 bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary"><Clock3 className="h-3 w-3" /> Coming soon</span></div><h2 className="mt-3 text-xl font-bold">Keep every robot build serviceable</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Track what is installed, preserve the exact BOM revision, find compatible replacements, and fold approved changes back into the build without losing source history.</p><ul className="mt-4 grid gap-2 text-[11px]"><Feature icon={Boxes} title="Installed-part inventory" body="Quantity, revision, condition and build location." /><Feature icon={PackageSearch} title="Replacement compatibility" body="Exact identity first; substitutions remain reviewable." /><Feature icon={RefreshCw} title="BOM revision control" body="Upstream changes never silently alter an active build." /></ul><Link to="/builder" className="btn-primary mt-4 inline-flex">Explore current build tools</Link></div>

        <div className="min-w-0 p-4">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-3"><div><div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Workspace preview</div><div className="mt-1 text-sm font-semibold">Warehouse Rover · build 02</div></div><span className="inline-flex items-center gap-1 text-[10px] font-medium text-positive"><CheckCircle2 className="h-3.5 w-3.5" /> BOM locked</span></div>
          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
            <div className="overflow-hidden border border-border"><div className="grid grid-cols-[minmax(0,1fr)_70px_90px] border-b border-border bg-muted/35 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"><span>Installed component</span><span>Qty</span><span>State</span></div>{[
              ["Drive actuator · MX-64", "4", "verified"],
              ["Motor driver · current rev", "2", "tracked"],
              ["Depth sensor · replacement due", "1", "review"],
            ].map(([name, quantity, state]) => <div key={name} className="grid min-w-0 grid-cols-[minmax(0,1fr)_70px_90px] border-b border-border/60 px-3 py-2 text-[10.5px] last:border-b-0"><span className="truncate font-medium">{name}</span><span className="font-mono">{quantity}</span><span className={state === "review" ? "text-warning" : "text-muted-foreground"}>{state}</span></div>)}</div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-border text-[10.5px] md:grid-cols-1"><WorkspaceState label="BOM revision" value="r18 · locked" /><WorkspaceState label="Replacement compatibility" value="1 review open" /><WorkspaceState label="Price watch" value="Coming soon" /><WorkspaceState label="Availability watch" value="Coming soon" /></dl>
          </div>
          <div className="mt-3 flex items-start gap-2 border border-border bg-muted/20 p-3 text-[10.5px] leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Replacement suggestions will preserve manufacturer identity, source evidence and fit constraints. Nothing is incorporated into a build without review.</span></div>
        </div>
      </div>
    </section>
  );
}

function Feature({ icon: Icon, title, body }: { icon: typeof Boxes; title: string; body: string }) {
  return <li className="flex items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><div className="font-semibold">{title}</div><div className="text-muted-foreground">{body}</div></div></li>;
}

function WorkspaceState({ label, value }: { label: string; value: string }) {
  return <div className="bg-background p-2.5"><dt className="section-title">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>;
}
