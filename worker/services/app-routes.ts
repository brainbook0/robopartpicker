/**
 * Client-side routes that the SPA resolves without a server-side SEO document.
 *
 * The Worker's not-found handler falls through to the built `index.html` so the
 * React router can render these pages. That is correct for real routes but it
 * also answered *every* unknown path with 200 + HTML, so Googlebot spent crawl
 * requests on `/google-service-account.json`, `/package.json`, `/credentials.json`
 * and similar scanner probes (soft 404s). This table lets the fallback keep 200
 * for routes the app really owns and return a genuine 404 for everything else.
 *
 * Keep in sync with the <Route path="..."> table in src/App.tsx. Patterns use
 * `:param` for a single path segment. A trailing `*` is not supported on purpose:
 * unknown sub-paths should 404 rather than silently render the parent page.
 */
const APP_ROUTE_PATTERNS: readonly string[] = [
  "/",
  "/about",
  "/acceptable-use",
  "/accessibility",
  "/admin/analytics",
  "/admin/project-claims",
  "/ai-notice",
  "/assistant",
  "/assistant/:threadId",
  "/auth",
  "/boms",
  "/boms/:bomId/items/:itemId",
  "/boms/:slug",
  "/builder",
  "/community",
  "/community/c/:slug",
  "/community/new",
  "/community/t/:id",
  "/completed-quotes/:id",
  "/contact",
  "/cookies",
  "/developers",
  "/finder/:type",
  "/intellectual-property",
  "/legal",
  "/marketplace",
  "/marketplace/:id",
  "/marketplace/new",
  "/marketplace/wanted/new",
  "/marketplace-terms",
  "/notifications",
  "/oauth/consent",
  "/organizations",
  "/organizations/:id",
  "/partners",
  "/parts/:category",
  "/parts/:category/:slug",
  "/parts/compare",
  "/privacy",
  "/projects",
  "/projects/new",
  "/projects/:slug",
  "/projects/:slug/:aspect",
  "/quotes/:id",
  "/robots",
  "/robots/:slug",
  "/rpps",
  "/search",
  "/suppliers",
  "/suppliers/:slug",
  "/teardowns",
  "/terms",
];

const APP_ROUTES: readonly string[][] = APP_ROUTE_PATTERNS.map((pattern) =>
  pattern === "/" ? [] : pattern.slice(1).split("/"),
);

function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/u)[0] ?? "/";
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) return withoutQuery.replace(/\/+$/u, "") || "/";
  return withoutQuery || "/";
}

function segmentsMatch(pattern: string[], path: string[]): boolean {
  if (pattern.length !== path.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    const part = pattern[i]!;
    if (part.startsWith(":")) {
      if (!path[i]) return false;
      continue;
    }
    if (part !== path[i]) return false;
  }
  return true;
}

/**
 * True when the React app owns this URL. Anything else is a 404, so a request
 * for `/wp-admin/install.php` or `/google-service-account.json` no longer looks
 * like a valid page to a crawler.
 */
export function isKnownAppRoute(path: string): boolean {
  const normalized = normalizePath(path);
  if (normalized === "/") return true;
  const segments = normalized.slice(1).split("/");
  // A real app route never ends in a file extension; probes and missing assets do.
  const last = segments[segments.length - 1] ?? "";
  if (last.includes(".")) return false;
  return APP_ROUTES.some((pattern) => segmentsMatch(pattern, segments));
}
