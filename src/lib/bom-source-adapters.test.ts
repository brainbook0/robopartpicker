import { describe, expect, it } from "vitest";
import { parseExplicitBomArtifact } from "./bom-source-adapters";
import { validateSourceAccounting } from "@/shared/bomPublication";

function assertAccounted(result: ReturnType<typeof parseExplicitBomArtifact>) {
  expect(validateSourceAccounting(result.sourceObjectIds, result.outcomes)).toEqual({ ok: true, errors: [] });
}

describe("explicit BOM source adapters", () => {
  it("parses CSV rows without defaulting a missing quantity", () => {
    const result = parseExplicitBomArtifact({
      path: "hardware/bom.csv",
      text: "Name,Manufacturer,MPN,Quantity\nDrive motor,Test Motors,TM-42,2\nController,Control Co,CTRL-1,\n,Unknown,MISSING,4\n",
    });

    expect(result.adapterId).toBe("bom-csv-v2");
    expect(result.candidates).toEqual([
      expect.objectContaining({ name: "Drive motor", quantity: 2, manufacturer: "Test Motors", mpn: "TM-42", sourceLocator: "hardware/bom.csv#row2" }),
    ]);
    expect(result.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceObjectId: "hardware/bom.csv#row3", outcome: "rejected", reason: "quantity_missing" }),
      expect.objectContaining({ sourceObjectId: "hardware/bom.csv#row4", outcome: "rejected", reason: "name_missing" }),
    ]));
    assertAccounted(result);
  });

  it("parses HTML, JSON, and YAML BOM rows through named adapters", () => {
    const html = parseExplicitBomArtifact({ path: "docs/bom.html", text: "<table><tr><th>Part</th><th>Qty</th></tr><tr><td>Bracket</td><td>4</td></tr></table>" });
    const json = parseExplicitBomArtifact({ path: "bom.json", text: JSON.stringify({ components: [{ name: "Bearing", quantity: 8, manufacturer: "SKF", mpn: "608" }] }) });
    const yaml = parseExplicitBomArtifact({ path: "bom.yaml", text: "parts:\n  - name: Belt\n    quantity: 2\n    manufacturer: Gates\n    mpn: GT2\n" });

    expect(html).toMatchObject({ adapterId: "bom-html-v2", candidates: [expect.objectContaining({ name: "Bracket", quantity: 4 })] });
    expect(json).toMatchObject({ adapterId: "bom-json-v2", candidates: [expect.objectContaining({ name: "Bearing", quantity: 8 })] });
    expect(yaml).toMatchObject({ adapterId: "bom-yaml-v2", candidates: [expect.objectContaining({ name: "Belt", quantity: 2 })] });
    [html, json, yaml].forEach(assertAccounted);
  });

  it("treats each KiCad netlist component as one explicit source instance", () => {
    const result = parseExplicitBomArtifact({
      path: "controller.xml",
      text: "<export><components><comp ref=\"R1\"><value>10k</value><fields><field name=\"Manufacturer\">Yageo</field><field name=\"MPN\">RC0402</field></fields></comp><comp ref=\"R2\"><value>10k</value><fields><field name=\"Manufacturer\">Yageo</field><field name=\"MPN\">RC0402</field></fields></comp></components></export>",
    });

    expect(result.adapterId).toBe("bom-kicad-xml-v2");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((candidate) => candidate.quantity === 1 && candidate.quantityBasis === "source-instance")).toBe(true);
    assertAccounted(result);
  });

  it("never treats robot model or CAD artifacts as purchased BOM sources", () => {
    for (const path of ["robot.urdf", "meshes/chassis.stl", "cad/assembly.step"]) {
      const result = parseExplicitBomArtifact({ path, text: "<robot name=\"test\"/>" });
      expect(result.publishCapable).toBe(false);
      expect(result.candidates).toEqual([]);
      expect(result.outcomes).toEqual([{ sourceObjectId: path, outcome: "unsupported", reason: "not_an_explicit_bom" }]);
      assertAccounted(result);
    }
  });
});
