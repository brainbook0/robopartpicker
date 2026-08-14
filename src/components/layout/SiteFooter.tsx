import { Link } from "react-router-dom";
import logoUrl from "@/assets/logo.png";

export const SiteFooter = () => (
  <footer className="mt-16 border-t border-border bg-surface">
    <div className="mx-auto max-w-[1400px] px-4 py-8 grid gap-8 md:grid-cols-5 text-[13px]">
      <div className="md:col-span-2">
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="" className="h-7 w-7 rounded-full" />
          <span className="font-bold">robopartpicker</span>
        </div>
        <p className="mt-2 max-w-sm text-muted-foreground">
          Discover robotics designs, compile their BOMs, source complete builds, and publish reproducible derivatives.
        </p>
      </div>
      <div>
        <div className="section-title mb-2">Projects</div>
        <ul className="space-y-1.5">
          <li><Link to="/projects" className="hover:text-primary">Discover designs</Link></li>
          <li><Link to="/projects/new" className="hover:text-primary">Import a project</Link></li>
          <li><Link to="/boms" className="hover:text-primary">Bills of materials</Link></li>
          <li><Link to="/builder" className="hover:text-primary">Build workspace</Link></li>
          <li><Link to="/rpps" className="hover:text-primary">RPPS releases</Link></li>
        </ul>
      </div>
      <div>
        <div className="section-title mb-2">Tools</div>
        <ul className="space-y-1.5">
          <li><Link to="/parts/actuator" className="hover:text-primary">Component catalog</Link></li>
          <li><Link to="/suppliers" className="hover:text-primary">Supplier directory</Link></li>
          <li><Link to="/developers" className="hover:text-primary">Developers & MCP</Link></li>
          <li><Link to="/marketplace/wanted/new" className="hover:text-primary">Post wanted</Link></li>
        </ul>
      </div>
      <div>
        <div className="section-title mb-2">Platform</div>
        <ul className="space-y-1.5">
          <li><Link to="/marketplace" className="hover:text-primary">Marketplace</Link></li>
          <li><Link to="/community" className="hover:text-primary">Community</Link></li>
          <li><Link to="/partners" className="hover:text-primary">Partners & advertising</Link></li>
          <li><Link to="/assistant" className="hover:text-primary">AI assistant</Link></li>
        </ul>
      </div>
    </div>
    <div className="border-t border-border py-4 text-center text-[12px] text-muted-foreground">
      © {new Date().getFullYear()} robopartpicker · observed prices are estimates, not binding quotes.
    </div>
  </footer>
);
