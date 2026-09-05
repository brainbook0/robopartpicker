import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceHistoryPlaceholder } from "./PriceHistoryPlaceholder";

describe("PriceHistoryPlaceholder", () => {
  it("reserves a project aggregate price-history frame without invented points", () => {
    render(<PriceHistoryPlaceholder entityName="Unitree G1" kind="project" />);
    const region = screen.getByRole("region", { name: "Unitree G1 price history" });
    expect(region).toHaveTextContent("Price history");
    expect(region).toHaveTextContent("Coming soon");
    expect(region).toHaveTextContent("aggregate of source-backed BOM prices");
    expect(region).toHaveTextContent("No historical prices are plotted yet");
    expect(region.querySelectorAll("[data-price-series]")).toHaveLength(0);
  });

  it("describes part price observations separately", () => {
    render(<PriceHistoryPlaceholder entityName="Dynamixel XH540" kind="part" />);
    expect(screen.getByRole("region", { name: "Dynamixel XH540 price history" })).toHaveTextContent("verified component price observations");
  });
});
