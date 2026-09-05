import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import logoUrl from "@/assets/logo.png";
import { SUPPORT_EMAIL } from "@/lib/legal-documents";
import { DISCORD_INVITE_URL, SOCIAL_LINKS } from "@/lib/site-config";

export const SiteFooter = () => (
  <footer className="mt-16 border-t border-border bg-surface">
    <div className="mx-auto max-w-[1400px] px-4 py-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-6 text-[13px]">
      <div className="md:col-span-2">
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="" className="h-7 w-7 rounded-full" />
          <span className="font-bold">robopartpicker</span>
        </div>
        <p className="mt-2 max-w-sm text-muted-foreground">
          Discover robotics designs, compile their BOMs, source complete builds, and publish reproducible derivatives.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <a href={SOCIAL_LINKS.discord} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-primary" aria-label="Join the RoboPartPicker Discord">
            <MessageCircle className="h-3.5 w-3.5" /> Discord
          </a>
          <span className="text-border" aria-hidden="true">·</span>
          <a href={SOCIAL_LINKS.github} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-primary" aria-label="RoboPartPicker on GitHub">
            GitHub
          </a>
          <span className="text-border" aria-hidden="true">·</span>
          <a href={SOCIAL_LINKS.rss} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-primary" aria-label="Project RSS feed">
            RSS
          </a>
        </div>
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
          <li><Link to="/suppliers" className="hover:text-primary">Completed quote method</Link></li>
          <li><Link to="/developers" className="hover:text-primary">Developers & MCP</Link></li>
          <li><Link to="/marketplace/wanted/new" className="hover:text-primary">Post wanted</Link></li>
        </ul>
      </div>
      <div>
        <div className="section-title mb-2">Platform</div>
        <ul className="space-y-1.5">
          <li><Link to="/about" className="hover:text-primary">About RoboPartPicker</Link></li>
          <li><Link to="/marketplace" className="hover:text-primary">Marketplace</Link></li>
          <li><Link to="/community" className="hover:text-primary">Community</Link></li>
          <li><Link to="/partners" className="hover:text-primary">Partners & advertising</Link></li>
          <li><Link to="/assistant" className="hover:text-primary">AI assistant</Link></li>
          <li><a href="/feed.xml" className="hover:text-primary">Project RSS feed</a></li>
          <li><a href="/llms.txt" className="hover:text-primary">llms.txt</a></li>
        </ul>
      </div>
      <div>
        <div className="section-title mb-2">Legal</div>
        <ul className="space-y-1.5">
          <li><Link to="/legal" className="hover:text-primary">Legal center</Link></li>
          <li><Link to="/privacy" className="hover:text-primary">Privacy</Link></li>
          <li><Link to="/terms" className="hover:text-primary">Terms</Link></li>
          <li><Link to="/cookies" className="hover:text-primary">Cookies & storage</Link></li>
          <li><Link to="/acceptable-use" className="hover:text-primary">Acceptable use</Link></li>
          <li><Link to="/marketplace-terms" className="hover:text-primary">Marketplace terms</Link></li>
          <li><Link to="/ai-notice" className="hover:text-primary">AI notice</Link></li>
          <li><Link to="/intellectual-property" className="hover:text-primary">Intellectual property</Link></li>
          <li><Link to="/accessibility" className="hover:text-primary">Accessibility</Link></li>
          <li><Link to="/contact" className="hover:text-primary">Contact</Link></li>
        </ul>
      </div>
    </div>
    <div className="border-t border-border py-4 text-center text-[12px] text-muted-foreground">
      <span>© {new Date().getFullYear()} robopartpicker · observed prices are estimates, not binding quotes.</span>
      <span className="mx-2" aria-hidden="true">·</span>
      <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-primary">{SUPPORT_EMAIL}</a>
    </div>
  </footer>
);
