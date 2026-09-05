import { describe, expect, it } from "vitest";
import { validateGeneratedProjectDescription, type ProjectDescriptionFact } from "./generatedProjectDescription";

const facts: ProjectDescriptionFact[] = [
  { id: "identity", text: "Atlas is a commercial humanoid robot developed by Boston Dynamics.", sourceUrl: "https://bostondynamics.com/atlas" },
  { id: "mass", text: "The published mass is 89 kg.", sourceUrl: "https://bostondynamics.com/atlas/specifications" },
  { id: "bom", text: "The manufacturer has not published a model-specific bill of materials.", sourceUrl: "https://bostondynamics.com/atlas" },
];

const valid = {
  summary: "Atlas is a commercial humanoid from Boston Dynamics, with an 89 kg published mass and no public model-specific BOM.",
  summarySourceRefs: ["identity", "mass", "bom"],
  paragraphs: [
    { sentences: [
      { text: "Atlas is a commercial humanoid developed by Boston Dynamics.", sourceRefs: ["identity"] },
      { text: "Its published mass is 89 kg.", sourceRefs: ["mass"] },
    ] },
    { sentences: [
      { text: "The procurement limit is simple: the manufacturer hasn't published a model-specific BOM.", sourceRefs: ["bom"] },
    ] },
  ],
  omittedFacts: [],
};

describe("generated project descriptions", () => {
  it("accepts third-person, source-cited prose in Luca's direct rhythm", () => {
    const report = validateGeneratedProjectDescription(valid, facts);
    expect(report).toMatchObject({ ok: true, errors: [] });
    expect(report.description).toContain("\n\n");
  });

  it("rejects missing references, invented numbers, first-person claims, and AI tells", () => {
    const report = validateGeneratedProjectDescription({
      ...valid,
      summary: "I reviewed Atlas, a seamless platform weighing 120 kg—an important breakthrough.",
      summarySourceRefs: ["identity"],
      paragraphs: [{ sentences: [
        { text: "It weighs 120 kg; this crucial capability changes everything.", sourceRefs: ["mass"] },
        { text: "No source here.", sourceRefs: [] },
      ] }],
    }, facts);
    expect(report.ok).toBe(false);
    expect(report.errors.join(" ")).toMatch(/first-person/iu);
    expect(report.errors.join(" ")).toMatch(/unsupported number 120/iu);
    expect(report.errors.join(" ")).toMatch(/em dash/iu);
    expect(report.errors.join(" ")).toMatch(/semicolon/iu);
    expect(report.errors.join(" ")).toMatch(/AI-style phrase/iu);
    expect(report.errors.join(" ")).toMatch(/source reference/iu);
  });

  it("rejects source IDs that are not in the bounded fact packet", () => {
    const report = validateGeneratedProjectDescription({
      ...valid,
      paragraphs: [{ sentences: [{ text: "Atlas can fly.", sourceRefs: ["invented"] }] }],
    }, facts);
    expect(report.ok).toBe(false);
    expect(report.errors).toContain("sentence 1 references unknown fact invented");
  });

  it("rejects cryptographic hashes and checksum jargon from customer-facing prose", () => {
    const hash = "5e631f57becff5d1c91ec1ed60b4129e070402d0216bfc3e08106639757793f5";
    const report = validateGeneratedProjectDescription({
      ...valid,
      summary: `Atlas uses an official image verified by SHA-256 ${hash}.`,
      summarySourceRefs: ["identity"],
      paragraphs: [{ sentences: [
        { text: `The product image is verified by SHA-256 ${hash}.`, sourceRefs: ["identity"] },
        { text: "Atlas remains a commercial humanoid platform.", sourceRefs: ["identity"] },
      ] }],
    }, facts);
    expect(report.ok).toBe(false);
    expect(report.errors.join(" ")).toMatch(/cryptographic hash|checksum jargon/iu);
  });

  it("rejects internal catalog revision mechanics from customer-facing prose", () => {
    const report = validateGeneratedProjectDescription({
      ...valid,
      paragraphs: [{ sentences: [
        { text: "Atlas is a commercial humanoid developed by Boston Dynamics.", sourceRefs: ["identity"] },
        { text: "The source record is catalog-2026-08-25-top300-v1.", sourceRefs: ["identity"] },
      ] }],
    }, facts);
    expect(report.ok).toBe(false);
    expect(report.errors).toContain("sentence 2 contains an internal catalog revision");
  });

  it("accepts punctuation changes around a source-backed technical number", () => {
    const technicalFacts = [{ id: "arm", text: "The project name identifies a 6DOF mobile robotic arm.", sourceUrl: "https://example.com/arm" }];
    const report = validateGeneratedProjectDescription({
      summary: "The project documents a source-linked 6-DOF mobile robotic arm without adding unsupported performance claims.",
      summarySourceRefs: ["arm"],
      paragraphs: [{ sentences: [
        { text: "The source identifies a 6-DOF mobile robotic arm.", sourceRefs: ["arm"] },
        { text: "The description stays inside that published identity.", sourceRefs: ["arm"] },
      ] }],
      omittedFacts: [],
    }, technicalFacts);
    expect(report.errors).not.toContain("summary contains unsupported number 6");
    expect(report.errors).not.toContain("sentence 1 contains unsupported number 6");
  });

  it("treats equivalent integer and decimal formatting as the same sourced number", () => {
    const numericFacts = [{ id: "version", text: "The published platform version is 3.", sourceUrl: "https://example.com/v3" }];
    const report = validateGeneratedProjectDescription({
      summary: "The catalog tracks platform version 3.0 from the published source without adding unsupported specifications.",
      summarySourceRefs: ["version"],
      paragraphs: [{ sentences: [
        { text: "The published platform version is 3.0.", sourceRefs: ["version"] },
        { text: "No additional performance claim is attached.", sourceRefs: ["version"] },
      ] }],
      omittedFacts: [],
    }, numericFacts);
    expect(report.errors.join(" ")).not.toMatch(/unsupported number 3\.0/iu);
  });
});
