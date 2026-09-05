import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Moon, Sun, Search, Bell, GitPullRequest, LogOut, User as UserIcon, Sparkles, ChevronDown, Building2, Menu, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { profileInitials, profileName } from "@/lib/profile-display";
import logoUrl from "@/assets/logo.png";
import { notificationsApi } from "@/lib/api/notifications";
import { healthApi } from "@/lib/api/health";
import { ProductStatusBadge } from "@/components/common/ProductStatusBadge";
import { PRODUCT_STATUSES, type ProductStatus } from "@/lib/product-status";

type NavigationItem = { label: string; to: string; status?: ProductStatus };

const navItems: NavigationItem[] = [
  { label: "Discover", to: "/" },
  { label: "Projects", to: "/projects" },
  { label: "My builds", to: "/builder", status: PRODUCT_STATUSES.buildWorkspace },
  { label: "Marketplace", to: "/marketplace", status: PRODUCT_STATUSES.marketplacePublishing },
  { label: "Community", to: "/community" },
];

const moreItems: NavigationItem[] = [
  { label: "About RoboPartPicker", to: "/about" },
  { label: "Parts catalog", to: "/parts/actuator" },
  { label: "Robots", to: "/robots" },
  { label: "BOMs", to: "/boms" },
  { label: "Completed quote method", to: "/suppliers", status: PRODUCT_STATUSES.completedQuotes },
  { label: "Teardowns", to: "/teardowns" },
  { label: "Guided finder", to: "/finder/actuator" },
  { label: "RPPS spec", to: "/rpps" },
  { label: "Developers & MCP", to: "/developers" },
  { label: "Partners & advertising", to: "/partners" },
  { label: "Legal", to: "/legal" },
  { label: "Contact", to: "/contact" },
];

export const SiteHeader = () => {
  const [dark, setDark] = useState<boolean>(() => typeof window !== "undefined" && document.documentElement.classList.contains("dark"));
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const { user, profile, signOut } = useAuth();
  const notificationCount = useQuery({
    queryKey: ["notification-count", user?.id],
    queryFn: ({ signal }) => notificationsApi.list(true, signal),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });
  const healthQuery = useQuery({
    queryKey: ["health-capabilities"],
    queryFn: ({ signal }) => healthApi.get(signal),
    staleTime: 5 * 60_000,
  });
  const aiEnabled = healthQuery.data?.capabilities.ai === true;
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q)}`); }}
          className="hidden lg:flex flex-1 max-w-[380px] items-center gap-2 rounded border border-input bg-surface px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            aria-label="Search RoboPartPicker"
            placeholder="Search projects, components, BOMs, builds…"
            className="h-7 w-full bg-transparent text-[12px] outline-none" />
          <kbd className="hidden sm:inline kbd-key">⌘K</kbd>
        </form>

        <nav className="hidden lg:flex items-center gap-0.5">
          {navItems.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) => `inline-flex items-center gap-1 px-1.5 py-0.5 text-[12px] font-medium rounded ${isActive ? "text-foreground bg-muted" : "text-foreground/70 hover:text-foreground hover:bg-muted/60"}`}>
              {n.label}{n.status && <ProductStatusBadge status={n.status} className="px-1 py-0 text-[8px]" />}
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
                    <Link key={m.to} to={m.to} onClick={() => setMoreOpen(false)} className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-muted">{m.label}{m.status && <ProductStatusBadge status={m.status} className="px-1 py-0 text-[8px]" />}</Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setMobileNavOpen((value) => !value)} aria-label="Toggle navigation" aria-expanded={mobileNavOpen} className="rounded border border-border p-1.5 hover:bg-muted lg:hidden">{mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button>
          <Link to="/assistant" className="hidden sm:inline-flex btn-ghost btn-sm" aria-label={aiEnabled ? "Ask AI beta" : "AI assistant beta unavailable"}><Sparkles className="h-3.5 w-3.5" /> {aiEnabled ? "Ask AI" : "AI unavailable"}<ProductStatusBadge status={PRODUCT_STATUSES.assistant} className="px-1 py-0 text-[8px]" /></Link>
          <Link to="/marketplace/wanted/new" className="hidden lg:inline-flex btn-ghost btn-sm"><GitPullRequest className="h-3.5 w-3.5" /> Post wanted</Link>
          {user && <Link to="/notifications" className="relative hidden sm:inline-flex btn-ghost btn-sm" aria-label={`${notificationCount.data?.unreadCount ?? 0} unread notifications`}><Bell className="h-3.5 w-3.5" />{Boolean(notificationCount.data?.unreadCount) && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-bold text-primary-foreground">{Math.min(notificationCount.data!.unreadCount, 99)}</span>}</Link>}
          <button onClick={() => setDark(!dark)} aria-label="Toggle theme"
            className="rounded border border-border p-1 hover:bg-muted">
            {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          {user ? (
            <div className="relative">
              <button onClick={() => setMenuOpen(v => !v)} className="flex items-center gap-1.5 rounded border border-border bg-background pl-1 pr-2 py-0.5 hover:bg-muted">
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                  : <span className="h-5 w-5 rounded-full bg-primary/15 text-primary border border-primary/30 grid place-items-center text-[9px] font-semibold">{profileInitials(profile)}</span>}
                <span className="hidden sm:inline text-[11px] max-w-[100px] truncate">{profileName(profile) || user.email}</span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-50 mt-1 w-44 rounded border border-border bg-popover shadow-md text-[12px]">
                    <div className="px-3 py-2 border-b border-border/60">
                      <div className="font-medium truncate">{profileName(profile)}</div>
                      <div className="text-muted-foreground truncate text-[10.5px]">{user.email}</div>
                    </div>
                    <Link to="/community" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted"><UserIcon className="h-3.5 w-3.5" /> Forum</Link>
                    <Link to="/organizations" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted"><Building2 className="h-3.5 w-3.5" /> Organizations</Link>
                    <Link to="/notifications" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted"><Bell className="h-3.5 w-3.5" /> Notifications{Boolean(notificationCount.data?.unreadCount) && <span className="ml-auto badge-neutral mono">{notificationCount.data?.unreadCount}</span>}</Link>
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

      {mobileNavOpen && <div className="border-t border-border bg-background p-3 lg:hidden">
        <form onSubmit={(event) => { event.preventDefault(); if (q.trim()) { nav(`/search?q=${encodeURIComponent(q)}`); setMobileNavOpen(false); } }} className="flex items-center gap-2 rounded border border-input bg-surface px-2"><Search className="h-4 w-4 text-muted-foreground" /><input aria-label="Search RoboPartPicker" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search projects, components, BOMs…" className="h-10 w-full bg-transparent text-sm outline-none" /></form>
        <nav className="mt-2 grid grid-cols-2 gap-1">{[...navItems, ...moreItems].map((item) => <Link key={item.to} to={item.to} onClick={() => setMobileNavOpen(false)} className="flex min-h-11 items-center justify-between gap-2 rounded border border-border px-3 py-2 text-sm hover:bg-muted">{item.label}{item.status && <ProductStatusBadge status={item.status} />}</Link>)}</nav>
      </div>}

    </header>
  );
};
