import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectEditorial } from "./ProjectEditorial";
import { projectEditorial } from "@/lib/project-editorial";

const so101 = projectEditorial("therobotstudio-so-arm100") ?? [];

describe("ProjectEditorial", () => {
  it("renders nothing when the project has no curated notes", () => {
    const { container } = render(<ProjectEditorial sections={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the SO-101 build notes with prose, bullets and source links", () => {
    render(<ProjectEditorial sections={so101} />);
    expect(screen.getByText("SO-101 at a glance")).toBeInTheDocument();
    expect(screen.getByText("Motors by arm and gear")).toBeInTheDocument();
    // Prices as written upstream, dollar signs intact (parity with the crawler prerender).
    expect(screen.getByText(/US\$121\.94/)).toBeInTheDocument();
    expect(screen.getByText(/US\$229\.88/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "LeRobot SO-101 guide" });
    expect(link).toHaveAttribute("href", "https://huggingface.co/docs/lerobot/so101");
  });
});
