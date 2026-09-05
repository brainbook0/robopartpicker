import { describe, expect, it } from "vitest";
import { parseExplicitBomArtifact } from "./bom-source-adapters";
import { compileProjectBom } from "./bom-compiler";

describe("compileProjectBom", () => {
  it("returns honest no-source states for physical, commercial, software, and unknown projects", async () => {
    await expect(compileProjectBom({ projectId: "physical", projectKind: "physical_design", commercial: false, sourceRevision: "abc", artifacts: [] }))
      .resolves.toMatchObject({ publicationState: "unavailable", lines: [] });
    await expect(compileProjectBom({ projectId: "commercial", projectKind: "commercial_showcase", commercial: true, sourceRevision: "abc", artifacts: [] }))
      .resolves.toMatchObject({ publicationState: "manufacturer_unavailable", lines: [] });
    await expect(compileProjectBom({ projectId: "software", projectKind: "robotics_software", commercial: false, sourceRevision: "abc", artifacts: [] }))
      .resolves.toMatchObject({ publicationState: "not_applicable", lines: [] });
    await expect(compileProjectBom({ projectId: "unknown", projectKind: "unknown", commercial: false, sourceRevision: "abc", artifacts: [] }))
      .resolves.toMatchObject({ publicationState: "classification_required", lines: [] });
  });

  it("aggregates only exact manufacturer and MPN identities while retaining every locator", async () => {
    const parsed = parseExplicitBomArtifact({
      path: "bom.csv",
      text: "Name,Manufacturer,MPN,Quantity\nMotor A,Test Motors,TM-42,2\nMotor A spare,Test Motors,TM-42,1\nUnresolved bracket,,,4\n",
    });
    const result = await compileProjectBom({
      projectId: "robot",
      projectKind: "physical_design",
      commercial: false,
      sourceRevision: "deadbeef",
      artifacts: [{ path: "bom.csv", checksumSha256: "a".repeat(64), parse: parsed }],
    });

    expect(result.publicationState).toBe("verified");
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({ manufacturer: "Test Motors", mpn: "TM-42", quantity: 3 });
    expect(result.lines[0].aggregatedLocators).toEqual(["bom.csv#row2", "bom.csv#row3"]);
    expect(result.lines[1]).toMatchObject({ description: "Unresolved bracket", quantity: 4, componentMatchStatus: "unresolved" });
    expect(result.accounting.ok).toBe(true);
  });

  it("marks a source partial when any row is rejected and never publishes that rejected row", async () => {
    const parsed = parseExplicitBomArtifact({
      path: "bom.csv",
      text: "Name,Manufacturer,MPN,Quantity\nMotor,Test Motors,TM-42,2\nController,Control Co,CTRL-1,\n",
    });
    const result = await compileProjectBom({
      projectId: "partial",
      projectKind: "physical_design",
      commercial: false,
      sourceRevision: "abc",
      artifacts: [{ path: "bom.csv", parse: parsed }],
    });

    expect(result.publicationState).toBe("partial");
    expect(result.lines).toHaveLength(1);
    expect(result.omissions).toContainEqual(expect.objectContaining({ sourceObjectId: "bom.csv#row3", reason: "quantity_missing" }));
  });

  it("generates the same source fingerprint regardless of artifact input order", async () => {
    const first = parseExplicitBomArtifact({ path: "a.csv", text: "Name,Quantity\nA,1\n" });
    const second = parseExplicitBomArtifact({ path: "b.csv", text: "Name,Quantity\nB,2\n" });
    const base = { projectId: "stable", projectKind: "physical_design" as const, commercial: false, sourceRevision: "sha" };
    const left = await compileProjectBom({ ...base, artifacts: [{ path: "a.csv", parse: first }, { path: "b.csv", parse: second }] });
    const right = await compileProjectBom({ ...base, artifacts: [{ path: "b.csv", parse: second }, { path: "a.csv", parse: first }] });
    expect(left.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(right.sourceFingerprint).toBe(left.sourceFingerprint);
  });
});
