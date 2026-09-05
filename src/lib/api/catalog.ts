import { useQuery } from "@tanstack/react-query";
import type { CatalogPart, SupplierSummary } from "@/shared/catalog";
import type { ComponentAlternativeRecommendation } from "@/shared/componentAlternatives";
import { api } from "./client";

export type ComponentListResponse = {
  items: CatalogPart[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  dataMode: "demo" | "live";
};

/** Page size the components list API serves (its documented default and the
 *  largest value the production endpoint accepts). The client clamps any
 *  caller-supplied `limit` here so it never sends a value the API rejects. */
export const COMPONENTS_PAGE_SIZE = 50;

export type ComponentListParams = {
  category?: string;
  q?: string;
  manufacturerRegion?: string[];
  supplierRegion?: string[];
  supplier?: string[];
  manufacturer?: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  inStock?: boolean;
  page?: number;
  limit?: number;
};

export function componentPath(params: ComponentListParams): string {
  const search = new URLSearchParams();
  if (params.category) search.set("category", params.category);
  if (params.q) search.set("q", params.q);
  if (params.manufacturerRegion?.length) search.set("manufacturerRegion", params.manufacturerRegion.join(","));
  if (params.supplierRegion?.length) search.set("supplierRegion", params.supplierRegion.join(","));
  if (params.supplier?.length) search.set("supplier", params.supplier.join(","));
  if (params.manufacturer?.length) search.set("manufacturer", params.manufacturer.join(","));
  if (params.minPrice != null) search.set("minPrice", String(params.minPrice));
  if (params.maxPrice != null) search.set("maxPrice", String(params.maxPrice));
  if (params.inStock) search.set("inStock", "true");
  search.set("page", String(Math.max(1, params.page ?? 1)));
  const requested = params.limit ?? COMPONENTS_PAGE_SIZE;
  const limit = Math.min(Math.max(1, requested), COMPONENTS_PAGE_SIZE);
  search.set("limit", String(limit));
  return `/api/v1/components?${search}`;
}

export function useComponents(params: ComponentListParams, enabled = true) {
  return useQuery({
    queryKey: ["catalog-components", params],
    queryFn: ({ signal }) => api.get<ComponentListResponse>(componentPath(params), { signal }),
    enabled,
    staleTime: 30_000,
  });
}

export function useComponent(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: ["catalog-component", idOrSlug],
    queryFn: ({ signal }) => api.get<{ item: CatalogPart; dataMode: "demo" | "live" }>(
      `/api/v1/components/${encodeURIComponent(idOrSlug!)}`,
      { signal },
    ),
    enabled: Boolean(idOrSlug),
    staleTime: 30_000,
  });
}

export function componentAlternativesPath(idOrSlug: string, requestedLimit = 5): string {
  const limit = Math.min(10, Math.max(1, Math.trunc(requestedLimit) || 1));
  return `/api/v1/components/${encodeURIComponent(idOrSlug)}/alternatives?limit=${limit}`;
}

export function useComponentAlternatives(idOrSlug: string | undefined, limit = 5) {
  return useQuery({
    queryKey: ["catalog-component-alternatives", idOrSlug, limit],
    queryFn: ({ signal }) => api.get<{ items: ComponentAlternativeRecommendation[]; total: number; compatibilityStatus: "unverified" }>(
      componentAlternativesPath(idOrSlug!, limit),
      { signal },
    ),
    enabled: Boolean(idOrSlug),
    staleTime: 30_000,
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["catalog-suppliers"],
    queryFn: ({ signal }) => api.get<{ items: SupplierSummary[]; total: number; dataMode: "demo" | "live" }>(
      "/api/v1/suppliers",
      { signal },
    ),
    staleTime: 30_000,
  });
}
