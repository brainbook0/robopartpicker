import { describe, expect, it } from "vitest";
import { extractProcedureCandidates } from "./project-procedures";

describe("project import procedure candidates", () => {
  it("rejects README assembly noise and short guides while retaining a substantive assembly document", () => {
    const candidates = extractProcedureCandidates(new Map([
      ["README.md", "# Robot\n\n## Assembly\n1. Read the overview.\n2. Open the repository.\n3. Review the examples.\n"],
      ["docs/build_notes.md", "# Build Notes\n\n## Assembly\n1. Print the chassis.\n2. Install the controller.\n"],
      ["docs/hardware_assembly.md", "# Hardware Assembly\n\n## Assembly\n1. Bolt the motors to the chassis.\n2. Route and strain-relieve the wiring.\n3. Verify every structural fastener.\n"],
    ]), "source-quality-test");

    expect(candidates.filter((candidate) => candidate.kind === "assembly")).toEqual([
      expect.objectContaining({
        sourcePath: "docs/hardware_assembly.md",
        steps: [
          "Bolt the motors to the chassis.",
          "Route and strain-relieve the wiring.",
          "Verify every structural fastener.",
        ],
      }),
    ]);
  });
});
