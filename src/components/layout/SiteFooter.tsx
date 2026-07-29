import { Link } from "react-router-dom";
import logoUrl from "@/assets/logo.png";

export const SiteFooter = () => (
  <footer className="mt-16 border-t border-border bg-surface">
    <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-8 text-[13px] sm:grid-cols-2 md:grid-cols-6">
      <div className="md:col-span-2">
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="" className="h-7 w-7 rounded-full" />
          <span className="font-bold">RoboPartPicker</span>
        </div>
        <p className="mt-2 max-w-sm text-muted-foreground">Discover, source, build, reproduce, and document robots with inspectable technical records.</p>
      </div>
      <div>
        <div className="section-title mb-2">Parts</div>
        <ul className="space-y-1.5">
          <li><Link to="/parts/actuator" className="hover:text-primary">Actuators</Link></li>
          <li><Link to="/parts/hand" className="hover:text-primary">Hands</Link></li>
          <li><Link to="/parts/sensor" className="hover:text-primary">Sensors</Link></li>
          <li><Link to="/parts/compute" className="hover:text-primary">Compute</Link></li>
          <li><Link to="/parts/reducer" className="hover:text-primary">Reducers</Link></li>
        </ul>
      </div>
      <div>
        <div className="section-title mb-2">Tools</div>
        <ul className="space-y-1.5">
          <li><Link to="/builder" className="hover:text-primary">BOM builder</Link></li>
          <li><Link to="/finder/actuator" className="hover:text-primary">Actuator finder</Link></li>
          <li><Link to="/marketplace" className="hover:text-primary">Marketplace</Link></li>
          <li><Link to="/marketplace/wanted/new" className="hover:text-primary">Post wanted</Link></li>
        </ul>
      </div>
      <div>
        <div className="section-title mb-2">Platform</div>
        <ul className="space-y-1.5">
          <li><Link to="/projects" className="hover:text-primary">Projects</Link></li>
          <li><Link to="/rpps" className="hover:text-primary">RPPS standard</Link></li>
          <li><Link to="/suppliers" className="hover:text-primary">Suppliers</Link></li>
          <li><Link to="/community" className="hover:text-primary">Community</Link></li>
        </ul>
      </div>
      <div>
        <div className="section-title mb-2">Trust</div>
        <ul className="space-y-1.5">
          <li><Link to="/legal" className="hover:text-primary">Legal & safety</Link></li>
          <li><Link to="/terms" className="hover:text-primary">Terms of Service</Link></li>
          <li><Link to="/privacy" className="hover:text-primary">Privacy Policy</Link></li>
          <li><Link to="/community-guidelines" className="hover:text-primary">Community Guidelines</Link></li>
          <li><a href="mailto:support@robopartpicker.com" className="hover:text-primary">Contact support</a></li>
        </ul>
      </div>
    </div>
    <div className="border-t border-border px-4 py-4 text-center text-[12px] text-muted-foreground">© {new Date().getFullYear()} RoboPartPicker · Technical data may be incomplete; verify safety, compatibility, and supplier terms independently.</div>
  </footer>
);
