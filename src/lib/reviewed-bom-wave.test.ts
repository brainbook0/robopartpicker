import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import wave from "../../data/bom-waves/2026-08-14-reviewed-wave2.json";
import { transformReviewedBomSource, validateReviewedBomWaveDefinition, type ReviewedBomProjectDefinition, type ReviewedBomSourceDefinition, type ReviewedBomWaveDefinition } from "./reviewed-bom-wave";

const project: ReviewedBomProjectDefinition = {
  project_id: "tny-360",
  repo_url: "https://github.com/tny-robotics/tny-360.git",
  revision: "42bbc828656d3ef79a6c92a504544d601bce0b4f",
  sources: [],
};

function source(transform: ReviewedBomSourceDefinition["transform"], path = "BOM/Test.md", format: ReviewedBomSourceDefinition["format"] = "markdown"): ReviewedBomSourceDefinition {
  return { path, format, sha256: "a".repeat(64), transform };
}

function workbook(sharedValues: string[], sheetXml: string): Uint8Array {
  const sharedStrings = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${sharedValues.map((value) => `<si><t>${value}</t></si>`).join("")}
</sst>`;
  return zipSync({
    "xl/sharedStrings.xml": strToU8(sharedStrings),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
  });
}

describe("reviewed BOM wave transforms", () => {
  it("parses only TNY Screws ### Total before ### Complete kit", () => {
    const markdown = `# Screws
### Per module
| Name | Quantity |
| --- | ---: |
| M2 guessed | 99 |

### Total
| Name | Quantity |
| --- | ---: |
| M2x6 screw | 12 |
| M3x8 screw | 4 |

### Complete kit
| Name | Quantity |
| --- | ---: |
| screwdriver | 1 |
`;

    const items = transformReviewedBomSource(project, source("tny-screws-total", "BOM/Screws.md"), markdown);

    expect(items.map((item) => item.name)).toEqual(["M2x6 screw", "M3x8 screw"]);
    expect(items.every((item) => item.category === "fastener")).toBe(true);
    expect(items.map((item) => item.ref)).toEqual([
      "tny-360-tny-screws-total-0001",
      "tny-360-tny-screws-total-0002",
    ]);
  });

  it("excludes TNY Cables ### Complete kit but keeps following peer sections", () => {
    const markdown = `# Cables
### Wires
| Type | Quantity |
| --- | ---: |
| JST-PH 3-pin | 4 |

### Complete kit
| Type | Quantity |
| --- | ---: |
| full cable kit | 1 |

### Spares
| Type | Quantity |
| --- | ---: |
| silicone wire | 2 |
`;

    const items = transformReviewedBomSource(project, source("tny-cables", "BOM/Cables.md"), markdown);

    expect(items.map((item) => item.name)).toEqual(["JST-PH 3-pin", "silicone wire"]);
    expect(items.every((item) => item.category === "cable")).toBe(true);
  });

  it("fills down NodeQuad blank Chinese names and omits rows without explicit quantity", () => {
    const values = ["序号", "名称", "规格", "数量", "螺丝", "M2x6", "M2x8", "支架", "6061铝"];
    const bytes = workbook(values, `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>
<row r="2"><c r="A2"><v>1</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c><c r="D2"><v>8</v></c></row>
<row r="3"><c r="A3"><v>2</v></c><c r="B3"/><c r="C3" t="s"><v>6</v></c><c r="D3"><v>4</v></c></row>
<row r="4"><c r="A4"><v>3</v></c><c r="B4" t="s"><v>7</v></c><c r="C4" t="s"><v>8</v></c><c r="D4"/></row>
</sheetData></worksheet>`);
    const nodequad: ReviewedBomProjectDefinition = { ...project, project_id: "nodequad12-micropython", repo_url: "https://github.com/violinlee/nodequad12-micropython.git" };

    const items = transformReviewedBomSource(nodequad, source("nodequad-xlsx-explicit", "resource/BOM.xlsx", "xlsx"), bytes);

    expect(items).toHaveLength(2);
    expect(items.map((item) => [item.name, item.mpn, item.quantity])).toEqual([
      ["螺丝 — M2x6", undefined, 8],
      ["螺丝 — M2x8", undefined, 4],
    ]);
    expect(items[0].metadata.source_label).toBe("螺丝");
    expect(items[1].ref).toBe("nodequad12-micropython-nodequad-xlsx-explicit-0002");
    expect(items.every((item) => item.ref.length <= 64)).toBe(true);
  });

  it("validates immutable reviewed wave hashes and rejects malformed config", () => {
    expect(validateReviewedBomWaveDefinition(wave as ReviewedBomWaveDefinition)).toEqual([]);

    const bad: ReviewedBomWaveDefinition = {
      wave: "bad",
      schema_version: 1,
      projects: [{ project_id: "p", repo_url: "https://example.com/repo.git", revision: "not-a-rev", sources: [{ path: "BOM.md", format: "markdown", sha256: "abc", transform: "tny-components" }] }],
    };
    expect(validateReviewedBomWaveDefinition(bad)).toEqual([
      "p: revision must be a 40-character lowercase git hash",
      "p/BOM.md: sha256 must be a 64-character lowercase hex digest",
    ]);
  });
});
