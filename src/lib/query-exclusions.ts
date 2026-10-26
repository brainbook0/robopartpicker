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
 *
 * Three gates, all of which have to pass:
 *  1. the generated coverage flag (ix) says the catalogue answers it;
 *  2. the slug is not on the reviewed non-sourcing list;
 *  3. the answer is a *subset* of the catalogue rather than the whole of it (see below).
 *
 * Gate 3 is a guard rather than a reviewed list, because `ix` is produced by token matching and a
 * token match on a generic phrase binds to almost everything. Measured live 2026-10-23 against the
 * shipped coverage: /queries/where-to-buy-a-robot and /queries/how-to-buy-a-robot both claimed
 * "573 components and 537 published projects", /queries/robotics claimed 517 components and 1,668
 * projects (the catalogue holds 2,445 published projects), while the answered-query distribution is
 * median 8 components / 1 project and p95 90 components / 33 projects. No single sourcing question
 * is answered by 1,668 projects, so those pages are not thin versions of an answer — they are the
 * absence of one, and Google crawls them and refuses to index them. That non-indexation is the
 * current #1 blocker for the /queries set, so the pages that provably cannot answer are kept out of
 * the advertised set instead of being argued back in one slug at a time.
 *
 * The caps sit far above p95, so a query the catalogue really answers is unaffected; they only catch
 * a match set that is large enough to be the catalogue itself.
 */
export const ANSWER_SELECTIVITY_LIMITS = { components: 400, projects: 100 } as const;

/** True when the match set is too broad to be an answer to one sourcing question. */
export function isOverbroadAnswer(coverage: { c?: number; p?: number } | undefined): boolean {
  if (!coverage) return false;
  return (coverage.c ?? 0) > ANSWER_SELECTIVITY_LIMITS.components
    || (coverage.p ?? 0) > ANSWER_SELECTIVITY_LIMITS.projects;
}

export function isQueryIndexable(
  slug: string,
  coverage: { ix?: boolean; c?: number; p?: number } | undefined,
): boolean {
  return Boolean(coverage?.ix)
    && !NON_SOURCING_QUERY_SLUGS.has(slug)
    && !isOverbroadAnswer(coverage);
}
