import { useQuery } from "@tanstack/react-query";
import type { SupplierRelationshipPublicSummary } from "../supplier-relationship-pipeline";
import { api } from "./client";

export function useSupplierRelationshipPolicy() {
  return useQuery({
    queryKey: ["supplier-relationship-policy"],
    queryFn: ({ signal }) => api.get<{ item: SupplierRelationshipPublicSummary }>(
      "/api/v1/supplier-relationships/policy",
      { signal },
    ),
    staleTime: 5 * 60_000,
  });
}
