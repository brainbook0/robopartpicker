import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectEditorial } from "./ProjectEditorial";
import { projectEditorial } from "@/lib/project-editorial";

const so101 = projectEditorial("therobotstudio-so-arm100") ?? [];
const mobileAloha = projectEditorial("mobile-aloha") ?? [];
const xlerobot = projectEditorial("xlerobot") ?? [];
const osr = projectEditorial("nasa-jpl-open-source-rover") ?? [];
const openbot = projectEditorial("openbot") ?? [];
const openmower = projectEditorial("openmower") ?? [];

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

  it("renders the XLeRobot cost and kit notes from the upstream README", () => {
    render(<ProjectEditorial sections={xlerobot} />);
    expect(screen.getByText("XLeRobot at a glance")).toBeInTheDocument();
    expect(screen.getByText("What the project says it costs")).toBeInTheDocument();
    expect(screen.getByText("Kits and documentation")).toBeInTheDocument();
    // Costs as written upstream.
    expect(screen.getAllByText(/US\$660/).length).toBeGreaterThan(0);
    expect(screen.getByText(/US\$579/)).toBeInTheDocument();
    const docs = screen.getByRole("link", { name: "XLeRobot documentation" });
    expect(docs).toHaveAttribute("href", "https://xlerobot.readthedocs.io/en/latest/index.html");
  });

  it("renders the source-backed JPL Open Source Rover build notes", () => {
    render(<ProjectEditorial sections={osr} />);
    expect(screen.getByText("The JPL Open Source Rover at a glance")).toBeInTheDocument();
    expect(screen.getByText("How it drives")).toBeInTheDocument();
    expect(screen.getByText("Build roadmap and effort")).toBeInTheDocument();
    // The project's own cost figure, as written upstream.
    expect(screen.getByText(/US\$1,600/)).toBeInTheDocument();
    expect(screen.getByText(/100 person-hours/)).toBeInTheDocument();
    const code = screen.getByRole("link", { name: "osr-rover-code" });
    expect(code).toHaveAttribute("href", "https://github.com/nasa-jpl/osr-rover-code");
  });

  it("renders the source-backed OpenBot build notes", () => {
    render(<ProjectEditorial sections={openbot} />);
    expect(screen.getByText("OpenBot at a glance")).toBeInTheDocument();
    expect(screen.getByText("The body options")).toBeInTheDocument();
    expect(screen.getByText("The software stack")).toBeInTheDocument();
    // The project's own body-cost figure, as written upstream.
    expect(screen.getByText(/about US\$50/)).toBeInTheDocument();
    // The repo link is cited in two sections, so allow >1 match; all point at the same repo.
    const repos = screen.getAllByRole("link", { name: "ob-f/OpenBot" });
    expect(repos.length).toBeGreaterThan(0);
    expect(repos[0]).toHaveAttribute("href", "https://github.com/ob-f/OpenBot");
  });

  it("renders the source-backed OpenMower build notes", () => {
    render(<ProjectEditorial sections={openmower} />);
    expect(screen.getByText("OpenMower at a glance")).toBeInTheDocument();
    expect(screen.getByText("How it works")).toBeInTheDocument();
    expect(screen.getByText("The repositories")).toBeInTheDocument();
    // The project's own build-guide figure, as written upstream.
    expect(screen.getByText(/€700/)).toBeInTheDocument();
    // The repo link is cited in two sections, so allow >1 match; all point at the same repo.
    const repos = screen.getAllByRole("link", { name: "ClemensElflein/OpenMower" });
    expect(repos.length).toBeGreaterThan(0);
    expect(repos[0]).toHaveAttribute("href", "https://github.com/ClemensElflein/OpenMower");
  });
});
