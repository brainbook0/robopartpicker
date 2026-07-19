import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Moon, Sun, Search, Bell, GitPullRequest, Activity, LogOut, User as UserIcon, Sparkles, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authorInitials, authorName } from "@/lib/forum";
import logoUrl from "@/assets/logo.png";
import { categoryLabel, type PartCategory } from "@/data/parts";
import { parts, lowestPrice, priceDelta30 } from "@/data/parts";
import { suppliers } from "@/data/suppliers";
import { boms } from "@/data/boms";
import { listings, wanted } from "@/data/listings";

const navItems: { label: string; to: string }[] = [
  { label: "Discover", to: "/" },
  { label: "Projects", to: "/projects" },
  { label: "Build", to: "/builder" },
  { label: "Marketplace", to: "/marketplace" },
  { label: "Community", to: "/community" },
];

const moreItems: { label: string; to: string }[] = [
  { label: "Parts catalog", to: "/parts/actuator" },
  { label: "Robots", to: "/robots" },
  { label: "BOMs", to: "/boms" },
  { label: "Suppliers", to: "/suppliers" },
  { label: "Teardowns", to: "/teardowns" },
  { label: "Guided finder", to: "/finder/actuator" },
  { label: "RPPS spec", to: "/rpps" },
];

const partCats: PartCategory[] = ["actuator","hand","sensor","compute","driver","reducer"];

const kpis = (() => {
  const avgLead = Math.round(suppliers.reduce((s, x) => s + x.leadDays, 0) / suppliers.length);
  const deltas = parts.map(priceDelta30);
  const medDelta = deltas.sort((a,b)=>a-b)[Math.floor(deltas.length/2)] ?? 0;
  const totalListed = listings.reduce((s,l)=>s+l.price, 0);
  const medPrice = (() => { const arr = parts.map(lowestPrice).sort((a,b)=>a-b); return arr[Math.floor(arr.length/2)] ?? 0; })();
  return { avgLead, medDelta, totalListed, medPrice };
})();

const fmtUsd = (n: number) => n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}k` : `$${n}`;

export const SiteHeader = () => {
  const [dark, setDark] = useState<boolean>(() => typeof window !== "undefined" && document.documentElement.classList.contains("dark"));
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const loc = useLocation();
  const onParts = loc.pathname.startsWith("/parts");
  const { user, profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-10 max-w-[1400px] items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src={logoUrl} alt="Robopartpicker" className="h-6 w-6 rounded-full" />
          <span className="text-[13px] font-bold tracking-tight">robopartpicker</span>
        </Link>

        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/projects?q=${encodeURIComponent(q)}`); }}
          className="hidden md:flex flex-1 max-w-[380px] items-center gap-2 rounded border border-input bg-surface px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects, components, builds, suppliers, listings…"
            className="h-7 w-full bg-transparent text-[12px] outline-none" />
          <kbd className="hidden sm:inline kbd-key">⌘K</kbd>
        </form>

        <nav className="hidden md:flex items-center gap-0.5">
          {navItems.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) => `px-1.5 py-0.5 text-[12px] font-medium rounded ${isActive ? "text-foreground bg-muted" : "text-foreground/70 hover:text-foreground hover:bg-muted/60"}`}>
              {n.label}
            </NavLink>
          ))}
          <div className="relative">
            <button onClick={() => setMoreOpen(v => !v)} className="flex items-center gap-0.5 px-1.5 py-0.5 text-[12px] font-medium rounded text-foreground/70 hover:text-foreground hover:bg-muted/60">
              More <ChevronDown className="h-3 w-3" />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 z-50 mt-1 w-44 rounded border border-border bg-popover shadow-md text-[12px] py-1">
                  {moreItems.map(m => (
                    <Link key={m.to} to={m.to} onClick={() => setMoreOpen(false)} className="block px-3 py-1.5 hover:bg-muted">{m.label}</Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link to="/assistant" className="hidden sm:inline-flex btn-ghost btn-sm" aria-label="Ask AI"><Sparkles className="h-3.5 w-3.5" /> Ask AI</Link>
          <Link to="/marketplace/wanted/new" className="hidden lg:inline-flex btn-ghost btn-sm"><GitPullRequest className="h-3.5 w-3.5" /> RFQ</Link>
          <button className="hidden sm:inline-flex btn-ghost btn-sm" aria-label="Alerts"><Bell className="h-3.5 w-3.5" /></button>
          <button onClick={() => setDark(!dark)} aria-label="Toggle theme"
            className="rounded border border-border p-1 hover:bg-muted">
            {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          {user ? (
            <div className="relative">
              <button onClick={() => setMenuOpen(v => !v)} className="flex items-center gap-1.5 rounded border border-border bg-background pl-1 pr-2 py-0.5 hover:bg-muted">
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                  : <span className="h-5 w-5 rounded-full bg-primary/15 text-primary border border-primary/30 grid place-items-center text-[9px] font-semibold">{authorInitials(profile)}</span>}
                <span className="hidden sm:inline text-[11px] max-w-[100px] truncate">{authorName(profile) || user.email}</span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-50 mt-1 w-44 rounded border border-border bg-popover shadow-md text-[12px]">
                    <div className="px-3 py-2 border-b border-border/60">
                      <div className="font-medium truncate">{authorName(profile)}</div>
                      <div className="text-muted-foreground truncate text-[10.5px]">{user.email}</div>
                    </div>
                    <Link to="/community" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted"><UserIcon className="h-3.5 w-3.5" /> Forum</Link>
                    <button onClick={() => { setMenuOpen(false); signOut(); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted text-destructive"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link to="/auth" className="btn-primary btn-sm">Sign in</Link>
          )}
        </div>
      </div>

      {/* Secondary nav: part categories — always visible, density-first */}
      <div className="border-t border-border bg-surface/60">
        <div className="mx-auto flex max-w-[1400px] items-center gap-1 overflow-x-auto px-4 py-1 text-[12px] no-scrollbar">
          <span className="section-title mr-2 shrink-0">Categories</span>
          {partCats.map(c => {
            const active = onParts && loc.pathname === `/parts/${c}`;
            return (
              <Link key={c} to={`/parts/${c}`}
                className={`shrink-0 rounded px-2 py-0.5 ${active ? "bg-primary/15 text-foreground border border-primary/40" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                {categoryLabel[c]}
              </Link>
            );
          })}
          <span className="mx-2 h-3 w-px shrink-0 bg-border" />
          <Link to="/parts/actuator?os=true" className="shrink-0 text-muted-foreground hover:text-foreground">Open source</Link>
          <Link to="/parts/actuator?ros=true" className="shrink-0 text-muted-foreground hover:text-foreground">ROS native</Link>
          <Link to="/marketplace" className="shrink-0 text-muted-foreground hover:text-foreground">Used deals</Link>
          <Link to="/suppliers" className="shrink-0 text-muted-foreground hover:text-foreground">Suppliers</Link>
          <Link to="/teardowns" className="shrink-0 text-muted-foreground hover:text-foreground">Teardowns</Link>
          <span className="ml-auto hidden md:inline shrink-0 mono text-[10px] text-muted-foreground">v0.4 · preview build · sample data</span>
        </div>
      </div>

      {/* Tertiary KPI ticker — live market signals */}
      <div className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-[1400px] items-center overflow-x-auto no-scrollbar px-4 text-[11px]">
          <span className="flex items-center gap-1 shrink-0 pr-3 text-muted-foreground">
            <Activity className="h-3 w-3 text-primary" /> <span className="mono">LIVE</span>
          </span>
          <div className="stat-tile"><span className="k">parts</span><span className="v">{parts.length}</span></div>
          <div className="stat-tile"><span className="k">suppliers</span><span className="v">{suppliers.length}</span></div>
          <div className="stat-tile"><span className="k">boms</span><span className="v">{boms.length}</span></div>
          <div className="stat-tile"><span className="k">listings</span><span className="v">{listings.length}</span></div>
          <div className="stat-tile"><span className="k">wanted</span><span className="v">{wanted.length}</span></div>
          <div className="stat-tile"><span className="k">avg lead</span><span className="v mono">{kpis.avgLead}d</span></div>
          <div className="stat-tile"><span className="k">median Δ30d</span><span className={`v mono ${kpis.medDelta>0?"text-negative":"text-positive"}`}>{kpis.medDelta>0?"+":""}{kpis.medDelta.toFixed(1)}%</span></div>
          <div className="stat-tile"><span className="k">median $</span><span className="v mono">{fmtUsd(kpis.medPrice)}</span></div>
          <div className="stat-tile"><span className="k">GMV listed</span><span className="v mono">{fmtUsd(kpis.totalListed)}</span></div>
          <Link to="/finder/actuator" className="ml-auto shrink-0 text-[11px] text-muted-foreground hover:text-primary pl-3">Guided finder →</Link>
        </div>
      </div>
    </header>
  );
};
