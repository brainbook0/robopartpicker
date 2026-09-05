// Single source of truth for a project's current BOM totals.
//
// The D1-backed normalized BOM (linked via `project.bom_id`) is authoritative.
// When it is present, line count, unit count, known cost, and unpriced counts
// all come from its reviewed, offer-backed items. The legacy flat `rpps.bom`
// list is retained only as source evidence and must never be presented as a
// competing BOM. Projects without a linked, source-validated BOM are unavailable.

import type { ProjectRow } from "@/lib/projects";
import type { BomDetail } from "@/shared/builds";

export type CurrentBomTotals = {
  /** Which representation supplied these totals. */
  source: "normalized" | "unavailable";
  /** False while a linked D1 BOM exists but has not resolved (loading/error). */
  available: boolean;
  lineCount: number;
  units: number;
  /** Known cost in minor units (e.g. cents). Derived only from priced lines. */
  knownCostMinor: number;
  pricedLines: number;
  unpricedLines: number;
  currency: string;
};

/** Legacy flat RPPS BOM totals. Used only when no normalized D1 BOM is linked. */
export function rppsBomTotals(rppsBom: ProjectRow["rpps"]["bom"]): Pick<CurrentBomTotals, "lineCount" | "units" | "knownCostMinor" | "pricedLines" | "unpricedLines" | "currency"> {
  const items = rppsBom ?? [];
  const priced = items.filter((item) => item.unit_cost_usd != null);
  const units = items.reduce((sum, item) => sum + (item.qty ?? 0), 0);
  const knownCostMinor = Math.round(
    priced.reduce((sum, item) => sum + (item.unit_cost_usd ?? 0) * (item.qty ?? 0), 0) * 100,
  );
  return {
    lineCount: items.length,
    units,
    knownCostMinor,
    pricedLines: priced.length,
    unpricedLines: items.length - priced.length,
    currency: "USD",
  };
}

/**
 * Resolve the current BOM totals for a project, preferring the normalized
 * D1 BOM over the legacy RPPS list. Never invents a cost when the linked BOM
 * has not resolved.
 */
export function currentBomTotals(project: ProjectRow, normalizedBom: BomDetail | null | undefined): CurrentBomTotals {
  if (normalizedBom?.totals) {
    const totals = normalizedBom.totals;
    return {
      source: "normalized",
      available: true,
      lineCount: totals.lines,
      units: totals.units,
      knownCostMinor: totals.knownCostMinor,
      pricedLines: totals.lines - totals.unpricedLines,
      unpricedLines: totals.unpricedLines,
      currency: normalizedBom.version?.currency ?? "USD",
    };
  }

  if (project.bom_id) {
    // A D1 BOM is linked but not loaded. Keep the persisted line-count snapshot
    // and leave the rest unresolved rather than deriving a misleading total
    // from the smaller legacy list.
    return {
      source: "normalized",
      available: false,
      lineCount: project.bom_line_count ?? 0,
      units: 0,
      knownCostMinor: 0,
      pricedLines: 0,
      unpricedLines: 0,
      currency: "USD",
    };
  }

  return {
    source: "unavailable",
    available: false,
    lineCount: 0,
    units: 0,
    knownCostMinor: 0,
    pricedLines: 0,
    unpricedLines: 0,
    currency: "USD",
  };
}