export const DEFAULT_PRODUCTION_BASE_URL = "https://robopartpicker-production.ludomi2502.workers.dev";
export const DEFAULT_PREVIEW_BASE_URL = "https://robopartpicker-preview.ludomi2502.workers.dev";
export const LEGACY_BASE_URL = "https://robopartpicker.com";

export type CanonicalEnv = Record<string, string | undefined>;

export function canonicalBase(env: CanonicalEnv): string {
  const configured = env.VITE_CANONICAL_BASE_URL || env.CANONICAL_BASE_URL;
  const raw = configured || (env.CLOUDFLARE_ENV === "production" || env.NODE_ENV === "production"
    ? DEFAULT_PRODUCTION_BASE_URL
    : env.CLOUDFLARE_ENV === "preview"
      ? DEFAULT_PREVIEW_BASE_URL
      : "http://localhost:5173");
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/\/+$/u, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    throw new Error(`Invalid canonical base URL: ${raw}`);
  }
}

export function replaceBase(content: string, base: string): string {
  return content.replaceAll(LEGACY_BASE_URL, base).replaceAll(DEFAULT_PRODUCTION_BASE_URL, base).replaceAll(DEFAULT_PREVIEW_BASE_URL, base).replaceAll("http://localhost:5173", base);
}
