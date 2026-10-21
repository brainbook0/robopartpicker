// Query pages that the catalogue genuinely cannot answer, kept out of the search index.
//
// /queries/* pages come from keyword research (src/lib/queries-data.ts) and each one is served
// indexable only when QUERY_COVERAGE marks it (ix). But ix is only a *coverage* test: at least one
// component or project matched, by token. For topics outside the catalogue those matches are
// coincidences, and the page becomes a near-duplicate template with no sourcing value behind it:
// /queries/where-to-buy-ninja-blender binds to an "ic" category, /queries/robotics-camp to "led",
// /queries/robotics-jobs to "fuse". A crawler has no way to tell those apart from the 339 pages that
// do answer a real parts question, and the /queries index was advertising them to visitors as well.
//
// These slugs are served noindex,follow, dropped from sitemap.xml, hidden from the /queries index and
// skipped when part pages link to related guides. They stay reachable for anyone arriving by link.
//
// Deliberately an explicit reviewed list rather than a threshold heuristic: an exclusion has to be
// justifiable one page at a time. tests/worker/query-indexability.test.ts fails if an entry here is
// misspelled, no longer generated, or no longer ix (which would make the entry dead weight).
export const NON_SOURCING_QUERY_SLUGS: ReadonlySet<string> = new Set([
  // Other categories of goods: the catalogue holds robot components, so any "match" here is noise.
  "parts-of-a-car-wheel",
  "microscope-camera",
  "thermal-print-camera",
  "where-to-buy-food-processor",
  "where-to-buy-a-food-processor",
  "where-to-buy-ninja-blender",
  // Career, education, media and entertainment intents: no parts or BOM answer exists or could.
  "advanced-robotics",
  "first-robotics",
  "fun-robotics",
  "how-to-code-robotics",
  "introduction-to-robotics",
  "learn-robotics",
  "ms-robotics",
  "robotics-101",
  "robotics-app",
  "robotics-as-a-service",
  "robotics-books",
  "robotics-camp",
  "robotics-class",
  "robotics-club",
  "robotics-course",
  "robotics-degree",
  "robotics-engineer",
  "robotics-engineering",
  "robotics-examples",
  "robotics-facts",
  "robotics-first",
  "robotics-jobs",
  "robotics-memes",
  "robotics-news",
  "robotics-research",
  "robotics-schools",
  "robotics-technologies",
  "robotics-tutorial",
  "robotics-wikipedia",
  "robotics-workshop",
  "robotics-worldwide",
  "robots-to-buy-for-home",
  "think-robotics",
  "types-of-robotics",
]);

/**
 * Whether a /queries page should be offered to search engines.
 * Either the coverage flag says the catalogue answers it, and it is not on the non-sourcing list.
 */
export function isQueryIndexable(slug: string, coverage: { ix?: boolean } | undefined): boolean {
  return Boolean(coverage?.ix) && !NON_SOURCING_QUERY_SLUGS.has(slug);
}
