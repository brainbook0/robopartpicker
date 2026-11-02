const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntity(entity: string): string {
  const normalized = entity.toLowerCase();
  if (normalized in NAMED_ENTITIES) return NAMED_ENTITIES[normalized];
  const numeric = normalized.startsWith("#x")
    ? Number.parseInt(normalized.slice(2), 16)
    : normalized.startsWith("#")
      ? Number.parseInt(normalized.slice(1), 10)
      : Number.NaN;
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0x10ffff || (numeric >= 0xd800 && numeric <= 0xdfff)) {
    return `&${entity};`;
  }
  return String.fromCodePoint(numeric);
}

// A scraped source page's leading <style> block was imported as the summary for a batch of
// hardware records. Live 2026-11-02: 264 components served the raw stylesheet (`.border {
// margin-bottom: 10px; ... }`) as their meta description and on-page blurb. A stylesheet is not a
// description, so a value that opens with a CSS rule is normalised to empty and callers fall back
// to their generated text exactly as they already do for a missing summary.
const CSS_STYLESHEET = /^[.#][\w-]+\s*(?:,[^{}]*)?\{[^{}]*[:;][^{}]*\}/u;

export function normalizeCatalogText(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const withoutMarkup = value
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, " ")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<\/?(?:p|div|section|article|blockquote|pre|li|h[1-6]|tr)\b[^>]*>/giu, "\n\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/```[\s\S]*?```/gu, " ");

  const decoded = withoutMarkup
    .replace(/&([a-z]+|#\d+|#x[0-9a-f]+);/giu, (_match, entity: string) => decodeEntity(entity))
    .replace(/\\r\\n|\\n|\\r/gu, "\n")
    .replace(/\r\n?|\u2028|\u2029/gu, "\n");

  const normalized = decoded
    .split("\n")
    .map((line) => line.replace(/[\t ]+/gu, " ").trim())
    .join("\n")
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/gu, "\n\n")
    .replace(/(^|\n)[ \t]+/gu, "$1")
    .trim();
  return CSS_STYLESHEET.test(normalized) ? "" : normalized;
}
