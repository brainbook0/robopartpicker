import { Outlet } from "react-router-dom";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { TrafficAnalytics } from "@/components/TrafficAnalytics";

export const SiteLayout = () => (
  <div className="min-h-screen bg-background text-foreground">
    <SiteHeader />
    <TrafficAnalytics />
    <main><Outlet /></main>
    <SiteFooter />
  </div>
);
