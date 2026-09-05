export type AnalyticsEventName = "project_preview_click" | "project_open" | "featured_mode_change" | "featured_next" | "featured_previous" | "project_search" | "project_filter_change" | "project_sort_change" | "project_zero_results" | "bom_open" | "quote_start" | "marketplace_open" | "external_source_open" | "import_start" | "auth_start";

export function trackAnalyticsEvent(input: { event: AnalyticsEventName; targetType?: string; targetId?: string; dimensionKey?: string; dimensionValue?: string; path?: string }) {
  if (typeof window === "undefined") return;
  const search = new URLSearchParams(window.location.search);
  const payload = JSON.stringify({
    event: input.event, path: input.path ?? window.location.pathname,
    targetType: input.targetType ?? "", targetId: input.targetId ?? "",
    dimensionKey: input.dimensionKey ?? "", dimensionValue: input.dimensionValue ?? "",
    referrer: document.referrer, utmSource: search.get("utm_source") ?? "",
    utmMedium: search.get("utm_medium") ?? "", utmCampaign: search.get("utm_campaign") ?? "",
  });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/v1/analytics/event", new Blob([payload], { type: "application/json" }));
    return;
  }
  void fetch("/api/v1/analytics/event", { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true, credentials: "omit" }).catch(() => undefined);
}
