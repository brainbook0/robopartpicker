import { describe, expect, it } from "vitest";
import siteHeaderSource from "../components/layout/SiteHeader.tsx?raw";
import pageHeaderSource from "../components/common/PageHeader.tsx?raw";
import assistantSource from "../pages/Assistant.tsx?raw";
import builderSource from "../pages/Builder.tsx?raw";
import indexSource from "../pages/Index.tsx?raw";
import marketplaceSource from "../pages/marketplace/MarketplaceD1.tsx?raw";
import projectNewSource from "../pages/ProjectNew.tsx?raw";
import suppliersSource from "../pages/Suppliers.tsx?raw";

describe("beta product status integration", () => {
  it("renders statuses through the shared badge and PageHeader", () => {
    expect(pageHeaderSource).toContain("ProductStatusBadge");
    expect(pageHeaderSource).toContain("status?: ProductStatus");
  });

  it("labels beta routes in desktop and mobile navigation", () => {
    expect(siteHeaderSource).toContain("PRODUCT_STATUSES.buildWorkspace");
    expect(siteHeaderSource).toContain("PRODUCT_STATUSES.marketplacePublishing");
    expect(siteHeaderSource).toContain("PRODUCT_STATUSES.completedQuotes");
    expect(siteHeaderSource).toContain("PRODUCT_STATUSES.assistant");
    expect(siteHeaderSource).toContain("ProductStatusBadge");
  });

  it("labels every approved beta workflow page", () => {
    expect(assistantSource).toContain("PRODUCT_STATUSES.assistant");
    expect(builderSource).toContain("PRODUCT_STATUSES.buildWorkspace");
    expect(projectNewSource).toContain("PRODUCT_STATUSES.projectImport");
    expect(suppliersSource).toContain("PRODUCT_STATUSES.completedQuotes");
    expect(marketplaceSource).toContain("PRODUCT_STATUSES.marketplacePublishing");
  });

  it("labels homepage entry points while preserving Coming soon separately", () => {
    expect(indexSource).toContain("PRODUCT_STATUSES.projectImport");
    expect(indexSource).toContain("PRODUCT_STATUSES.marketplacePublishing");
    expect(indexSource).toContain("PRODUCT_STATUSES.completedQuotes");
    expect(indexSource).toContain("PRODUCT_STATUSES.futureBuildWorkspace");
  });
});
