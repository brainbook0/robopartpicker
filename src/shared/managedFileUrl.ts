/**
 * Normalizes a managed-file URL into a canonical relative-path form.
 *
 * Recognised managed-file origins:
 *   - robopartpicker.com
 *   - www.robopartpicker.com
 *   - *.ludomi2502.workers.dev  (legacy Workers deployment)
 *
 * Only the pathname `/api/v1/files/content` is rewritten; all other URLs
 * (including manufacturer datasheet links and arbitrary third-party hosts)
 * pass through unchanged.
 *
 * Returns `null` for null / undefined / blank / malformed inputs.
 */
export function normalizeManagedFileUrl(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  // Protocol-relative values escape the current origin and are not safe asset
  // paths. Root-relative values remain on the current origin.
  if (trimmed.startsWith("//") || trimmed.includes("\\")) return null;
  if (trimmed.startsWith("/")) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Not a parseable absolute URL
    return null;
  }

  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;

  const hostname = url.hostname.toLowerCase();

  // Only rewrite the specific managed path on known origins
  const isManagedHost =
    hostname === "robopartpicker.com" ||
    hostname === "www.robopartpicker.com" ||
    hostname.endsWith(".ludomi2502.workers.dev");

  const isManagedPath = url.pathname === "/api/v1/files/content";

  if (isManagedHost && isManagedPath) {
    // Preserve query string (including leading `?`)
    return url.pathname + url.search;
  }

  // Everything else passes through unchanged
  return trimmed;
}