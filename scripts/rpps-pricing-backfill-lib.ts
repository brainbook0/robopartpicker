import { RppsBomItem, type RppsPackage } from "../src/lib/rpps/schema";

export type RppsPricingRow = {
  sortOrder: number;
  description: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  unitPriceMinor: number;
  productUrl: string;
};

export function normalizeBomDescription(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Enrich only exact normalized BOM positions with source-backed identity and price.
 * The caller must already have authorized and selected the supplier observation.
 */
export function enrichRppsBomPricing(
  rpps: RppsPackage,
  rows: RppsPricingRow[],
): { rpps: RppsPackage; changedLines: number } {
  const seen = new Set<number>();
  const bom = rpps.bom.map((item) => ({ ...item }));

  for (const row of rows) {
    if (!Number.isInteger(row.sortOrder) || row.sortOrder < 0 || row.sortOrder >= bom.length) {
      throw new Error(`invalid BOM sort order ${row.sortOrder}`);
    }
    if (seen.has(row.sortOrder)) throw new Error(`duplicate pricing row for BOM sort order ${row.sortOrder}`);
    seen.add(row.sortOrder);

    const item = bom[row.sortOrder];
    if (normalizeBomDescription(item.name) !== normalizeBomDescription(row.description)) {
      throw new Error(`BOM description mismatch at sort order ${row.sortOrder}`);
    }
    if (!row.manufacturer.trim() || !row.manufacturerPartNumber.trim()) {
      throw new Error(`missing component identity at sort order ${row.sortOrder}`);
    }
    if (!Number.isInteger(row.unitPriceMinor) || row.unitPriceMinor <= 0) {
      throw new Error(`invalid positive unit price at sort order ${row.sortOrder}`);
    }
    const productUrl = new URL(row.productUrl);
    if (productUrl.protocol !== "https:" || !/(^|\.)digikey\.com$/i.test(productUrl.hostname)) {
      throw new Error(`unexpected supplier URL at sort order ${row.sortOrder}`);
    }

    const enriched = {
      ...item,
      manufacturer: row.manufacturer.trim(),
      mpn: row.manufacturerPartNumber.trim(),
      unit_cost_usd: row.unitPriceMinor / 100,
      supplier_url: productUrl.toString(),
    };
    const parsed = RppsBomItem.safeParse(enriched);
    if (!parsed.success) throw new Error(`enriched BOM line ${row.sortOrder} is not valid RPPS`);
    bom[row.sortOrder] = parsed.data;
  }

  return { rpps: { ...rpps, bom }, changedLines: rows.length };
}
