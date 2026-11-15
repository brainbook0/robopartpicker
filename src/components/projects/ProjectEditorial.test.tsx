import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectEditorial } from "./ProjectEditorial";
import { projectEditorial } from "@/lib/project-editorial";

const so101 = projectEditorial("therobotstudio-so-arm100") ?? [];
const mobileAloha = projectEditorial("mobile-aloha") ?? [];

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
    // US$121.94 / US$229.88 also appear in the by-region sourcing list, so allow >1 match.
    expect(screen.getAllByText(/US\$121\.94/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/US\$229\.88/).length).toBeGreaterThan(0);
    const link = screen.getByRole("link", { name: "LeRobot SO-101 guide" });
    expect(link).toHaveAttribute("href", "https://huggingface.co/docs/lerobot/so101");
  });

  it("adds the sourcing, kit and add-on notes from the upstream README", () => {
    render(<ProjectEditorial sections={so101} />);
    expect(screen.getByText("Where to buy the parts (by region)")).toBeInTheDocument();
    expect(screen.getByText("Pre-built kits and printed frames")).toBeInTheDocument();
    expect(screen.getByText("Extending the arm")).toBeInTheDocument();
    // Regional list prices, exactly as written upstream.
    expect(screen.getByText(/¥1,343\.16/)).toBeInTheDocument();
    expect(screen.getByText(/¥44,530/)).toBeInTheDocument();
    // The XLeRobot add-on cost, quoted from the repository's optional-hardware section.
    expect(screen.getByText(/US\$660/)).toBeInTheDocument();
    const source = screen.getByRole("link", { name: "upstream sourcing tables" });
    expect(source).toHaveAttribute("href", "https://github.com/TheRobotStudio/SO-ARM100#sourcing-parts");
  });

  it("renders the source-backed Mobile ALOHA hardware notes", () => {
    render(<ProjectEditorial sections={mobileAloha} />);
    expect(screen.getByText("What Mobile ALOHA is")).toBeInTheDocument();
    expect(screen.getByText("Hardware the project uses (from its README)")).toBeInTheDocument();
    // Hardware facts quoted from the repository's README.
    expect(screen.getByText(/XM430-W350/)).toBeInTheDocument();
    expect(screen.getByText(/AgileX Tracer/)).toBeInTheDocument();
    expect(screen.getByText(/36 motors/)).toBeInTheDocument();
    const repo = screen.getByRole("link", { name: "MarkFzp/mobile-aloha README" });
    expect(repo).toHaveAttribute("href", "https://github.com/MarkFzp/mobile-aloha");
  });
});
