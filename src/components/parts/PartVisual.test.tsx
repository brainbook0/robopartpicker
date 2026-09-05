import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import partsTableSource from "./PartsTable.tsx?raw";
import { PartVisual } from "./PartVisual";
import type { CatalogPart, CatalogPartFile } from "@/shared/catalog";

type VisualPart = Pick<CatalogPart, "name" | "category" | "maker" | "mpn" | "files">;

function file(overrides: Partial<CatalogPartFile> = {}): CatalogPartFile {
  return {
    id: "file-1",
    originalName: "product.webp",
    mediaType: "image/webp",
    sizeBytes: 1024,
    purpose: "image",
    contentUrl: "/api/v1/files/content?id=file-1",
    ...overrides,
  };
}

function part(overrides: Partial<VisualPart> = {}): VisualPart {
  return {
    name: "Precision Actuator",
    category: "actuator",
    maker: "Test Motors",
    mpn: "PA-42",
    files: [],
    ...overrides,
  };
}

describe("PartVisual", () => {
  it("renders the first managed product image with descriptive alt text", () => {
    render(<PartVisual part={part({ files: [file(), file({ id: "file-2", contentUrl: "/second.webp" })] })} compact />);
    const image = screen.getByRole("img", { name: "Source-backed product image for Precision Actuator" });
    expect(image).toHaveAttribute("src", "/api/v1/files/content?id=file-1");
    expect(image).toHaveClass("object-contain", "h-10", "w-14");
  });

  it("accepts a detail-page size without retaining the table dimensions", () => {
    render(<PartVisual part={part({ files: [file()] })} className="h-40 w-full" />);
    const image = screen.getByRole("img", { name: "Source-backed product image for Precision Actuator" });
    expect(image).toHaveClass("h-40", "w-full");
    expect(image).not.toHaveClass("h-24", "w-14");
  });

  it("ignores files that are not declared image media", () => {
    render(<PartVisual part={part({ files: [
      file({ purpose: "datasheet", mediaType: "image/png" }),
      file({ purpose: "image", mediaType: "application/pdf" }),
    ] })} compact />);
    expect(screen.getByRole("img", { name: /Actuator identity illustration/iu })).toBeInTheDocument();
  });

  it("renders an honest category illustration when no image exists", () => {
    render(<PartVisual part={part()} compact />);
    const fallback = screen.getByRole("img", {
      name: "Actuator identity illustration for Precision Actuator by Test Motors, MPN PA-42; not a product photograph.",
    });
    expect(fallback).toHaveTextContent("Actuator");
    expect(fallback.textContent).not.toMatch(/\bno photo\b/iu);
  });

  it("humanizes unknown categories without implying an exact product depiction", () => {
    render(<PartVisual part={part({ name: "Power Brick", category: "power_module" })} />);
    const fallback = screen.getByRole("img", {
      name: "Power module identity illustration for Power Brick by Test Motors, MPN PA-42; not a product photograph.",
    });
    expect(fallback).toHaveTextContent("Power module");
  });

  it("shows exact catalog identity on the full-size fallback without calling it a photo", () => {
    render(<PartVisual part={part()} className="h-44 w-full" />);
    const fallback = screen.getByRole("img", { name: /identity illustration.*precision actuator.*test motors.*pa-42.*not a product photograph/iu });
    expect(fallback).toHaveTextContent("Precision Actuator");
    expect(fallback).toHaveTextContent("Test Motors");
    expect(fallback).toHaveTextContent("PA-42");
    expect(fallback.textContent).not.toMatch(/product photo/iu);
  });

  it("permanently switches a failed image to the honest fallback", () => {
    render(<PartVisual part={part({ files: [file()] })} compact />);
    fireEvent.error(screen.getByRole("img", { name: "Source-backed product image for Precision Actuator" }));
    expect(screen.queryByRole("img", { name: "Source-backed product image for Precision Actuator" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Actuator identity illustration/iu })).toBeInTheDocument();
  });
});

describe("PartsTable visual integration", () => {
  it("imports and renders PartVisual without the literal no-photo label", () => {
    expect(partsTableSource).toContain('import { PartVisual } from "./PartVisual";');
    expect(partsTableSource).toContain("<PartVisual part={p} compact />");
    expect(partsTableSource).not.toMatch(/\bno photo\b/iu);
  });
});
