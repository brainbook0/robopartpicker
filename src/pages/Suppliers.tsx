import { Link } from "react-router-dom";
import { Clock3, FileCheck2, Mail, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { PRODUCT_STATUSES } from "@/lib/product-status";

const steps = [
  { icon: FileCheck2, title: "Generate and review the BOM", body: "RoboPartPicker extracts candidate lines from tables, documents, robot descriptions, EDA exports, and supported CAD assemblies. Source evidence remains attached to every line." },
  { icon: ShieldCheck, title: "Pass the quote gate", body: "Every included line needs a confirmed quantity, exact commercial identity or fabrication specification, and a fresh positive internal price in one currency." },
  { icon: Mail, title: "Send the completed quote", body: "Enter recipient addresses, preview the itemized quote, then confirm once more. Each recipient receives a separate email and never sees another address." },
];

export default function Suppliers() {
  return <>
    <PageHeader kicker="Pricing" title="How completed quotes work" status={PRODUCT_STATUSES.completedQuotes} sub="RoboPartPicker does not publish a supplier directory for this release. It uses verified internal price observations to produce a completed itemized quote from a confirmed BOM." />
    <div className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="grid gap-3 md:grid-cols-3">{steps.map(({ icon: Icon, title, body }) => <section key={title} className="surface-card p-4"><Icon className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p></section>)}</div>
      <section className="surface-card mt-4 p-5"><div className="flex items-start gap-3"><Clock3 className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-semibold">Price freshness and exclusions</h2><ul className="mt-2 space-y-2 text-sm text-muted-foreground"><li>• The lowest fresh, positive, non-demo internal price is selected for each exact line.</li><li>• Every line shows when its price was observed.</li><li>• Zero, stale, missing, substitute-only, or mixed-currency prices block quote generation.</li><li>• Shipping and tax are excluded and stated in the quote.</li><li>• A completed quote is a price snapshot, not proof of stock, fulfillment, payment, or purchase.</li></ul></div></div></section>
      <section className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-primary/30 bg-primary/5 p-5"><div><div className="section-title">Start with the source</div><h2 className="mt-1 text-lg font-semibold">Import a robotics project and generate its BOM</h2><p className="mt-1 text-sm text-muted-foreground">Unsupported files remain visible and unparsed. RoboPartPicker never guesses commercial parts from geometry or filenames.</p></div><div className="flex gap-2"><Link to="/projects" className="btn-ghost">Browse projects</Link><Link to="/projects/new" className="btn-primary">Import a project</Link></div></section>
    </div>
  </>;
}
