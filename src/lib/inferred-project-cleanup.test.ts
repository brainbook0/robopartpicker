import { describe, expect, it } from "vitest";
import { cleanInferredProjectContent } from "./inferred-project-cleanup";

function fixture() {
  return {
    rpps_version: "1.0.0",
    name: "Example quadruped",
    slug: "example-quadruped",
    version: "1.0.0",
    summary: "A source project",
    description: "Build files and controller software.",
    bom: [
      { name: "Invented motor", qty: 4, fabricated: false, notes: undefined as string | undefined },
      { name: "Invented frame", qty: 1, fabricated: true, notes: undefined as string | undefined },
    ],
    hardware: { dof: 12, compute: "Embedded microcontroller" },
    software: { ros_support: "none", languages: ["Python"] },
    build: {
      difficulty: "intermediate",
      required_tools: ["Basic hand tools", "3D printer"],
      required_skills: ["Basic mechanical assembly", "3D printing"],
      estimated_time_hours: 24,
      estimated_cost_usd: 1200,
    },
    assembly: [{
      id: "assembly-1",
      title: "Fabricate and assemble the structure",
      body: "Fabricate and assemble the 1 structural links following the source documentation (https://github.com/example/robot).",
      duration_min: 1440,
    }],
    reproducibility: { access: "open-source", bom: true, assembly: true, pricing: false },
    evidence: [
      { claim: "DoF defaults to a category-typical 12 for a quadruped design.", source_type: "inference", confidence: 0.5 },
      { claim: "Build time defaults to a category-typical 24 hours for a quadruped design.", source_type: "inference", confidence: 0.5 },
      { claim: "Estimated build cost defaults to a category-typical $1200 for a quadruped design; not a quoted price.", source_type: "inference", confidence: 0.4 },
      { claim: "Bill of materials derived from repository text by test-model; 2 parts. Verify before sourcing.", source_type: "inference", confidence: 0.5 },
      { claim: "Pinned repository evidence", source_type: "repo", source_url: "https://github.com/example/robot", confidence: 1 },
    ],
  };
}

describe("inferred project cleanup", () => {
  it("removes exact legacy defaults while retaining sourced content", () => {
    const result = cleanInferredProjectContent(fixture(), "https://example.test");
    expect(result.rpps).toMatchObject({
      bom: [],
      software: { languages: ["Python"] },
      build: { required_tools: ["3D printer"], required_skills: ["3D printing"] },
      reproducibility: { bom: false, assembly: false, pricing: false },
      evidence: [{ claim: "Pinned repository evidence", source_type: "repo" }],
    });
    expect(result.rpps).not.toHaveProperty("hardware");
    expect(result.rpps).not.toHaveProperty("assembly");
    expect(result.stats).toMatchObject({
      inferenceEntries: 4,
      removedDof: true,
      removedTimeHours: true,
      removedCostUsd: 1200,
      removedAiBomLines: 2,
      removedGenericAssembly: 1,
      removedGenericCompute: true,
      removedUnsourcedDifficulty: true,
      removedUnsupportedRosNone: true,
      removedBasicTools: 1,
      removedBasicSkills: 1,
    });
  });

  it("removes stale inference evidence without deleting a subsequently corrected value", () => {
    const input = fixture();
    input.build.estimated_cost_usd = 999;
    const result = cleanInferredProjectContent(input, "https://example.test");
    expect((result.rpps.build as Record<string, unknown>).estimated_cost_usd).toBe(999);
    expect(result.stats.removedCostUsd).toBeNull();
  });

  it("removes only the original AI BOM prefix when later source-derived lines were appended", () => {
    const input = fixture();
    input.bom.push({ name: "Pinned source part", qty: 2, fabricated: true, notes: "Derived from model file chassis.stl" });
    const result = cleanInferredProjectContent(input, "https://example.test");
    expect(result.rpps.bom).toEqual([{ name: "Pinned source part", qty: 2, fabricated: true, notes: "Derived from model file chassis.stl" }]);
    expect(result.stats.removedAiBomLines).toBe(2);
    expect(result.rpps).toMatchObject({ reproducibility: { bom: true } });
  });

  it("retains explicit difficulty and negative ROS statements present in source text", () => {
    const input = fixture();
    input.description = "An intermediate build that explicitly does not use ROS.";
    const result = cleanInferredProjectContent(input, "https://example.test");
    expect(result.rpps).toMatchObject({ build: { difficulty: "intermediate" }, software: { ros_support: "none" } });
  });

  it("fails closed on unknown inference claims or mismatched AI BOM counts", () => {
    const unknown = fixture();
    unknown.evidence[0].claim = "A model guessed something else.";
    expect(() => cleanInferredProjectContent(unknown, "https://example.test")).toThrow("Unsupported inference claim");
    const mismatch = fixture();
    mismatch.bom.pop();
    expect(() => cleanInferredProjectContent(mismatch, "https://example.test")).toThrow("AI BOM claim says 2 lines but RPPS contains only 1");
  });
});
