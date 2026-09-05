import { describe, expect, it } from "vitest";
import generatorSource from "../../scripts/generate-project-descriptions.ts?raw";

describe("generated description source packet", () => {
  it("never uses the mutable summary or description as evidence for their own replacement", () => {
    expect(generatorSource).not.toContain("add(project.summary");
    expect(generatorSource).not.toContain("add(project.description");
    expect(generatorSource).toContain("add(`${project.name} is cataloged as");
    expect(generatorSource).toContain("const evidence = Array.isArray(rpps.evidence)");
    expect(generatorSource).toContain("isUsefulEvidenceClaim");
    expect(generatorSource).toContain("commercialDescriptionFact");
    expect(generatorSource).not.toContain("JSON.stringify(commercial).slice");
    expect(generatorSource).toContain("if (bom) add(bomFact(bom)");
  });

  it("invalidates old generations when the prompt or model contract changes", () => {
    expect(generatorSource).toContain('project-description/2-no-internal-identifiers');
    expect(generatorSource).toContain("record.promptVersion !== promptVersion");
    expect(generatorSource).toContain("record.modelId !== modelId");
    expect(generatorSource).toContain("attempt <= 5");
  });
});
