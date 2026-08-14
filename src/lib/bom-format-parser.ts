import { unzipSync } from "fflate";

type BomCell = string | { value: string; url?: string };

function cellValue(cell: BomCell): string {
  return typeof cell === "string" ? cell : cell.value;
}

function cellUrl(cell: BomCell): string | undefined {
  return typeof cell === "string" ? undefined : cell.url;
}

const BOM_NAME_HEADERS = new Set([
  "name", "part", "partname", "partnumber", "component", "componentname", "description", "item", "value", "type", "pcb",
  "designator", "reference", "mpn", "manufacturerpart", "manufacturerpartnumber", "lcscpart",
  "名称", "规格", "型号", "物料编号", "物料编码",
]);
const BOM_QTY_HEADERS = new Set([
  "quantity", "qty", "count", "qtyperassembly", "qtyperboard", "qtyfor1platform", "qtyforassembly", "数量", "用量",
]);
const BOM_SUPPORT_HEADERS = new Set([
  "manufacturer", "supplier", "supplierpart", "footprint", "comment", "unit", "uom", "sku",
  "制造商", "厂商", "品牌", "供应商", "链接", "备注", "序号", "编号", "位号", "单位",
]);

export function normalizeBomHeader(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function parseXlsxObjects(bytes: Uint8Array): Record<string, string>[] {
  return rowsToBomObjects(parseXlsxRaw(bytes));
}

export function parseMarkdownBomObjects(markdown: string): Record<string, string>[] {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const objects: Record<string, string>[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].includes("|") || !isMarkdownTableDivider(lines[index + 1])) continue;
    const rows = [markdownTableRow(lines[index])];
    index += 2;
    while (index < lines.length && lines[index].includes("|")) {
      const row = markdownTableRow(lines[index]);
      if (row.some((cell) => cellValue(cell))) rows.push(row);
      index += 1;
    }
    objects.push(...rowsToBomObjects(rows));
    index -= 1;
  }
  return objects;
}

export function parseCsvObjects(text: string, delimiter: "," | "\t" = ","): Record<string, string>[] {
  return rowsToBomObjects(parseCsvRaw(text, delimiter));
}

function markdownTableRow(line: string): BomCell[] {
  const trimmed = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  return trimmed.split(/(?<!\\)\|/u).map((cell) => {
    const link = cell.match(/\[([^\]]+)\]\(([^)]+)\)/u);
    return {
      value: cell
        .replace(/\\\|/gu, "|")
        .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
        .replace(/[*_`]/gu, "")
        .trim(),
      url: link?.[2]?.trim(),
    };
  });
}

function isMarkdownTableDivider(line: string): boolean {
  const cells = markdownTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{2,}:?$/u.test(cellValue(cell).replace(/\s/gu, "")));
}

function parseXlsxRaw(bytes: Uint8Array): string[][] {
  const zip = unzipSync(bytes);
  const decode = (path: string) => new TextDecoder("utf-8", { fatal: false }).decode(zip[path] ?? new Uint8Array());
  const shared: string[] = [];
  for (const si of decode("xl/sharedStrings.xml").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/giu)) {
    shared.push([...si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/giu)].map((match) => unescapeXml(match[1])).join(""));
  }
  const sheetPath = Object.keys(zip).filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/iu.test(path)).sort()[0];
  if (!sheetPath) return [];
  const sheet = decode(sheetPath);
  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/giu)) {
    const cells = new Map<number, string>();
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/giu)) {
      const attrs = cell[1];
      const body = cell[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/iu)?.[1] ?? "";
      const col = ref ? colToIndex(ref) : cells.size;
      const type = attrs.match(/\bt="([^"]+)"/iu)?.[1] ?? "";
      let value = "";
      if (type === "s") {
        const index = Number(body.match(/<v>([\s\S]*?)<\/v>/iu)?.[1] ?? "NaN");
        value = shared[Number.isFinite(index) ? index : -1] ?? "";
      } else if (type === "inlineStr") {
        value = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/giu)].map((match) => unescapeXml(match[1])).join("");
      } else if (type === "b") {
        value = body.match(/<v>([\s\S]*?)<\/v>/iu)?.[1] === "1" ? "true" : "false";
      } else {
        value = unescapeXml(body.match(/<v>([\s\S]*?)<\/v>/iu)?.[1] ?? "");
      }
      cells.set(col, value);
    }
    if (cells.size) {
      const maxCol = Math.max(...cells.keys());
      const row = Array.from({ length: maxCol + 1 }, (_, index) => cells.get(index) ?? "");
      if (row.some((value) => value !== "")) rows.push(row);
    }
  }
  return rows;
}

function parseCsvRaw(text: string, delimiter: "," | "\t" = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field.trim()); field = ""; }
    else if (char === "\n") { row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function rowsToBomObjects(rows: BomCell[][]): Record<string, string>[] {
  if (!rows.length) return [];
  let headerIndex = 0;
  let best = -1;
  for (let index = 0; index < Math.min(rows.length, 8); index += 1) {
    const score = rows[index].reduce((total, header) => total + (isBomHeader(cellValue(header)) ? 1 : 0), 0);
    if (score > best) { best = score; headerIndex = index; }
  }
  const headers = dedupeHeaders(rows[headerIndex].map((header) => normalizeBomHeader(cellValue(header))));
  if (!isCredibleBomHeader(headers)) return [];
  return rows.slice(headerIndex + 1).map((values) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      const value = values[index] ?? "";
      const stringValue = cellValue(value);
      if (header) record[header] = stringValue;
      const url = cellUrl(value);
      if (header && url) record[`${header}url`] = url;
    });
    return record;
  });
}

function dedupeHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((header) => {
    if (!header) return header;
    const count = counts.get(header) ?? 0;
    counts.set(header, count + 1);
    return count === 0 ? header : `${header}${count + 1}`;
  });
}

function isBomHeader(value: string): boolean {
  const normalized = normalizeBomHeader(value);
  return BOM_NAME_HEADERS.has(normalized) || BOM_QTY_HEADERS.has(normalized) || BOM_SUPPORT_HEADERS.has(normalized);
}

function isCredibleBomHeader(headers: string[]): boolean {
  const normalized = headers;
  const hasName = normalized.some((header) => BOM_NAME_HEADERS.has(header));
  const hasQuantity = normalized.some((header) => BOM_QTY_HEADERS.has(header) || /^qty|^quantity/iu.test(header));
  const supportCount = normalized.reduce((total, header) => total + (BOM_SUPPORT_HEADERS.has(header) ? 1 : 0), 0);
  return hasQuantity && (hasName || supportCount > 0);
}

function colToIndex(ref: string): number {
  let index = 0;
  for (const char of ref) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}
