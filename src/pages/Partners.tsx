import { FormEvent, useState } from "react";
import { Building2, Megaphone, PackageCheck, Store, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/api/client";
import { partnerInterestApi, type PartnerInterestKind } from "@/lib/api/partner-interest";

const inquiryTypes: Array<{ value: PartnerInterestKind; label: string }> = [
  { value: "advertiser", label: "Advertiser or sponsor" },
  { value: "supplier", label: "Supplier or manufacturer" },
  { value: "partner", label: "Platform or data partner" },
  { value: "project_owner", label: "Project owner or maintainer" },
  { value: "service_provider", label: "Designer or service provider" },
];

export default function Partners() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState("");
  const [referenceId, setReferenceId] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus("submitting");
    setFeedback("");
    try {
      const response = await partnerInterestApi.create({
        inquiryType: String(form.get("inquiryType")) as PartnerInterestKind,
        organizationName: String(form.get("organizationName") ?? ""),
        contactName: String(form.get("contactName") ?? ""),
        email: String(form.get("email") ?? ""),
        websiteUrl: String(form.get("websiteUrl") ?? ""),
        message: String(form.get("message") ?? ""),
        company: String(form.get("company") ?? ""),
      });
      event.currentTarget.reset();
      setReferenceId(response.item.id);
      setFeedback(response.message);
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setFeedback(error instanceof ApiError ? error.message : "The inquiry could not be sent. Please try again shortly.");
    }
  }

  return <div className="mx-auto max-w-[1100px] px-4 py-8">
    <div className="section-title">Partners and commercial participation</div>
    <h1 className="mt-1 text-3xl font-bold">Contribute projects, parts, services, or clearly labeled sponsorships</h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">RoboPartPicker separates technical evidence from commercial placement. Suppliers and advertisers can participate, but payment never changes provenance, BOM completeness, compatibility claims, or organic technical ranking.</p>

    <div className="mt-6 grid gap-3 md:grid-cols-2">
      <Option icon={PackageCheck} title="Project owners and maintainers" text="Claim or submit a robotics project, identify the exact revision, improve its BOM and build instructions, and publish verified releases." action="Import or create a project" to="/projects/new" />
      <Option icon={Building2} title="Suppliers and manufacturers" text="Publish a supplier profile, improve canonical part records, provide source-backed offers, and respond to normalized quote requests." action="Browse supplier records" to="/suppliers" />
      <Option icon={Store} title="Designers and service providers" text="List custom designs, fabrication, integration services, parts, completed robots, or wanted requests in the marketplace." action="Open marketplace" to="/marketplace" />
      <Option icon={Megaphone} title="Advertisers and sponsors" text="Discuss clearly labeled project showcases, category sponsorships, or educational partnerships. Sponsored material must remain visually and analytically separate from technical evidence." action="Read policy below" to="#interest" />
    </div>

    <section id="interest" className="surface-card mt-6 p-5">
      <div className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-primary" /> Public interest intake</div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Use this form for advertiser, supplier, and partner inquiries while the rest of the site is being built. Submissions are stored for manual review. This is not a guarantee of placement, a quote, or a change to technical rankings.</p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium">Inquiry type<select name="inquiryType" required className="rounded-md border border-border bg-background px-3 py-2 text-sm">{inquiryTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-medium">Organization<input name="organizationName" required minLength={2} maxLength={120} className="rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        <label className="grid gap-1 text-xs font-medium">Your name<input name="contactName" required minLength={2} maxLength={120} className="rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        <label className="grid gap-1 text-xs font-medium">Work email<input name="email" type="email" required maxLength={254} className="rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        <label className="grid gap-1 text-xs font-medium md:col-span-2">Website or relevant URL<input name="websiteUrl" type="url" maxLength={500} placeholder="https://example.com" className="rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        <label className="hidden">Company<input name="company" tabIndex={-1} autoComplete="off" /></label>
        <label className="grid gap-1 text-xs font-medium md:col-span-2">How would you like to participate?<textarea name="message" required minLength={40} maxLength={2000} rows={6} placeholder="Mention the robotics category, products or projects involved, evidence you can provide, and whether this is advertising, supplier data, or partnership related." className="rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={status === "submitting"} className="btn-primary disabled:opacity-60">{status === "submitting" ? "Sending…" : "Submit interest"}</button>
          <Link to="/developers" className="btn-ghost">Agent and MCP access</Link>
        </div>
      </form>
      {feedback ? <div role="status" className={`mt-4 rounded-md border px-3 py-2 text-xs ${status === "success" ? "border-primary/30 bg-primary/10" : "border-destructive/30 bg-destructive/10"}`}>{feedback}{referenceId ? <span className="block text-muted-foreground">Reference: {referenceId}</span> : null}</div> : null}
    </section>
  </div>;
}

function Option({ icon: Icon, title, text, action, to }: { icon: typeof Building2; title: string; text: string; action: string; to: string }) { return <div className="surface-card p-5"><Icon className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p><Link to={to} className="mt-4 inline-flex text-xs font-medium text-primary hover:underline">{action} →</Link></div>; }
