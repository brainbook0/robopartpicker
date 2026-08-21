// Safe rendering helpers for category-specific catalog fields.
//
// Live CatalogPart records may omit spec fields that only demo fixtures fill
// in. PartsTable and PartDetail must render whatever the API actually returns
// without crashing on `undefined.toFixed(...)` / `undefined.join(...)` and
// without fabricating values (rendering "undefined", "NaN", or invented 0s).

export const MISSING = "—";

/** Format a numeric field, rendering MISSING for anything that is not a finite
 *  number. Optional `digits` pins decimals via `toFixed` and `suffix` appends a
 *  unit label only when a value is present. */
export function fmtNumber(value: unknown, opts: { digits?: number; suffix?: string } = {}): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return MISSING;
  const text = opts.digits != null ? value.toFixed(opts.digits) : String(value);
  return opts.suffix != null ? `${text}${opts.suffix}` : text;
}

/** Format a text field, trimming whitespace and rendering MISSING for empty or
 *  non-string values. */
export function fmtText(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return MISSING;
}

/** Format a string[] field with a custom joiner (default ", "), rendering
 *  MISSING for missing or empty arrays. */
export function fmtList(value: unknown, joiner = ", "): string {
  if (Array.isArray(value)) {
    const parts = value.map((item) => (typeof item === "string" ? item : String(item)));
    if (parts.length) return parts.join(joiner);
  }
  return MISSING;
}