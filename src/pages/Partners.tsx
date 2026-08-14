import { Building2, Megaphone, PackageCheck, Store, Users } from "lucide-react";
import { Link } from "react-router-dom";

export default function Partners() {
  return <div className="mx-auto max-w-[1100px] px-4 py-8">
    <div className="section-title">Partners and commercial participation</div>
    <h1 className="mt-1 text-3xl font-bold">Contribute projects, parts, services, or clearly labeled sponsorships</h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">RoboPartPicker separates technical evidence from commercial placement. Suppliers and advertisers can participate, but payment never changes provenance, BOM completeness, compatibility claims, or organic technical ranking.</p>

    <div className="mt-6 grid gap-3 md:grid-cols-2">
      <Option icon={PackageCheck} title="Project owners and maintainers" text="Claim or submit a robotics project, identify the exact revision, improve its BOM and build instructions, and publish verified releases." action="Import or create a project" to="/projects/new" />
      <Option icon={Building2} title="Suppliers and manufacturers" text="Publish a supplier profile, improve canonical part records, provide source-backed offers, and respond to normalized quote requests." action="Browse supplier records" to="/suppliers" />
      <Option icon={Store} title="Designers and service providers" text="List custom designs, fabrication, integration services, parts, completed robots, or wanted requests in the marketplace." action="Open marketplace" to="/marketplace" />
      <Option icon={Megaphone} title="Advertisers and sponsors" text="Discuss clearly labeled project showcases, category sponsorships, or educational partnerships. Sponsored material must remain visually and analytically separate from technical evidence." action="Start a community inquiry" to="/community/new" />
    </div>

    <section className="surface-card mt-6 p-5"><div className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-primary" /> Contact workflow</div><p className="mt-2 text-xs leading-5 text-muted-foreground">The current auditable intake path is an authenticated structured community inquiry. Dedicated email and CRM delivery are coming soon and will not be represented as active until configured. Include your organization, role, relevant project or catalog URLs, the evidence you can provide, and whether the request is technical, marketplace, supplier, or advertising-related.</p><div className="mt-4 flex flex-wrap gap-2"><Link to="/community/new" className="btn-primary">Create an inquiry</Link><Link to="/developers" className="btn-ghost">Agent and MCP access</Link></div></section>
  </div>;
}

function Option({ icon: Icon, title, text, action, to }: { icon: typeof Building2; title: string; text: string; action: string; to: string }) { return <div className="surface-card p-5"><Icon className="h-5 w-5 text-primary" /><h2 className="mt-3 font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p><Link to={to} className="mt-4 inline-flex text-xs font-medium text-primary hover:underline">{action} →</Link></div>; }
