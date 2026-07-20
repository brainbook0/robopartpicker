import { useQuery } from "@tanstack/react-query";
import type { MarketplaceListing, MarketplaceListingInput } from "@/shared/marketplace";
import { api } from "./client";

export type MarketplaceListParams = {
  type?: MarketplaceListing["listingType"];
  q?: string;
  category?: string;
  region?: string;
  condition?: NonNullable<MarketplaceListing["conditionGrade"]>;
  sort?: "newest" | "price_asc" | "price_desc" | "parts_cost_asc";
  minPrice?: number | null;
  maxPrice?: number | null;
  mine?: boolean;
  status?: MarketplaceListing["status"];
};

export function useMarketplace(params: MarketplaceListParams) {
  const search = new URLSearchParams();
  if (params.type) search.set("type", params.type);
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (params.region) search.set("region", params.region);
  if (params.condition) search.set("condition", params.condition);
  if (params.sort) search.set("sort", params.sort);
  if (params.minPrice != null) search.set("minPrice", String(params.minPrice));
  if (params.maxPrice != null) search.set("maxPrice", String(params.maxPrice));
  if (params.mine) search.set("mine", "true");
  if (params.status) search.set("status", params.status);
  search.set("limit", "100");
  return useQuery({
    queryKey: ["marketplace", params],
    queryFn: ({ signal }) => api.get<{ items: MarketplaceListing[]; total: number; dataMode: "demo" | "live" }>(`/api/v1/marketplace?${search}`, { signal }),
    staleTime: 15_000,
  });
}

export function useMarketplaceListing(id: string | undefined) {
  return useQuery({
    queryKey: ["marketplace-listing", id],
    queryFn: ({ signal }) => api.get<{ item: MarketplaceListing; dataMode: "demo" | "live" }>(`/api/v1/marketplace/${encodeURIComponent(id!)}`, { signal }),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export const marketplaceApi = {
  create: (input: MarketplaceListingInput) => api.post<{ item: MarketplaceListing }>("/api/v1/marketplace", input),
  update: (id: string, version: number, input: Partial<MarketplaceListingInput>) => api.patch<{ item: MarketplaceListing }>(`/api/v1/marketplace/${encodeURIComponent(id)}`, { ...input, version }),
  status: (id: string, status: MarketplaceListing["status"]) => api.put<{ item: MarketplaceListing; paymentProcessed: false }>(`/api/v1/marketplace/${encodeURIComponent(id)}/status`, { status }),
  save: (id: string, active: boolean) => active ? api.put(`/api/v1/marketplace/${encodeURIComponent(id)}/save`) : api.delete(`/api/v1/marketplace/${encodeURIComponent(id)}/save`),
  inquire: (id: string, message: string, subject?: string) => api.post<{ item: { id: string }; sent: true; deliveryScope: string }>(`/api/v1/marketplace/${encodeURIComponent(id)}/inquiries`, { subject, message }),
  removeImage: (id: string, fileId: string) => api.delete<void>(`/api/v1/marketplace/${encodeURIComponent(id)}/images/${encodeURIComponent(fileId)}`),
};
