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
          Compare, source, and resell humanoid robotics components. PCPartPicker for humanoid robots.
        </p>
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
          <li><Link to="/finder/hand" className="hover:text-primary">Hand finder</Link></li>
          <li><Link to="/marketplace/wanted/new" className="hover:text-primary">Post wanted</Link></li>
        </ul>
      </div>
      <div>
        <div className="section-title mb-2">Platform</div>
        <ul className="space-y-1.5">
          <li><Link to="/suppliers" className="hover:text-primary">Suppliers</Link></li>
          <li><Link to="/teardowns" className="hover:text-primary">Teardowns</Link></li>
          <li><Link to="/community" className="hover:text-primary">Community</Link></li>
        </ul>
      </div>
    </div>
    <div className="border-t border-border py-4 text-center text-[12px] text-muted-foreground">
      © {new Date().getFullYear()} robopartpicker — sample data, preview build.
    </div>
  </footer>
);
