import { describe, expect, it } from "vitest";
import indexSource from "../pages/Index.tsx?raw";

describe("homepage build workspace replacement", () => {
  it("removes recently indexed technical parts and renders the workspace preview", () => {
    expect(indexSource).not.toContain("Recently indexed technical part profiles");
    expect(indexSource).not.toContain("Supporting component intelligence");
    expect(indexSource).toContain("<BuildWorkspacePreview />");
  });
});
