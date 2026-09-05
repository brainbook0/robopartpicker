import { describe, expect, it } from "vitest";
import { selectPartPreview } from "./partPreview";
import type { CatalogPartFile } from "@/shared/catalog";

function file(overrides: Partial<CatalogPartFile> = {}): CatalogPartFile {
  return {
    id: "file-1",
    originalName: "housing.stl",
    mediaType: "model/stl",
    sizeBytes: 100,
    purpose: "cad",
    contentUrl: "/api/v1/files/content?id=file-1",
    ...overrides,
  };
}

describe("selectPartPreview", () => {
  it("prefers native STEP over STL and OBJ for an exact component", () => {
    const stl = file({ id: "stl", originalName: "housing.stl" });
    const obj = file({ id: "obj", originalName: "housing.obj", mediaType: "model/obj" });
    const step = file({ id: "step", originalName: "housing.step", mediaType: "model/step" });

    expect(selectPartPreview([stl, obj, step])).toEqual({ kind: "step", file: step });
  });

  it("selects supported STL and OBJ component artifacts", () => {
    const stl = file({ originalName: "gear.STL" });
    const obj = file({ originalName: "gear.obj", mediaType: "model/obj" });
    expect(selectPartPreview([stl])).toEqual({ kind: "stl", file: stl });
    expect(selectPartPreview([obj])).toEqual({ kind: "obj", file: obj });
  });

  it("ignores non-CAD, empty, and unsupported files", () => {
    expect(selectPartPreview([
      file({ purpose: "image", originalName: "photo.stl" }),
      file({ originalName: "drawing.dxf" }),
      file({ originalName: "part.step", contentUrl: "" }),
    ])).toBeNull();
  });
});
