import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductStatusBadge } from "./ProductStatusBadge";
import { PRODUCT_STATUSES } from "@/lib/product-status";

describe("ProductStatusBadge", () => {
  it("renders literal beta text with an accessible feature-status label", () => {
    render(<ProductStatusBadge status={PRODUCT_STATUSES.assistant} />);
    expect(screen.getByText("Beta")).toHaveAttribute("aria-label", "Beta feature status");
  });

  it("keeps coming-soon status distinct from beta", () => {
    render(<ProductStatusBadge status={PRODUCT_STATUSES.futureBuildWorkspace} />);
    expect(screen.getByText("Coming soon")).toHaveAttribute("aria-label", "Coming soon feature status");
  });
});
