import { api } from "./client";
import type { BomDetail, BomSummary, BuildCalibration, BuildConfiguration, BuildDetail, BuildFirmware, BuildStep, BuildSummary, BuildTest, ResourceVisibility } from "@/shared/builds";

export const buildsApi = {
  list: (mine = false, signal?: AbortSignal) => api.get<{ items: BuildSummary[] }>(`/api/v1/builds?mine=${mine}`, { signal }),
  get: (id: string, signal?: AbortSignal) => api.get<{ item: BuildDetail }>(`/api/v1/builds/${encodeURIComponent(id)}`, { signal }),
  create: (input: { name: string; description?: string | null; sourceProjectId?: string | null; organizationId?: string | null; visibility?: ResourceVisibility }) =>
    api.post<{ item: BuildDetail }>("/api/v1/builds", input),
  update: (id: string, input: { version: number; name?: string; description?: string | null; organizationId?: string | null; visibility?: ResourceVisibility; status?: string; progressPercent?: number }) =>
    api.patch<{ item: BuildDetail }>(`/api/v1/builds/${encodeURIComponent(id)}`, input),
  addItem: (id: string, input: { componentId?: string | null; description: string; quantity: number; unit?: string; selectedSupplierOfferId?: string | null; unitCostMinor?: number | null; notes?: string | null; substitutedForItemId?: string | null }) =>
    api.post<{ item: BuildDetail["items"][number] }>(`/api/v1/builds/${encodeURIComponent(id)}/items`, input),
  updateItem: (id: string, itemId: string, input: { quantity?: number; selectedSupplierOfferId?: string | null; unitCostMinor?: number | null; status?: string; notes?: string | null }) =>
    api.patch<{ item: BuildDetail["items"][number] }>(`/api/v1/builds/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, input),
  deleteItem: (id: string, itemId: string) => api.delete<void>(`/api/v1/builds/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`),
  addConfiguration: (id: string, input: { name: string; format: string; contentText?: string | null; fileId?: string | null }) =>
    api.post<{ item: BuildConfiguration }>(`/api/v1/builds/${encodeURIComponent(id)}/configurations`, input),
  deleteConfiguration: (id: string, recordId: string) => api.delete<void>(`/api/v1/builds/${encodeURIComponent(id)}/configurations/${encodeURIComponent(recordId)}`),
  addStep: (id: string, input: { title: string; body?: string | null; dependsOn?: string[] }) =>
    api.post<{ item: BuildStep }>(`/api/v1/builds/${encodeURIComponent(id)}/steps`, input),
  updateStep: (id: string, stepId: string, input: { title?: string; body?: string | null; status?: BuildStep["status"] }) =>
    api.patch<{ item: BuildStep }>(`/api/v1/builds/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}`, input),
  addFirmware: (id: string, input: { name: string; repositoryUrl?: string | null; revision?: string | null; fileId?: string | null; licenseSpdx?: string | null; notes?: string | null }) =>
    api.post<{ item: BuildFirmware }>(`/api/v1/builds/${encodeURIComponent(id)}/firmware`, input),
  deleteFirmware: (id: string, recordId: string) => api.delete<void>(`/api/v1/builds/${encodeURIComponent(id)}/firmware/${encodeURIComponent(recordId)}`),
  addCalibration: (id: string, input: { name: string; procedureText?: string | null; resultData?: Record<string, unknown>; status?: BuildCalibration["status"] }) =>
    api.post<{ item: BuildCalibration }>(`/api/v1/builds/${encodeURIComponent(id)}/calibrations`, input),
  deleteCalibration: (id: string, recordId: string) => api.delete<void>(`/api/v1/builds/${encodeURIComponent(id)}/calibrations/${encodeURIComponent(recordId)}`),
  addTest: (id: string, input: { name: string; methodText: string; expectedText?: string | null; observedText?: string | null; result?: BuildTest["result"]; evidenceFileId?: string | null }) =>
    api.post<{ item: BuildTest }>(`/api/v1/builds/${encodeURIComponent(id)}/tests`, input),
  deleteTest: (id: string, recordId: string) => api.delete<void>(`/api/v1/builds/${encodeURIComponent(id)}/tests/${encodeURIComponent(recordId)}`),
};

export const bomsApi = {
  list: (signal?: AbortSignal) => api.get<{ items: BomSummary[]; total: number; dataMode: "demo" | "mixed" }>("/api/v1/boms", { signal }),
  get: (id: string, signal?: AbortSignal) => api.get<{ item: BomDetail }>(`/api/v1/boms/${encodeURIComponent(id)}`, { signal }),
  create: (input: { name: string; visibility?: ResourceVisibility; notes?: string; items?: unknown[] }) => api.post<{ item: BomDetail }>("/api/v1/boms", input),
  forkToBuild: (id: string, input: { name?: string; visibility?: ResourceVisibility } = {}) => api.post<{ item: BuildDetail }>(`/api/v1/boms/${encodeURIComponent(id)}/builds`, input),
};
