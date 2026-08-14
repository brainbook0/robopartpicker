import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import wave from "../../data/bom-waves/2026-08-14-reviewed-wave2.json";
import wave3 from "../../data/bom-waves/2026-08-14-reviewed-wave3.json";
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
    expect(validateReviewedBomWaveDefinition(wave3 as ReviewedBomWaveDefinition)).toEqual([]);

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

  it("slices AlohaMini2 sections and preserves explicit quantities, context, models, and supplier URL preference", () => {
    const aloha: ReviewedBomProjectDefinition = { project_id: "alohamini", repo_url: "https://github.com/liyiteng/alohamini.git", revision: "17c6a98d79881a45ab869c1f392ed89c0723a298", sources: [] };
    const markdown = `# AlohaMini2 BOM
## Mobile Base
| Item | Qty | BuyUSUrl | BuyCNUrl | Notes |
| --- | ---: | --- | --- | --- |
| ST-3215-C018 servo | 4 | https://us.example/servo | https://cn.example/servo | drive actuator |
| Raspberry Pi 5 | 1 |  | https://cn.example/pi | electronics |
| H65V1 camera | 2 | https://us.example/cam |  | camera |
| 3D printed base shell | - | https://us.example/print |  | fabricated file only |

## Follower Arms (×2)
| Item | Qty | BuyUSUrl | Notes |
| --- | ---: | --- | --- |
| ST-3095-C002 servo | 2 | https://us.example/follower-servo | actuator |
| shoulder bearing | 4 |  | bearing |

## Leader Arms (×2)
| Item | Qty | BuyCNUrl | Notes |
| --- | ---: | --- | --- |
| Waveshare Bus Servo Adapter A | 1 | https://cn.example/adapter | electronics |
| silicone cable set | 3 | https://cn.example/cable | cable |

## Fasteners & Consumables
| Item | Qty | BuyUSUrl | Notes |
| --- | ---: | --- | --- |
| M3 screw kit | 20 | https://us.example/screws | fastener |
| threadlocker | 1 | https://us.example/threadlocker | consumable |

## Total Estimate
| Item | Qty |
| --- | ---: |
| Total summary row | 999 |
`;
    const sources = [
      { transform: "aloha-mobile-base", section: { from_heading: "## Mobile Base", until_before_heading: "## Follower Arms (×2)" } },
      { transform: "aloha-follower-arms", section: { from_heading: "## Follower Arms (×2)", until_before_heading: "## Leader Arms (×2)" } },
      { transform: "aloha-leader-arms", section: { from_heading: "## Leader Arms (×2)", until_before_heading: "## Fasteners & Consumables" } },
      { transform: "aloha-fasteners-consumables", section: { from_heading: "## Fasteners & Consumables", until_before_heading: "## Total Estimate" } },
    ].map((entry) => ({ ...source(entry.transform as ReviewedBomSourceDefinition["transform"], "AlohaMini2/docs/BOM.md"), section: entry.section }));

    const groups = sources.map((entry) => transformReviewedBomSource(aloha, entry, markdown));
    const items = groups.flat();

    expect(groups.map((group) => group.length)).toEqual([3, 2, 2, 2]);
    expect(items.map((item) => item.quantity)).toEqual([4, 1, 2, 2, 4, 1, 3, 20, 1]);
    expect(items.some((item) => item.name.includes("Total summary"))).toBe(false);
    expect(items.some((item) => item.name.includes("3D printed base shell"))).toBe(false);
    expect(items[0]).toMatchObject({ name: "Mobile Base — ST-3215-C018 servo", mpn: "ST-3215-C018", source_url: "https://us.example/servo", category: "actuator" });
    expect(items[1]).toMatchObject({ name: "Mobile Base — Raspberry Pi 5", mpn: "Raspberry Pi 5", source_url: "https://cn.example/pi", category: "electronics" });
    expect(items[5]).toMatchObject({ name: "Leader Arms (×2) — Waveshare Bus Servo Adapter A", mpn: "Waveshare Bus Servo Adapter A", source_url: "https://cn.example/adapter" });
    expect(items.map((item) => item.ref)).toContain("alohamini-aloha-follower-arms-0001");
    expect(new Set(items.map((item) => item.ref)).size).toBe(items.length);
  });
});
