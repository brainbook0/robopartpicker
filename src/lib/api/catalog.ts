import { useQuery } from "@tanstack/react-query";
import type { CatalogPart, PartCategory, SupplierSummary } from "@/shared/catalog";
import { api } from "./client";

export type ComponentListResponse = {
  items: CatalogPart[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  dataMode: "demo" | "live";
};

export type ComponentListParams = {
  category?: PartCategory;
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

function componentPath(params: ComponentListParams): string {
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
  search.set("page", String(params.page ?? 1));
  search.set("limit", String(params.limit ?? 100));
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
