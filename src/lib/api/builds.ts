import { api } from "./client";
import type { BomDetail, BomSummary, BuildDetail, BuildSummary, ResourceVisibility } from "@/shared/builds";

export const buildsApi = {
  list: (mine = false, signal?: AbortSignal) => api.get<{ items: BuildSummary[] }>(`/api/v1/builds?mine=${mine}`, { signal }),
  get: (id: string, signal?: AbortSignal) => api.get<{ item: BuildDetail }>(`/api/v1/builds/${encodeURIComponent(id)}`, { signal }),
  create: (input: { name: string; sourceProjectId?: string | null; organizationId?: string | null; visibility?: ResourceVisibility }) =>
    api.post<{ item: BuildDetail }>("/api/v1/builds", input),
  update: (id: string, input: { version: number; name?: string; visibility?: ResourceVisibility; status?: string; progressPercent?: number }) =>
    api.patch<{ item: BuildDetail }>(`/api/v1/builds/${encodeURIComponent(id)}`, input),
  addItem: (id: string, input: { componentId?: string | null; description: string; quantity: number; unit?: string; selectedSupplierOfferId?: string | null; unitCostMinor?: number | null; notes?: string | null; substitutedForItemId?: string | null }) =>
    api.post<{ item: BuildDetail["items"][number] }>(`/api/v1/builds/${encodeURIComponent(id)}/items`, input),
  updateItem: (id: string, itemId: string, input: { quantity?: number; selectedSupplierOfferId?: string | null; unitCostMinor?: number | null; status?: string; notes?: string | null }) =>
    api.patch<{ item: BuildDetail["items"][number] }>(`/api/v1/builds/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, input),
  deleteItem: (id: string, itemId: string) => api.delete<void>(`/api/v1/builds/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`),
};

export const bomsApi = {
  list: (signal?: AbortSignal) => api.get<{ items: BomSummary[]; total: number; dataMode: "demo" | "mixed" }>("/api/v1/boms", { signal }),
  get: (id: string, signal?: AbortSignal) => api.get<{ item: BomDetail }>(`/api/v1/boms/${encodeURIComponent(id)}`, { signal }),
  create: (input: { name: string; visibility?: ResourceVisibility; notes?: string; items?: unknown[] }) => api.post<{ item: BomDetail }>("/api/v1/boms", input),
  forkToBuild: (id: string, input: { name?: string; visibility?: ResourceVisibility } = {}) => api.post<{ item: BuildDetail }>(`/api/v1/boms/${encodeURIComponent(id)}/builds`, input),
};
