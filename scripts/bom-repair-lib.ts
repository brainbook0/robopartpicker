export interface BomSnapshotProject {
  slug: string;
  project_id: string;
  version_id: string;
  bom: unknown[];
}

export interface BomSnapshot {
  schema: string;
  projects: BomSnapshotProject[];
}

export interface BomItemLike {
  name?: unknown;
  mpn?: unknown;
  qty?: unknown;
  component_id?: unknown;
  completeness?: unknown;
  [key: string]: unknown;
}

export interface CatalogComponentLike {
  id: string;
  name: string;
  manufacturer_part_number?: string | null;
  offer_count?: number;
}

export interface NormalizedBomLineLike {
  id: string;
  description: string;
  sort_order: number;
}

export type MatchKind = "mpn" | "name";

export interface BomItemMatch {
  kind: MatchKind;
  component: CatalogComponentLike;
}

const PARTITION_TABLE_NAMES = new Set([
  "nvs",
  "otadata",
  "phyinit",
  "phy_init",
  "factory",
  "storage",
  "static",
  "www",
  "spiffs",
  "coredump",
  "eeprom",
  "ota0",
  "ota1",
  "ota_0",
  "ota_1",
  "app0",
  "app1",
]);

export function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function normalizeName(value: unknown): string {
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

export function isFalsePartitionTableBom(items: BomItemLike[]): boolean {
  if (items.length < 3) return false;
  const named = items.filter((item) => {
    const rawName = String(item.name ?? "").trim();
    return rawName && !rawName.startsWith("#");
  });
  if (named.length < 3) return false;
  const withMpn = named.filter((item) => normalizeToken(item.mpn));
  if (withMpn.length > 0) return false;
  const partitionLike = named.filter((item) => PARTITION_TABLE_NAMES.has(normalizeToken(item.name)));
  return partitionLike.length >= 3 && partitionLike.length / named.length >= 0.75;
}

function uniqueBy<T>(rows: T[], key: (row: T) => string): Map<string, T | null> {
  const map = new Map<string, T | null>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    map.set(k, map.has(k) ? null : row);
  }
  return map;
}

export function buildComponentMatcher(components: CatalogComponentLike[], options: { allowNameMatch?: boolean } = {}) {
  const byMpn = uniqueBy(components, (component) => normalizeToken(component.manufacturer_part_number));
  const byName = uniqueBy(components, (component) => normalizeName(component.name));
  return (item: BomItemLike): BomItemMatch | null => {
    const mpnKey = normalizeToken(item.mpn);
    if (mpnKey) {
      const component = byMpn.get(mpnKey);
      if (component) return { kind: "mpn", component };
      return null;
    }
    if (options.allowNameMatch) {
      const nameKey = normalizeName(item.name);
      const component = byName.get(nameKey);
      if (component) return { kind: "name", component };
    }
    return null;
  };
}

export function repairBomItems(
  items: BomItemLike[],
  match: (item: BomItemLike) => BomItemMatch | null,
): { items: BomItemLike[]; mpnMatches: number; nameMatches: number; pricedLines: number } {
  let mpnMatches = 0;
  let nameMatches = 0;
  let pricedLines = 0;
  const repaired = items.map((item) => {
    const found = match(item);
    if (!found) return { ...item };
    if (found.kind === "mpn") mpnMatches += 1;
    else nameMatches += 1;
    if ((found.component.offer_count ?? 0) > 0) pricedLines += 1;
    return { ...item, component_id: found.component.id, completeness: "complete" };
  });
  return { items: repaired, mpnMatches, nameMatches, pricedLines };
}

export function pairSnapshotItemsWithNormalizedLines(
  items: BomItemLike[],
  lines: NormalizedBomLineLike[],
): Array<{ item: BomItemLike; line: NormalizedBomLineLike }> {
  const available = new Map<string, NormalizedBomLineLike[]>();
  for (const line of [...lines].sort((left, right) => left.sort_order - right.sort_order)) {
    const key = normalizeName(line.description);
    if (!key) continue;
    available.set(key, [...(available.get(key) ?? []), line]);
  }
  const output: Array<{ item: BomItemLike; line: NormalizedBomLineLike }> = [];
  items.forEach((item, index) => {
    const key = normalizeName(item.name);
    const candidates = available.get(key);
    if (!candidates?.length) return;
    const exactIndex = candidates.findIndex((candidate) => candidate.sort_order === index);
    const [line] = candidates.splice(exactIndex >= 0 ? exactIndex : 0, 1);
    output.push({ item, line });
  });
  return output;
}
