import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { CatalogPart } from "@/shared/catalog";
import type { ComponentAlternativeRecommendation } from "@/shared/componentAlternatives";
import { PartAlternatives } from "./PartAlternatives";

function part(id: string, name: string, overrides: Partial<CatalogPart> = {}): CatalogPart {
  return {
    id,
    slug: id,
    category: "actuator",
    name,
    mpn: `MPN-${id}`,
    maker: "Test Motors",
    makerCountry: "US",
    region: "US",
    blurb: "",
    tags: [],
    openSource: false,
    cadAvailable: false,
    rosSupport: "none",
    warrantyMonths: 0,
    priceHistory: [],
    offers: [],
    failures: 0,
    compatibility: [],
    provenanceLabel: "source-backed",
    lifecycleStatus: "active",
    sourceUrl: `https://manufacturer.example/${id}`,
    freshnessAt: "2026-08-26T00:00:00Z",
    isDemo: false,
    files: [],
    technicalSpecifications: [],
    ...overrides,
  };
}

function recommendation(item: CatalogPart, reasons: string[]): ComponentAlternativeRecommendation {
  return { item, reasons, score: 42, compatibilityStatus: "unverified" };
}

describe("PartAlternatives", () => {
  const current = part("current", "Current actuator");
  const items = [
    recommendation(part("candidate-a", "Candidate A"), ["2 matching technical specifications", "Active lifecycle"]),
    recommendation(part("candidate-b", "Candidate B"), ["Same component category"]),
  ];

  it("renders recommendation visuals, match reasons, source/detail/compare links, and the compatibility warning", () => {
    render(<MemoryRouter><PartAlternatives current={current} items={items} /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Recommended alternatives" })).toBeInTheDocument();
    expect(screen.getByRole("note", { name: /candidate alternative - fit and electrical\/mechanical compatibility are not verified/iu })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /actuator identity illustration.*candidate a/iu })).toBeInTheDocument();
    expect(screen.getByText("2 matching technical specifications")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Candidate A" })).toHaveAttribute("href", "/parts/actuator/candidate-a");
    expect(screen.getByRole("link", { name: "Compare Current actuator and Candidate A" })).toHaveAttribute("href", "/parts/compare?ids=current%2Ccandidate-a");
    expect(screen.getByRole("link", { name: "Product source for Candidate A" })).toHaveAttribute("href", "https://manufacturer.example/candidate-a");
  });

  it("renders explicit loading, error, and empty states", () => {
    const { rerender } = render(<MemoryRouter><PartAlternatives current={current} items={[]} loading /></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading ranked alternatives");

    rerender(<MemoryRouter><PartAlternatives current={current} items={[]} error /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Alternative recommendations are temporarily unavailable");

    rerender(<MemoryRouter><PartAlternatives current={current} items={[]} /></MemoryRouter>);
    expect(screen.getByText("No same-category alternative is currently published.")).toBeInTheDocument();
  });
});
