import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectMedia } from "./ProjectMedia";
import type { ProjectMediaInput } from "@/lib/projectMedia";

function project(overrides: Partial<ProjectMediaInput> = {}): ProjectMediaInput {
  return {
    name: "Media Bot",
    robot_category: "mobile",
    cover_image_url: null,
    media: [],
    rpps: {
      rpps_version: "1.0.0",
      name: "Media Bot",
      slug: "media-bot",
      version: "1.0.0",
      bom: [],
    },
    ...overrides,
  } as ProjectMediaInput;
}

describe("ProjectMedia", () => {
  it("renders card imagery as decorative inside a reserved aspect ratio", () => {
    const { container } = render(<ProjectMedia
      project={project({ media: [{ id: "one", contentUrl: "/one.webp", altText: "Source image", caption: null }] })}
      mode="card"
    />);
    expect(container.firstElementChild).toHaveClass("aspect-[16/8]");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(container).toHaveTextContent("Mobile / rover");
    expect(container.querySelector('[data-project-identity-illustration]')).toHaveClass("text-foreground");
  });

  it("hides the identity illustration after the first source image paints", () => {
    const { container } = render(<ProjectMedia
      project={project({ media: [
        { id: "one", contentUrl: "/one.webp", altText: null, caption: null },
        { id: "two", contentUrl: "/two.webp", altText: null, caption: null },
      ] })}
      mode="card"
    />);
    const fallback = container.querySelector('[data-project-identity-illustration]');
    expect(fallback).toHaveClass("opacity-100", "z-20", "pointer-events-none");
    fireEvent.load(container.querySelectorAll("img")[0]);
    expect(fallback).toHaveClass("opacity-0");
    expect(fallback).toHaveAttribute("data-image-loaded", "true");
  });

  it("renders meaningful detail-page alt text", () => {
    const { container } = render(<ProjectMedia
      project={project({ media: [{ id: "one", contentUrl: "/one.webp", altText: "Media Bot in its test cell", caption: null }] })}
      mode="detail"
      maxItems={1}
    />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "Media Bot in its test cell");
  });

  it("removes failed candidates and expands the remaining image", () => {
    const { container } = render(<ProjectMedia project={project({
      media: [
        { id: "one", contentUrl: "/one.webp", altText: null, caption: null },
        { id: "two", contentUrl: "/two.webp", altText: null, caption: null },
      ],
    })} mode="detail" />);
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    fireEvent.error(images[0]);
    const remaining = container.querySelectorAll("img");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveAttribute("src", "/two.webp");
    expect(remaining[0]).toHaveClass("col-span-2");
  });

  it("bounds three and four image mosaics to two explicit rows", () => {
    const { container } = render(<ProjectMedia project={project({
      media: [
        { id: "one", contentUrl: "/one.webp", altText: null, caption: null },
        { id: "two", contentUrl: "/two.webp", altText: null, caption: null },
        { id: "three", contentUrl: "/three.webp", altText: null, caption: null },
        { id: "four", contentUrl: "/four.webp", altText: null, caption: null },
      ],
    })} mode="detail" />);
    expect(container.querySelector(".grid")).toHaveClass("grid-rows-2");
  });

  it("requests a single downscaled thumbnail per card preview", () => {
    const { container } = render(<ProjectMedia project={project({
      media: [
        { id: "one", contentUrl: "/api/v1/files/content?id=aaa", altText: null, caption: null },
        { id: "two", contentUrl: "/api/v1/files/content?id=bbb", altText: null, caption: null },
        { id: "three", contentUrl: "/api/v1/files/content?id=ccc", altText: null, caption: null },
        { id: "four", contentUrl: "/api/v1/files/content?id=ddd", altText: null, caption: null },
      ],
    })} mode="card" />);
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    const src = new URL(images[0].getAttribute("src") as string, window.location.origin);
    expect(src.pathname).toBe("/api/v1/files/content");
    expect(src.searchParams.get("id")).toBe("aaa");
    expect(src.searchParams.get("v")).toBe("thumb");
  });

  it("hides the identity illustration on cards once the thumbnail paints", () => {
    const { container } = render(<ProjectMedia project={project({
      media: [{ id: "one", contentUrl: "/api/v1/files/content?id=aaa", altText: null, caption: null }],
    })} mode="card" />);
    const fallback = container.querySelector('[data-project-identity-illustration]');
    expect(fallback).toHaveClass("opacity-100");
    fireEvent.load(container.querySelector("img") as HTMLImageElement);
    expect(fallback).toHaveClass("opacity-0");
    expect(fallback).toHaveAttribute("data-image-loaded", "true");
  });

  it("shows a branded category fallback after every candidate fails", () => {
    const { container, getByRole } = render(<ProjectMedia
      project={project({ cover_image_url: "/broken.webp" })}
      mode="detail"
    />);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    const fallback = getByRole("img", {
      name: "Mobile / rover category illustration; no source-backed project image is available for Media Bot.",
    });
    expect(fallback).toHaveTextContent("Mobile / rover");
    expect(fallback).toHaveClass("bg-primary/10", "text-foreground");
  });
});
