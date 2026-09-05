import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BuildWorkspacePreview } from "./BuildWorkspacePreview";

describe("BuildWorkspacePreview", () => {
  it("previews replacement tracking and build inventory in a compact coming-soon frame", () => {
    render(<MemoryRouter><BuildWorkspacePreview /></MemoryRouter>);
    const region = screen.getByRole("region", { name: "Build Workspace preview" });
    expect(region).toHaveTextContent("Build Workspace");
    expect(region).toHaveTextContent("Coming soon");
    expect(region).toHaveTextContent("Replacement compatibility");
    expect(region).toHaveTextContent("BOM revision");
    expect(region).toHaveTextContent("Price watch");
    expect(region).toHaveTextContent("Availability watch");
    expect(screen.getByRole("link", { name: "Explore current build tools" })).toHaveAttribute("href", "/builder");
  });
});
