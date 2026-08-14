import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseMarkdownBomObjects, parseXlsxObjects } from "./bom-format-parser";

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

describe("project import BOM formats", () => {
  it("parses multilingual XLSX headers without shifting cells after empty self-closing cells", () => {
    const values = ["序号", "名称", "规格", "数量", "十字螺钉", "M2 * 6mm", "M2 * 45mm"];
    const bytes = workbook(values, `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>
<row r="2"><c r="A2"><v>1</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c><c r="D2"><v>48</v></c></row>
<row r="3"><c r="A3"><v>2</v></c><c r="B3"/><c r="C3" t="s"><v>6</v></c><c r="D3"><v>8</v></c></row>
</sheetData></worksheet>`);

    expect(parseXlsxObjects(bytes)).toEqual([
      { 序号: "1", 名称: "十字螺钉", 规格: "M2 * 6mm", 数量: "48" },
      { 序号: "2", 名称: "", 规格: "M2 * 45mm", 数量: "8" },
    ]);
  });

  it("parses reviewed Markdown BOM tables with compact dividers and PCB headers", () => {
    const markdown = `# BOM

| Type | Pins | Quantity | Link |
| :--: | :--: | :------: | :--- |
| JST-PH | 3 | 4 | [source](https://example.com/cable) |

| PCB | Purpose | Quantity | Files |
| --- | --- | :--: | --- |
| Main Board | Controller | 1 | [files](https://example.com/pcb) |
`;

    expect(parseMarkdownBomObjects(markdown)).toEqual([
      { type: "JST-PH", pins: "3", quantity: "4", link: "source" },
      { pcb: "Main Board", purpose: "Controller", quantity: "1", files: "files" },
    ]);
  });
});
