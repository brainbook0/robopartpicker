export interface DigiKeyPriceBreak {
  packaging: string;
  quantity: number;
  unitPriceUsd: number;
  extendedPriceUsd: number;
}

export interface DigiKeyProduct {
  manufacturerProductNumber: string;
  manufacturer: string;
  description: string;
  productUrl: string;
  digiKeyPartNumber: string;
  inStockQuantity: number;
  lowestQuantityOnePriceUsd: number;
  priceBreaks: DigiKeyPriceBreak[];
}

interface ProductTable {
  endLine: number;
  fields: Map<string, string>;
}

const NO_RESULT_PATTERNS = [
  /\bno results found\b/i,
  /\bno products found\b/i,
  /\bwe (?:could not|couldn't) find any results\b/i,
  /\b0\s+results\b/i,
];

/**
 * Normalizes only presentation differences that cannot identify a different MPN.
 * Punctuation and meaningful spacing are deliberately preserved.
 */
export function normalizeDigiKeyMpn(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[‐‑‒–—―−]/g, "-")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function parseDigiKeyProductMarkdown(
  markdown: string,
  queriedMpn: string,
): DigiKeyProduct | null {
  const normalizedQuery = normalizeDigiKeyMpn(queriedMpn);
  if (!normalizedQuery || /^\d+$/.test(normalizedQuery.replace(/\s/g, ""))) {
    return null;
  }

  if (!markdown.trim() || NO_RESULT_PATTERNS.some((pattern) => pattern.test(markdown))) {
    return null;
  }

  const lines = markdown.split(/\r?\n/);
  const productTables = findProductTables(lines);

  // A detail page has exactly one canonical product table. This intentionally
  // rejects category/search pages even if one of several results matches.
  if (productTables.length !== 1) {
    return null;
  }

  const productTable = productTables[0];
  const manufacturerProductNumber = cleanInlineMarkdown(
    productTable.fields.get("manufacturer product number") ?? "",
  );

  if (
    !manufacturerProductNumber
    || normalizeDigiKeyMpn(manufacturerProductNumber) !== normalizedQuery
  ) {
    return null;
  }

  const manufacturer = cleanInlineMarkdown(productTable.fields.get("manufacturer") ?? "");
  const description = cleanInlineMarkdown(productTable.fields.get("description") ?? "");
  const digiKeyPartNumber = firstDigiKeyPartNumber(
    productTable.fields.get("digikey part number") ?? "",
  );
  const productUrl = findCanonicalProductUrl(markdown, normalizedQuery);
  const inStockQuantity = findInStockQuantity(lines, productTable.endLine + 1);
  const priceBreaks = findPriceBreaks(lines, productTable.endLine + 1);
  const quantityOnePrices = priceBreaks
    .filter((priceBreak) => priceBreak.quantity === 1)
    .map((priceBreak) => priceBreak.unitPriceUsd);
  const lowestQuantityOnePriceUsd = quantityOnePrices.length > 0
    ? Math.min(...quantityOnePrices)
    : null;

  if (
    !manufacturer
    || !description
    || !digiKeyPartNumber
    || !productUrl
    || inStockQuantity === null
    || lowestQuantityOnePriceUsd === null
    || priceBreaks.length === 0
  ) {
    return null;
  }

  return {
    manufacturerProductNumber,
    manufacturer,
    description,
    productUrl,
    digiKeyPartNumber,
    inStockQuantity,
    lowestQuantityOnePriceUsd,
    priceBreaks,
  };
}

/**
 * Return only DigiKey detail links whose path MPN exactly matches the query.
 *
 * Search and category pages are not product evidence. Callers must fetch the
 * sole returned detail page and pass that response back through
 * parseDigiKeyProductMarkdown before accepting identity, stock, or pricing.
 */
export function findExactDigiKeyProductLinks(
  markdown: string,
  queriedMpn: string,
): string[] {
  const normalizedQuery = normalizeDigiKeyMpn(queriedMpn);
  if (!normalizedQuery || /^\d+$/.test(normalizedQuery.replace(/\s/g, ""))) {
    return [];
  }

  const urls = new Set<string>();
  const linkPattern = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi;
  for (const match of markdown.matchAll(linkPattern)) {
    const canonical = canonicalDigiKeyProductUrl(match[1], normalizedQuery);
    if (canonical) urls.add(canonical);
  }
  return [...urls].sort();
}

function findProductTables(lines: string[]): ProductTable[] {
  const tables: ProductTable[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const cells = parseMarkdownTableRow(lines[lineIndex]);
    if (
      cells?.length !== 2
      || normalizeFieldName(cells[0]) !== "manufacturer product number"
    ) {
      continue;
    }

    let startLine = lineIndex;
    while (startLine > 0 && parseMarkdownTableRow(lines[startLine - 1])) {
      startLine -= 1;
    }

    let endLine = lineIndex;
    while (endLine + 1 < lines.length && parseMarkdownTableRow(lines[endLine + 1])) {
      endLine += 1;
    }

    const fields = new Map<string, string>();
    for (let tableLine = startLine; tableLine <= endLine; tableLine += 1) {
      const row = parseMarkdownTableRow(lines[tableLine]);
      if (!row || row.length !== 2 || isSeparatorRow(row)) {
        continue;
      }

      const fieldName = normalizeFieldName(row[0]);
      if (fieldName) {
        fields.set(fieldName, row[1].trim());
      }
    }

    if (
      fields.has("manufacturer product number")
      && fields.has("manufacturer")
      && fields.has("description")
      && fields.has("digikey part number")
    ) {
      tables.push({ endLine, fields });
    }

    lineIndex = endLine;
  }

  return tables;
}

function findCanonicalProductUrl(markdown: string, normalizedMpn: string): string | null {
  const urls = new Set(findExactDigiKeyProductLinks(markdown, normalizedMpn));
  return urls.size === 1 ? [...urls][0] : null;
}

function canonicalDigiKeyProductUrl(rawValue: string, normalizedMpn: string): string | null {
  const rawUrl = rawValue.replace(/[.,;:]$/, "");
  try {
    const url = new URL(rawUrl);
    if (!/(^|\.)digikey\.com$/i.test(url.hostname)) return null;

    const pathMatch = url.pathname.match(
      /^\/en\/products\/detail\/[^/]+\/([^/]+)\/\d+\/?$/i,
    );
    if (!pathMatch) return null;

    const pathMpn = decodeURIComponent(pathMatch[1]);
    if (normalizeDigiKeyMpn(pathMpn) !== normalizedMpn) return null;
    url.protocol = "https:";
    url.hostname = "www.digikey.com";
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    // Ignore malformed links from untrusted saved markdown.
    return null;
  }
}

function findInStockQuantity(lines: string[], startLine: number): number | null {
  const remainder = lines.slice(startLine).join("\n");
  const afterLabel = remainder.match(/\bIn[\s-]*Stock\s*:?\s*([\d,]+)/i);
  const beforeLabel = remainder.match(/\b([\d,]+)\s+In[\s-]*Stock\b/i);
  return parseInteger(afterLabel?.[1] ?? beforeLabel?.[1] ?? "");
}

function findPriceBreaks(lines: string[], startLine: number): DigiKeyPriceBreak[] {
  const priceBreaks: DigiKeyPriceBreak[] = [];

  for (let lineIndex = startLine; lineIndex < lines.length; lineIndex += 1) {
    const header = parseMarkdownTableRow(lines[lineIndex]);
    if (
      !header
      || header.length < 3
      || normalizeFieldName(header[0]) !== "quantity"
      || normalizeFieldName(header[1]) !== "unit price"
      || normalizeFieldName(header[2]) !== "ext price"
    ) {
      continue;
    }

    const packaging = nearestPlainTextLine(lines, lineIndex - 1);
    let rowIndex = lineIndex + 1;

    const separator = parseMarkdownTableRow(lines[rowIndex] ?? "");
    if (separator && isSeparatorRow(separator)) {
      rowIndex += 1;
    }

    for (; rowIndex < lines.length; rowIndex += 1) {
      const row = parseMarkdownTableRow(lines[rowIndex]);
      if (!row || row.length < 3 || row.every((cell) => !cell.trim())) {
        break;
      }

      const quantity = parseInteger(cleanInlineMarkdown(row[0]));
      const unitPriceUsd = parseUsd(cleanInlineMarkdown(row[1]));
      const extendedPriceUsd = parseUsd(cleanInlineMarkdown(row[2]));
      if (quantity === null || unitPriceUsd === null || extendedPriceUsd === null) {
        break;
      }

      priceBreaks.push({ packaging, quantity, unitPriceUsd, extendedPriceUsd });
    }

    lineIndex = rowIndex;
  }

  return priceBreaks;
}

function nearestPlainTextLine(lines: string[], startLine: number): string {
  for (let lineIndex = startLine; lineIndex >= 0; lineIndex -= 1) {
    const line = lines[lineIndex].trim();
    if (!line || parseMarkdownTableRow(line)) {
      continue;
    }
    return cleanInlineMarkdown(line.replace(/^#{1,6}\s+/, ""));
  }
  return "";
}

function firstDigiKeyPartNumber(value: string): string {
  const plainValue = cleanInlineMarkdown(value);
  return plainValue.split(/\s+-\s+/u, 1)[0].trim().split(/\s+/u, 1)[0] ?? "";
}

function normalizeFieldName(value: string): string {
  return cleanInlineMarkdown(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim()
    .replace(/\s+/g, " ");
}

function parseMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }

  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const character of trimmed.slice(1, -1)) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
      current += character;
    } else if (character === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());

  return cells;
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseInteger(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseUsd(value: string): number | null {
  const normalized = value.replace(/^USD\s*/i, "").replace(/^\$/, "").replace(/,/g, "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
