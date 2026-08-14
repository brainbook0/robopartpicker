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
      { type: "JST-PH", pins: "3", quantity: "4", link: "source", linkurl: "https://example.com/cable" },
      { pcb: "Main Board", purpose: "Controller", quantity: "1", files: "files", filesurl: "https://example.com/pcb" },
    ]);
  });

  it("preserves Markdown sourcing link URLs and suffixes duplicate normalized Unit headers", () => {
    const markdown = `# Sourcing

| Part | Qty | Unit ($) | Unit (¥) | Buy (US) | Buy (CN) |
| --- | ---: | ---: | ---: | --- | --- |
| M3 screw | 10 | 0.10 | 0.70 | [McMaster](https://www.mcmaster.com/screws) | [Taobao](https://item.taobao.com/item.htm?id=123) |
| Bearing | 2 | 4.50 | 32.00 | [Amazon](https://example.com/us-bearing) | [1688](https://example.cn/bearing) |
`;

    expect(parseMarkdownBomObjects(markdown)).toEqual([
      {
        part: "M3 screw",
        qty: "10",
        unit: "0.10",
        unit2: "0.70",
        buyus: "McMaster",
        buyusurl: "https://www.mcmaster.com/screws",
        buycn: "Taobao",
        buycnurl: "https://item.taobao.com/item.htm?id=123",
      },
      {
        part: "Bearing",
        qty: "2",
        unit: "4.50",
        unit2: "32.00",
        buyus: "Amazon",
        buyusurl: "https://example.com/us-bearing",
        buycn: "1688",
        buycnurl: "https://example.cn/bearing",
      },
    ]);
  });

  it("recognizes Amount as a quantity header in sourcing tables", () => {
    const markdown = `| Part | Amount | Unit Cost (US) | Buy US |
| --- | ---: | ---: | --- |
| STS3215 Servo | 7 | $13.89 | [Alibaba](https://example.com/servo) |`;

    expect(parseMarkdownBomObjects(markdown)).toEqual([{
      part: "STS3215 Servo",
      amount: "7",
      unitcostus: "$13.89",
      buyus: "Alibaba",
      buyusurl: "https://example.com/servo",
    }]);
  });
});
