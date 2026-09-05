import { ArrowRight, Mail, Scale, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { PageMeta } from "@/components/PageMeta";
import { LEGAL_DOCUMENT_IDS, LEGAL_DOCUMENTS, SUPPORT_EMAIL, type LegalDocumentId } from "@/lib/legal-documents";

const policyIds = LEGAL_DOCUMENT_IDS.filter((id): id is Exclude<LegalDocumentId, "legal"> => id !== "legal");

export function LegalCenter() {
  const center = LEGAL_DOCUMENTS.legal;
  return (
    <main>
      <PageMeta title="Legal center | RoboPartPicker" description={center.description} path="/legal" />
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1200px] px-4 py-10 sm:py-14">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary"><Scale className="h-4 w-4" /> Policies and notices</div>
          <h1 className="mt-3 max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl">Legal center</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">{center.summary}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2"><a href={`mailto:${SUPPORT_EMAIL}`} className="btn-primary"><Mail className="h-3.5 w-3.5" /> {SUPPORT_EMAIL}</a><Link to="/contact" className="btn-ghost">Contact guidance</Link></div>
        </div>
      </section>

      <div className="mx-auto max-w-[1200px] px-4 py-7">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Legal documents">
          {policyIds.map((id, index) => {
            const policy = LEGAL_DOCUMENTS[id];
            return <Link key={id} to={policy.path} aria-label={policy.shortTitle} className="surface-card surface-card-hover group flex min-h-48 flex-col p-4">
              <div className="flex items-start justify-between gap-3"><span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-primary">Policy {String(index + 1).padStart(2, "0")}</span><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" /></div>
              <h2 className="mt-5 text-lg font-bold">{policy.shortTitle}</h2>
              <p className="mt-2 text-[12px] leading-5 text-muted-foreground">{policy.description}</p>
              <span className="mt-auto pt-4 text-[10px] text-muted-foreground">Updated {policy.updatedDate}</span>
            </Link>;
          })}
        </section>

        <section className="mt-5 border border-warning/40 bg-warning/5 p-4 sm:p-5">
          <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" /><div><h2 className="font-semibold">Current legal identity limitation</h2><p className="mt-1 text-[12px] leading-5 text-muted-foreground">The public operator identity is RoboPartPicker and the public contact is {SUPPORT_EMAIL}. A registered legal entity and business address are not currently published. These pages improve disclosure and Google OAuth readiness, but they do not replace review by a qualified lawyer or establish complete compliance in every jurisdiction.</p></div></div>
        </section>
      </div>
    </main>
  );
}
