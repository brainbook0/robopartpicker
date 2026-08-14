import { api } from "@/lib/api/client";
import type { SourcingEstimate } from "@/lib/projects";
import type { RfqAction, RfqState } from "@/shared/rfq";

export type RfqRequest = {
  id: string;
  projectId: string | null;
  bomId: string | null;
  createdByUserId: string;
  status: RfqState;
  estimateSnapshot: SourcingEstimate;
  totalEstimateMinor: number | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RfqLine = {
  id: string;
  componentId: string | null;
  lineKey: string;
  description: string;
  quantity: number;
  estimateUnitPriceMinor: number | null;
  quoteUnitPriceMinor: number | null;
  quoteCurrency: string | null;
  supplierId: string | null;
  supplierSku: string | null;
  leadTimeDays: number | null;
  isSubstitute: number;
  isExcluded: number;
  notes: string | null;
  sortOrder: number;
};

export type RfqResponseItemInput = {
  lineKey: string;
  quoteUnitPriceMinor?: number | null;
  quoteCurrency?: string | null;
  supplierId?: string | null;
  supplierSku?: string | null;
  leadTimeDays?: number | null;
  isSubstitute?: boolean;
};

export const rfqApi = {
  create: (input: { projectId?: string; bomId?: string; expiresInDays?: number }) => api.post<{ item: RfqRequest }>("/api/v1/rfq", input),
  get: (id: string) => api.get<{ item: RfqRequest; lines: RfqLine[] }>(`/api/v1/rfq/${encodeURIComponent(id)}`),
  transition: (id: string, action: RfqAction) => api.post<{ item: RfqRequest }>(`/api/v1/rfq/${encodeURIComponent(id)}/transition`, { action }),
  recordResponse: (id: string, items: RfqResponseItemInput[]) => api.post<{ item: RfqRequest }>(`/api/v1/rfq/${encodeURIComponent(id)}/responses`, { items }),
  reconcile: (id: string) => api.post<{ item: RfqRequest }>(`/api/v1/rfq/${encodeURIComponent(id)}/reconcile`, {}),
  approve: (id: string) => api.post<{ item: RfqRequest }>(`/api/v1/rfq/${encodeURIComponent(id)}/approve`, {}),
  cancel: (id: string) => api.post<{ item: RfqRequest }>(`/api/v1/rfq/${encodeURIComponent(id)}/cancel`, {}),
};
