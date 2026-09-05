import { CalendarDays, Mail, Scale, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { PageMeta } from "@/components/PageMeta";
import { LEGAL_DOCUMENTS, SUPPORT_EMAIL, type LegalDocumentId } from "@/lib/legal-documents";

export function LegalDocumentPage({ documentId }: { documentId: Exclude<LegalDocumentId, "legal"> }) {
  const policy = LEGAL_DOCUMENTS[documentId];
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 sm:py-8">
      <PageMeta title={`${policy.title} | RoboPartPicker`} description={policy.description} path={policy.path} />
      <nav aria-label="Breadcrumb" className="mb-4 text-[11px] text-muted-foreground"><Link to="/legal" className="hover:text-primary">Legal center</Link> / {policy.shortTitle}</nav>

      <header className="border border-border bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary"><Scale className="h-4 w-4" /> RoboPartPicker policy</div>
        <h1 className="mt-3 max-w-4xl text-3xl font-bold tracking-tight sm:text-4xl">{policy.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{policy.summary}</p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Effective {policy.effectiveDate}</span>
          <span>Last updated {policy.updatedDate}</span>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-1.5 hover:text-primary"><Mail className="h-3.5 w-3.5" /> {SUPPORT_EMAIL}</a>
        </div>
      </header>

      <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
        <aside className="surface-card p-3 lg:sticky lg:top-14">
          <nav aria-label={`${policy.title} sections`}>
            <div className="section-title mb-2">On this page</div>
            <ul className="space-y-1">
              {policy.sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`} aria-label={section.title} className="block rounded px-2 py-1.5 text-[11px] leading-4 text-muted-foreground hover:bg-muted hover:text-foreground"><span className="mr-1 font-mono text-[9px] text-primary">{String(index + 1).padStart(2, "0")}</span> {section.title}</a></li>)}
            </ul>
          </nav>
          <div className="mt-3 border-t border-border pt-3 text-[10.5px] leading-5 text-muted-foreground">Need help? <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-foreground hover:text-primary">{SUPPORT_EMAIL}</a></div>
        </aside>

        <article className="min-w-0 space-y-3">
          {policy.sections.map((section, index) => (
            <section id={section.id} key={section.id} className="surface-card scroll-mt-16 p-4 sm:p-5">
              <div className="font-mono text-[9px] font-semibold uppercase tracking-widest text-primary">Section {String(index + 1).padStart(2, "0")}</div>
              <h2 className="mt-1 text-lg font-bold tracking-tight">{section.title}</h2>
              <div className="mt-3 space-y-3 text-[13px] leading-6 text-muted-foreground">
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{emailLinks(paragraph)}</p>)}
                {section.bullets && <ul className="space-y-2 pl-5">{section.bullets.map((item) => <li key={item} className="list-disc pl-1">{emailLinks(item)}</li>)}</ul>}
              </div>
            </section>
          ))}

          <section className="border border-primary/30 bg-primary/5 p-4 sm:p-5" aria-label="Related policies">
            <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Related policies</div>
            <div className="mt-3 flex flex-wrap gap-2">{policy.related.map((id) => <Link key={id} to={LEGAL_DOCUMENTS[id].path} className="btn-ghost btn-sm">{LEGAL_DOCUMENTS[id].shortTitle}</Link>)}</div>
          </section>

          <p className="px-1 text-[10.5px] leading-5 text-muted-foreground">These documents describe the current product and do not replace review by a qualified lawyer. Mandatory rights under applicable law remain unaffected.</p>
        </article>
      </div>
    </main>
  );
}

function emailLinks(text: string): React.ReactNode {
  const parts = text.split(SUPPORT_EMAIL);
  if (parts.length === 1) return text;
  return parts.map((part, index) => <span key={`${part}-${index}`}>{part}{index < parts.length - 1 && <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-foreground underline decoration-border underline-offset-2 hover:text-primary">{SUPPORT_EMAIL}</a>}</span>);
}
