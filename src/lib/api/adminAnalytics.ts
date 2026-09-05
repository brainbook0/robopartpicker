import { api } from "@/lib/api/client";

export type MetricRow = Record<string, string | number | null>;
export type AnalyticsSummary = {
  days: number; start: string; totalViews: number; totalEvents: number;
  daily: MetricRow[]; eventDaily: MetricRow[]; topPaths: MetricRow[]; eventMix: MetricRow[];
  sources: MetricRow[]; countries: MetricRow[]; devices: MetricRow[];
  privacy: { cookies: false; ipStored: false; userIdentityStored: false; rawEventsStored: false; aggregation: "daily" };
};
export type AdminAnalyticsBundle = {
  summary: AnalyticsSummary;
  content: { projects: MetricRow[]; funnel: MetricRow[]; featured: MetricRow[] };
  discovery: { filters: MetricRow[]; sorts: MetricRow[]; searches: MetricRow[]; zeroResults: MetricRow[] };
  acquisition: { sources: MetricRow[]; campaigns: MetricRow[]; countries: MetricRow[]; devices: MetricRow[] };
  catalog: { projects: MetricRow; bomStates: MetricRow[]; priceCoverage: MetricRow };
  operations: { imports: MetricRow[]; bomRuns: MetricRow[]; quotes: MetricRow[]; claims: MetricRow[]; generatedAt: string };
};

export const adminAnalyticsApi = {
  load: async (days: number, signal?: AbortSignal): Promise<AdminAnalyticsBundle> => {
    const query = `days=${days}`;
    const [summary, content, discovery, acquisition, catalog, operations] = await Promise.all([
      api.get<{ item: AnalyticsSummary }>(`/api/v1/admin/analytics/summary?${query}`, { signal }),
      api.get<{ item: AdminAnalyticsBundle["content"] }>(`/api/v1/admin/analytics/content?${query}`, { signal }),
      api.get<{ item: AdminAnalyticsBundle["discovery"] }>(`/api/v1/admin/analytics/discovery?${query}`, { signal }),
      api.get<{ item: AdminAnalyticsBundle["acquisition"] }>(`/api/v1/admin/analytics/acquisition?${query}`, { signal }),
      api.get<{ item: AdminAnalyticsBundle["catalog"] }>("/api/v1/admin/analytics/catalog-health", { signal }),
      api.get<{ item: AdminAnalyticsBundle["operations"] }>("/api/v1/admin/analytics/operations", { signal }),
    ]);
    return { summary: summary.item, content: content.item, discovery: discovery.item, acquisition: acquisition.item, catalog: catalog.item, operations: operations.item };
  },
  exportUrl: (days: number) => `/api/v1/admin/analytics/export.csv?days=${days}`,
};
