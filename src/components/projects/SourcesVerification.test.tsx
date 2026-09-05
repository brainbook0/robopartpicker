import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SourcesVerification } from "./SourcesVerification";

const evidence = [{
  claim: "The controller communicates over CAN bus.",
  source_type: "datasheet",
  confidence: 0.92,
  retrieved_at: "2026-08-20T00:00:00Z",
  source_url: "https://example.com/datasheet.pdf",
}] as const;

describe("SourcesVerification", () => {
  it("renders a professional source card with verification strength and source action", () => {
    render(<MemoryRouter><SourcesVerification evidence={[...evidence]} projectId="project-1" /></MemoryRouter>);
    const region = screen.getByRole("region", { name: "Sources & verification" });
    expect(region).toHaveTextContent("Sources & verification");
    expect(region).toHaveTextContent("Datasheet");
    expect(region).toHaveTextContent("Strong verification");
    expect(region).toHaveTextContent("92% confidence");
    expect(screen.getByRole("link", { name: "Open datasheet source" })).toHaveAttribute("href", "https://example.com/datasheet.pdf");
  });

  it("offers a structured source proposal instead of a dash when empty", () => {
    render(<MemoryRouter><SourcesVerification evidence={[]} projectId="project-1" /></MemoryRouter>);
    expect(screen.getByText("Source verification is open")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Propose a source" })).toHaveAttribute("href", expect.stringContaining("project-1"));
    expect(screen.getByRole("region", { name: "Sources & verification" })).not.toHaveTextContent("—");
  });

  it("keeps image integrity evidence readable without exposing raw hashes", () => {
    const hash = "5e631f57becff5d1c91ec1ed60b4129e070402d0216bfc3e08106639757793f5";
    render(<MemoryRouter><SourcesVerification evidence={[{
      ...evidence[0],
      claim: `The project cover is an official product image verified by SHA-256 ${hash}.`,
    }]} projectId="project-1" /></MemoryRouter>);
    expect(screen.getByText("Official product image retained with integrity verification.")).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(hash, "iu"))).not.toBeInTheDocument();
  });

  it("renders official source enums as normal copy", () => {
    render(<MemoryRouter><SourcesVerification projectId="project-1" evidence={[{
      claim: "Manufacturer specifications for this model.", source_type: "official_product_page", confidence: 0.9,
    }]} /></MemoryRouter>);
    expect(screen.getByText("Official product page")).toBeInTheDocument();
    expect(screen.queryByText(/official_product_page/iu)).not.toBeInTheDocument();
  });
});
