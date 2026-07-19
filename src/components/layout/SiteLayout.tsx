import { Outlet } from "react-router-dom";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

export const SiteLayout = () => (
  <div className="min-h-screen bg-background text-foreground">
    <SiteHeader />
    <main><Outlet /></main>
    <SiteFooter />
  </div>
);
