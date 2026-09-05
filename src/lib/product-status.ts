export type ProductMaturity = "beta" | "coming-soon";

export type ProductStatus = {
  path: string | null;
  label: "Beta" | "Coming soon";
  maturity: ProductMaturity;
};

export const PRODUCT_STATUSES = {
  assistant: { path: "/assistant", label: "Beta", maturity: "beta" },
  projectImport: { path: "/projects/new", label: "Beta", maturity: "beta" },
  completedQuotes: { path: "/suppliers", label: "Beta", maturity: "beta" },
  marketplacePublishing: { path: "/marketplace", label: "Beta", maturity: "beta" },
  buildWorkspace: { path: "/builder", label: "Beta", maturity: "beta" },
  futureBuildWorkspace: { path: null, label: "Coming soon", maturity: "coming-soon" },
} as const satisfies Record<string, ProductStatus>;

const ROUTED_STATUSES: ProductStatus[] = Object.values(PRODUCT_STATUSES).filter((status) => status.path !== null);

export function productStatusForPath(pathname: string): ProductStatus | null {
  return ROUTED_STATUSES.find((status) => pathname === status.path || pathname.startsWith(`${status.path}/`)) ?? null;
}
