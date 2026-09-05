import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

export function TrafficAnalytics() {
  const location = useLocation();
  const lastPath = useRef("");

  useEffect(() => {
    const path = location.pathname;
    if (lastPath.current === path) return;
    lastPath.current = path;
    const search = new URLSearchParams(location.search);
    const payload = JSON.stringify({
      path,
      referrer: document.referrer,
      utmSource: search.get("utm_source") ?? "",
      utmMedium: search.get("utm_medium") ?? "",
      utmCampaign: search.get("utm_campaign") ?? "",
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/v1/analytics/view", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/v1/analytics/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "omit",
    });
  }, [location.pathname, location.search]);

  return null;
}
