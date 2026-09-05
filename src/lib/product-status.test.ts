import { describe, expect, it } from "vitest";
import { PRODUCT_STATUSES, productStatusForPath } from "./product-status";

describe("product maturity status registry", () => {
  it("marks the five approved incomplete workflows as beta", () => {
    expect(PRODUCT_STATUSES).toMatchObject({
      assistant: { path: "/assistant", label: "Beta", maturity: "beta" },
      projectImport: { path: "/projects/new", label: "Beta", maturity: "beta" },
      completedQuotes: { path: "/suppliers", label: "Beta", maturity: "beta" },
      marketplacePublishing: { path: "/marketplace", label: "Beta", maturity: "beta" },
      buildWorkspace: { path: "/builder", label: "Beta", maturity: "beta" },
    });
  });

  it("keeps unreleased Build Workspace marketing content coming soon", () => {
    expect(PRODUCT_STATUSES.futureBuildWorkspace).toEqual({
      path: null,
      label: "Coming soon",
      maturity: "coming-soon",
    });
  });

  it("resolves nested beta routes without labeling core catalog routes", () => {
    expect(productStatusForPath("/marketplace/new")?.label).toBe("Beta");
    expect(productStatusForPath("/assistant/thread-1")?.label).toBe("Beta");
    expect(productStatusForPath("/projects/new")?.label).toBe("Beta");
    expect(productStatusForPath("/projects/atlas")).toBeNull();
    expect(productStatusForPath("/projects")).toBeNull();
  });
});
