import { useEffect, useState } from "react";
import { Gauge, ShieldCheck } from "lucide-react";
import { getProjectProfile, type ProjectProfile } from "@/lib/projects";

export function ProjectSpecifications({ projectId, loadProfile = getProjectProfile }: { projectId: string; loadProfile?: (projectId: string) => Promise<ProjectProfile> }) {
  const [profile, setProfile] = useState<ProjectProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let live = true; loadProfile(projectId).then((item) => { if (live) setProfile(item); }).catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : "Specifications are unavailable."); }); return () => { live = false; }; }, [loadProfile, projectId]);
  if (error) return <State>{error}</State>;
  if (!profile) return <State>Loading normalized specifications…</State>;
  if (!profile.specs.length) return null;
  const price = profile.active_price_estimate;
  return <section className="surface-card overflow-hidden" aria-label="Technical specifications">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div><h2 className="flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-primary" /> Product details</h2><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Values published by the manufacturer or another cited project source.</p></div>
      <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
        <span className="inline-flex items-center gap-1 border border-positive/40 bg-positive/5 px-2 py-1 text-positive"><ShieldCheck className="h-3 w-3" /> Source-backed</span>
        {price && <span className="border border-border bg-muted/30 px-2 py-1 font-mono">Price {priceLabel(price.min_minor, price.max_minor, price.currency)}</span>}
      </div>
    </div>
    <dl className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">{profile.specs.map((spec) => <div key={spec.id} className="min-w-0 bg-background p-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{spec.label}</dt><dd className="mt-1 break-words text-sm font-semibold">{spec.value_number ?? spec.value_text}{spec.unit ? ` ${spec.unit}` : ""}</dd><div className="mt-1 text-[9.5px] text-muted-foreground">Manufacturer source · checked {new Date(spec.observed_at).toLocaleDateString()}</div></div>)}</dl>
  </section>;
}
function State({ children }: { children: React.ReactNode }) { return <div className="surface-card p-4 text-xs text-muted-foreground">{children}</div>; }
function priceLabel(minor: number, maxMinor: number, currency: string) { const format = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value / 100); return minor === maxMinor ? format(minor) : `${format(minor)}–${format(maxMinor)}`; }
