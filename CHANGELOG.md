# Changelog

## Unreleased

### Operator / SEO

- Stopped the server-rendered prerender from answering a crawler burst with a `500`. The part-page body `worker/services/seo.ts` injects for crawlers ran five D1 queries that, on production data, made SQLite scan whole tables: the image and published-files lookups drove from the 55,951-row `files` table (measured `rows_read` 55,952 and 55,956 per page) and the "related components" query's `CASE … ORDER BY c.name COLLATE NOCASE` forced a temp b-tree over the entire 23,731-row `electronics` category (`rows_read` 70,821). ~207,000 rows read for a single page let a crawl burst trip D1's "Too many resources consumed within a 10 second window", which the worker's `onError` turned into a `500` — observed live 2026-11-05 as 116 `5xx` across `/parts/*` and `/projects/*`, including 29 on one goBILDA wheel page Googlebot was fetching. The image and file lookups are now driven from `component_files` (a component owns a couple of dozen rows at most) with the `files` access as a correlated primary-key probe, and the sibling query orders by plain `c.name` so SQLite walks `components_category_name_idx (category, name)` and stops at 6. Migration `0041` adds the one index the rewritten usage lookup needs, `bom_items_component_idx`, so "used in these robotics projects" starts from the component's `bom_items` rows instead of the project catalogue. Measured on production D1 2026-11-05 after the change: files list 55,952 → **1** rows read (93.7 ms → 0.6 ms), siblings 47,463 → **6** rows read (46.3 ms → 0.7 ms), plan confirmed as `SEARCH c USING INDEX components_category_name_idx`. As a backstop, `serveSeoAsset` now catches a prerender failure (e.g. D1 overload) and serves the un-prerendered SPA shell at `200` with a 60-second cache and a `seo_prerender_failed` log line, instead of a `500` — a crawler retries next fetch rather than recording a server error. Test `tests/worker/seo-part-files.test.ts` pins the files/sibling output; 11 worker SEO test files (37 cases) and `tsc -b` green.

- Fixed a broken internal link the crawler-facing prerender emitted on **2,143 of 2,400 public project pages**. Every project page footer carries a "Full bill of materials" link, and `resolveSeoDocument` built it as `/boms/${project.slug}-bom`. But an imported BOM's route key is only sometimes `<project-slug>-bom` (257 of 2,400 public BOMs); the rest carry a distinct slug (`xlerobot-bom-9402d205` for project `xlerobot`, `open-source-rover-bom` for project `nasa-jpl-open-source-rover`), so the guessed URL answered `404`. Measured 2026-11-05 against production D1: `exact_match` 257, `mismatch` 2,143. A live audit of the internal links in the 40 highest-star project pages found **131 of 173 distinct link targets non-200**, essentially all of them this `/boms/<slug>-bom` 404. The prerender now reads the project's actual BOM route key (`SELECT COALESCE(b.slug, b.id) … ORDER BY line-count DESC LIMIT 1`) and links to it, falling back to the `/boms` index for a project with no BOM row rather than emitting a dead link. The client app already linked the real slug (`bom.slug ?? bom.id`) — only the prerender guessed. Test `tests/worker/seo-project-bom-link.test.ts` (2 cases) pins a suffixed-slug project resolving to its real BOM and the no-BOM fallback; `tsc -b` clean, 5 worker SEO test files (14 cases) green. (The same audit saw transient `500`s on `/parts/*` and `/projects/*` under 12-way concurrency that do not reproduce sequentially — Googlebot's observed status mix carries no `500`s, so it is an audit-load artifact, not a production defect.)
- Gave the 323 programmatic `/queries` sourcing-guide pages an inbound link from the site's most-crawled page: the home listing (and `/projects`, same code path) now link `/queries` in its server-rendered footer row, next to `/all-parts` and `/state-of-open-robotics`. `/queries` is the catalogue's keyword-targeted surface, but Google crawls it at about one page a day (19 `Googlebot`-UA requests in six days versus 70 to `/parts/*`) and indexes none of it (`site:robopartpicker.com/queries` = 0), even though all 323 advertised `/queries` URLs answer `200`, `index,follow`, self-canonical, 346-530 words, and have been linked from every part-category page by `queryGuideSection` since 2026-10-07. The home page was the one high-authority node with no path into that inventory. Verified live after deploy `aff8bca1`: the homepage crawler body carries `href="https://robopartpicker.com/queries"` (616 prerender words) and `/projects` links it too. `tsc -b` clean; `tests/worker/seo-all-parts.test.ts` green.
- Gave the Waveshare/Feetech **ST3215 serial-bus servo** a published, source-backed specification set, so its part page stops rendering the "No structured source specifications have been published for this component yet." stub. The component (`cmp-63619843a16558bd23755f5c`, slug `ws-st3215-servo`) had been imported with **no `component_revisions` row at all**; `worker/services/seo.ts` builds the part page's "Source specifications" section from `component_specs JOIN component_revisions`, so the page rendered the stub and — because the `sitemap.xml` substance rule admits a part only with a source spec, an observed price or published-project usage — the page was **never advertised** (0 sitemap occurrences before, 1 after). The ST3215 is not a niche part: it is the servo specified by TheRobotStudio/SO-ARM100 (SO-100/SO-101) leader and follower arms. Migration `0040` inserts one published revision and 16 specifications transcribed from primary sources only — the Waveshare "ST3215 Servo" product wiki (input voltage 6-12.6 V, 30 kg·cm @ 12 V / 19.5 kg·cm @ 7.4 V, 0.222 s/60° @ 12 V, 360°/4096 encoder, TTL half-duplex bus, 1 Mbps, ID 0-253, position/load/speed/voltage feedback, 200 mA no-load, 2.7 A locked-rotor, 45.22×35×24.72 mm) and the SO-ARM100 README gearing table (1/345 C001, 1/191 C044, 1/147 C046). Nothing is inferred — no weight, no torque-at-6V, no price is invented. The insert is `WHERE EXISTS`-guarded, so it is a no-op on a database that does not carry the imported catalogue and idempotent if re-run. Applied to production D1 2026-11-04; verified live with a Googlebot UA — `/parts/actuator/ws-st3215-servo` renders a 16-row "Source specifications" table (168 -> 272 prerender words), the stub text is gone, and the URL is now in `sitemap.xml`.
- `/all-parts` — a server-rendered index of every substantive component page — closes the crawl-recovery gap left by `/parts/:category`, which paginates client-side. `sitemap.xml` advertises 9,482 component URLs, but `/parts/<category>` server-renders only its first 24 rows and pages the rest in the browser, so a crawler could reach the other part pages only through the sitemap — the same problem `/all-projects` already solves for projects. The new page links every advertised component exactly once, grouped by category, and applies the sitemap's own substance rule (a source specification, an observed supplier price, or usage in a published project), so the substantial parts gain an inbound internal link while the `noindex` SKU stubs stay out. Measured against production D1 on 2026-11-04: 9,454 components are substantive and are linked. Advertised in `sitemap.xml`, `/llms.txt`, the home page listing and the category pages. Test `tests/worker/seo-all-parts.test.ts` (3 cases); `tsc -b` clean, full worker suite unchanged except the pre-existing migration-count assertion (39 vs 35).
- Stopped publishing an imported stylesheet as a component's description. A batch of hardware records carried the source page's leading `<style>` block as their `summary` — measured against production D1 on 2026-11-02, 264 components (`summary` 800-13,274 chars, e.g. `.border { margin-bottom: 10px; border: 1px solid #e6e6e6 ; } .dotLine { … }`) — so the raw CSS was served as the page's meta description, `og:description`, `schema.org` `description` and the on-page blurb a visitor reads under the part name. `normalizeCatalogText` stripped import markup but not CSS, and both `seo.ts` and the app's `PartDetail` render the summary through it. It now recognises a summary that opens with a CSS rule (`.selector { prop: value; }`) as a stylesheet and returns empty, so callers fall back to their generated text exactly as they already do for a missing summary — the human blurb falls back to "No source summary has been published for this component yet." and the crawler description to the factual template. Prose that merely mentions a selector ("The .border style is optional…") is untouched. New unit test in `src/lib/catalogText.test.ts`; 4 worker SEO test files re-run green, `tsc -b` clean.
- Submitted the live public MCP server to two further no-signup directories this run: `mcp.tc` (queued, "waiting for review") and `fewservers.com` (received). Confirmed already listed on `mcpub.dev`, `mcpcollection.com` and `mcp.directory` (no new submission needed); `mcp.so` remains payment-gated at US$39 and `sartbot.com` submissions are "coming soon". `ai.mcpharbor.dev` POST failed to connect from this datacentre IP.

- The SO-101 project page (`/projects/therobotstudio-so-arm100`, the one page this catalogue already ranks on page 1 for — position ~10 for "so-101 robot arm bill of materials") now carries source-backed build notes instead of a flat imported BOM. The nine pages above it are hands-on build guides, so the crawler/reader body now states, in the words of TheRobotStudio/SO-ARM100's own README, what the arm is (The RobotStudio + Hugging Face, 6-DOF, leader/follower teleop pair, assembles without removing servo gears), which arm you are building (single follower = 6 servos; leader + follower set = 12), the motor gearing per arm (follower 6× STS3215 7.4 V 1/345 C001; leader 1× C001 + 2× 1/191 C044 + 3× 1/147 C046; two-arm set 7× C001 + 2× C044 + 3× C046), the 7.4 V (16.5 kg·cm) vs 12 V (30 kg·cm) torque choice, the repository's own list cost (follower ≈ US$121.94; two-arm set ≈ US$229.88, i.e. ≈ US$108 for the leader arm), the print recipe (PLA+, 0.4 mm nozzle @ 0.2 mm layer, 15% infill, single pre-oriented STL per bed size) and the assembly guide link. It is injected through a new `PROJECT_EDITORIAL` map keyed by project slug so other projects are untouched; every number is quoted from the cited upstream README (retrieved 2026-11-01) and attributed to it, and the per-part observed catalogue prices stay separate further down the page. Test `tests/worker/seo-project-editorial.test.ts` pins the section on the SO-101 page and its absence on an unrelated project page.

- `/state-of-open-robotics` now reports the line-level resolution gap it previously only gestured at. The census stated "only a small minority of projects carry a bill of materials whose lines resolve to a specific, identifiable part" but never said how small, because it counted BOM emptiness per *any* version while the catalog only ever serves a version once it is published. A new section, "Even the lines that exist rarely resolve to something you can order", counts the lines the catalog actually serves — those belonging to the current version of a bill whose `publication_state` is `verified` or `partial` — and reports them against the stored figure so the two cannot read as a contradiction: 2,408 public bills hold line items in some version, but only 38 carry them in a published version (the rest hold draft lines the catalog has never published); those 38 contain 1,781 lines, of which 126 (7.1%) resolve to an identifiable catalog component, and only 2 of 2,445 projects have a published bill with even one resolved line. Provenance stays honest — 1,781 of 1,781 served lines carry an explicit source locator. The `Dataset` description carries the sharper figure too. Counts verified against production D1 on 2026-10-31. Test `tests/worker/seo-static-page-body.test.ts` pins the section and the no-contradiction wording. Deployed version `a36c3b0f`; verified live with a Googlebot UA — `/state-of-open-robotics` 538 -> 694 crawler-visible words, `index,follow`, self-canonical.
- `/.well-known/mcp.json` now matches the official MCP server schema (`https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`), the shape remote-directory crawlers probe for. The previous document was a bespoke object (`name`, `transport` as a bare string, `endpoint`, `capabilities`); `mcpi.app`, which ingests the official registry but also pre-fills its self-serve publish form by scanning "the 10 places an MCP server is conventionally deployed", reported "No MCP endpoint found on robopartpicker.com" against that shape. The document now carries `$schema`, the reverse-DNS `name` (`com.robopartpicker/robopartpicker`, matching the published registry entry), `title`, `version`, `websiteUrl`, `repository`, `remotes:[{type:"streamable-http",url:"/mcp"}]`, `serverInfo`, `transport` object, `tools` and `alternatives` (OpenAPI, A2A agent card, api-catalog linkset), and keeps the legacy keys (`transportType`, `endpoint`, `documentation`, `authentication`, `capabilities`) so consumers written against the old shape keep working. Verified live after deploy `32a1fee8`: ServerDetail's required fields (`name`, `description`, `version`) present, `remotes[0].url` = `/mcp`, `$schema` set, content-type `application/json`. `tests/worker/api.test.ts` asserts the new shape (58/59 worker tests pass; the 1 failure is the pre-existing migration-count assertion, 39 vs 35).
- `/about` and `/marketplace` were the two thinnest documents in the sitemap — 34 and 31 crawler-visible words, both linked site-wide and both advertised in `sitemap.xml`. They fell through to the generic exact-page template (`<h1>{title}</h1><p>{description}</p>` + a link row) that every listing page in `pages` shares, so the page that carries the site's honesty claims and a nav-linked beta surface were near-empty to a crawler while `/developers` had already been given a bespoke body for the same reason. Both now have real body content built from facts verified against production on 2026-10-30 (`projects` 2,453, `components` 35,146, public `boms` 2,414 of which 2,185 have no line items = 91%; `/api/v1/marketplace` total 0, so the marketplace states plainly that it has no public listings yet). `/about` also states what the catalogue does *not* claim (not a shop, shared category is not interchangeability, an absent price means "not observed here") and routes corrections to `/partners` and `/contact`; `/marketplace` routes readers to the populated surfaces (`/projects`, `/boms`, `/parts/actuator`, `/queries`) and to `/marketplace/new`. Verified live with a Googlebot UA after deploy `bdc96248`: `/about` 34 -> 338 words, `/marketplace` 31 -> 154 words, both `index,follow` with correct canonicals and the `seo-prerender` block present. Test `tests/worker/seo-static-page-body.test.ts` (3 cases) pins both bodies and the unchanged generic template on `/partners`.
- Project pages now server-render the normalized, source-backed specifications and the active published price estimate that the app's "Product details" panel already shows. The prerender read the project row, BOM lines and indexed repository files, but never `project_specs` or `project_price_estimates`, so a crawler saw fewer facts than a visitor on the projects that carry them (measured 2026-10-29: 9 of 100 sampled projects have specs, e.g. Unitree G1 15 specs, Tesla Optimus 7, Franka Emika Panda 7). `resolveSeoDocument` now adds a "Technical specifications (N)" list (`label: value unit (source-backed, checked YYYY-MM-DD)`) and, when an active non-expired estimate exists, a "Published price estimate" line (`$13,500 (high confidence, valued …)`), plus a schema.org `PropertyValue` for the price. Money is formatted by hand (`CURRENCY_SYMBOLS` + digit grouping) rather than `Intl.NumberFormat(style:"currency")`: the first deploy shipped `3,500` for a 1,350,000-minor USD estimate because the Cloudflare **edge** runtime's `Intl` returned a wrong number where local workerd and Node return the right one, and a price on a page that promises honesty must not depend on edge ICU. Verified live (Googlebot UA): `/projects/unitree-robotics-h2` -> `$29,900`, `/projects/1x-technologies-neo` -> `$20,000`, `/projects/tesla-optimus` -> "Technical specifications (7)"; a project with neither section (SO-101) is unchanged. Deployed version `d2603570`. Test `tests/worker/seo-project-specs.test.ts` (4 cases).
- Deployed the previously staged agent-discovery work: `/.well-known/mcp/server-card.json` now points `repository`/`sourceUrl` at the real source repo (directories key listings off it) and a new A2A `/.well-known/agent-card.json` (plus `/agent.json`) describes the same public MCP server after agent crawlers hit the path ~46 times a day and got 404. Migration `0039` (strip leftover `<sup>`/`**` markup from five SO-101 BOM rows) is committed but not applied remotely; it is unnecessary for the fix because every renderer normalises import markup at display time.

- Project pages now carry the repository files the catalogue actually indexed, and `/queries` no longer advertises answers that are really the whole catalogue. Project pages reached crawlers as ~70-word stubs (title, four facts, "no BOM lines have been resolved yet") while a visitor saw 3D viewers and a managed-artifacts panel built from those same indexed files; `resolveSeoDocument` now lists up to 36 paths grouped by kind (CAD, URDF, MuJoCo, BOM, firmware, configuration, document, test evidence) with per-kind counts and a capped "N more …" remainder, capped because a few projects carry hundreds of anonymous attachments and the query is re-run on every prerender. A separate gate, `isOverbroadAnswer`, keeps a `/queries` slug out of the advertised set when its match set exceeds 400 components or 100 projects: measured 2026-10-23, `/queries/where-to-buy-a-robot` and `/queries/how-to-buy-a-robot` both claimed 573 components and 537 projects, `/queries/robotics` claimed 517 components and 1,668 of 2,445 projects, while the answered-query distribution is median 8 components / 1 project and p95 90 / 33. Those are token matches, not answers, so they are `noindex,follow` instead of being argued in one slug at a time; the caps sit far above p95 so a real answer is untouched. Query intros and Q&A are generated from each page's own match set (the old copy was one paragraph with the keyword substituted, token Jaccard 0.69-0.80), and `/queries` sitemap entries finally carry a `<lastmod>`. A `/parts/`, `/projects/` or `/boms/` path whose record is gone now answers `404` through the shared not-found document instead of a `200` reading "Page not found". Deployed as version `16b2339f`; verified live with a Googlebot UA: `/projects/openpilot` prerender grew to 121 words including "Repository files indexed (8) — 2 firmware files, 3 configuration files, 3 documents", 12/12 sampled project pages carry the section (median 8 files, 3-9 range — the corpus is genuinely thin here, so the gain is real but modest), `/queries/where-to-buy-a-robot` flipped to `noindex,follow` while `/queries/robot-servo-motor` stays `index,follow` at 530 words, sitemap 12,326 URLs (16 overbroad queries dropped, 340 -> 323 with `<lastmod>2026-10-22</lastmod>`), `/projects/definitely-not-real-xyz` and `/boms/dead-slug-bom` both `404`. 29 worker tests across 4 files plus `tsc -b` clean. 2,768 changed URLs re-submitted to IndexNow (Yandex `200` ×6 batches; `api.indexnow.org` `403` from this datacentre IP, expected).
- Kept `updated_at` honest when a component's category changes, and corrected the noun classes the head-noun sweeps could not reach. Category is part of a part URL (`/parts/<category>/<slug>`), so a category change is a content change; `0034`/`0035` set `updated_at` for that reason, `0036` did not, and the 2026-10-23 sweep therefore left sitemap `<lastmod>` values from August on URLs whose canonical path had just changed — measured 2026-10-24: 141 sitemap entries carried `2026-10-22` (the `0034`/`0035` rows) and zero carried `2026-10-23`. Migration `0037` adds a trigger that bumps `updated_at` in the same statement as any `UPDATE OF category`, so this class of staleness cannot recur; verified live by applying `0038` and observing `Last updated: 2026-10-24` and a `2026-10-24` `<lastmod>` on the corrected pages. Migration `0038` then moves 49 rows the vocabulary missed — `bearing`/`trimpot`/`potentiometer` were absent from `categorise_head_noun.py`'s map, so 40 FRC-style bearing blocks, plates, hubs, sprockets and gears sat in the catch-all `electronics` bucket and 9 potentiometers in `connector` while the other 39 potentiometers were already `resistor`. Candidates whose names also carry an electrical head word or a tool word were excluded, as were the 121 igus catalogue rows that mention a bearing and names carrying a scrape artefact (`bearings-shafts-spacers?page=2`). Verified live after applying both: `/parts/connector/adafruit-panel-mount-1k-potentiometer-…` -> `301` -> `/parts/resistor/…` `200` with canonical, `Category: resistor` and `Last updated: 2026-10-24`; category totals moved exactly as intended (`electronics` 23,771 -> 23,731, `connector` 1,917 -> 1,908, `mechanical` 325 -> 365, `resistor` 140 -> 149); the 49 new canonical URLs were pushed to IndexNow (Yandex `200`, `api.indexnow.org` `403` from this datacentre IP, expected).
- Recorded a provenance defect in migration `0036` (unchanged — applied migrations are immutable): its id lists are in no live database. 0 of its 933 ids exist in `robopartpicker-production`, in the preview database, in `staging_components` or in `robot_component_candidates`, and no live component id shares their 8-hex slug suffix, so running it against any live database is a no-op; the file also holds 85 statements / 933 ids while the run log claims 1,011 accepted rows, and `d1_migrations` has no `0036` record. The live categories themselves are correct and were verified without the file: re-running `recategorise_guarded.py` over a full production dump gives accepted = 0, rejected_ambiguous = 113, i.e. every change `0036` could still make is already applied. A fresh environment therefore cannot be recreated from the repo alone; `0037`'s header records the finding and the fix (regenerate `0036`'s intent as an environment-independent, name-guarded statement set) for a later run.
- Corrected a further 1,011 components whose category contradicted an unambiguous head noun, the remainder of the mis-filing class migration `0034`/`0035` could not decide. The earlier sweep deliberately abstained whenever a name carried an accessory word, which left whole obvious buckets wrong and visible on the pages Google crawls: 150 LEDs filed as `ic`, 137 cables as `connector` ("HDMI Cable - 1 meter", "Servo Extension Cable 300mm"), 110 fasteners/extrusion parts as `electronics`, 62 sensors as `ic`, 51 displays as `ic`, 41 LEDs as `resistor`, 31 as `fuse`. New `recategorise_guarded.py` re-runs the head-noun classifier against a full production dump and rejects any proposal where an *earlier* product noun in the name points at a different category (that is what killed the false positives — "HPS-0618SG … Servo Stainless Steel Gear 85KG" would have become `mechanical`), and skips names containing tool/accessory words (stripper, cutter, inverter, mount, adapter). 113 proposals were rejected as ambiguous, 1,011 applied. Migration `0036` is guarded per row on the pre-change category, so a row that moved since the dump is skipped; verified all 1,011 rows hold their new category in production. Category is part of the URL, so old paths 301 to the new canonical (mechanism from `0035`) — checked live: `/parts/ic/adafruit-monochrome-0-96-128x64-oled-…` -> `301` -> `/parts/display/…` `200`, `/parts/fuse/adafruit-diffused-rgb-tri-color-led-…` -> `301` -> `/parts/led/…` `200`; `sitemap.xml` rebuilt with the new canonical paths (12,342 entries) and the 999 newest URLs were pushed to IndexNow (Yandex `200`; `api.indexnow.org`/Bing still `403` from this datacentre IP, expected). Query pages pick the corrections up through `loadQueryPartFacts`: `/queries/arduino-pressure-sensor` now reads `sensor` instead of `connector` for the eTape level sensors.
- Corrected 178 catalogue components that were filed under a category contradicting the product they are, and made part URLs survive that kind of correction. The DigiKey-era importer classified a product by the *first* keyword it found anywhere in the name, so accessory words beat the product noun: "Micro Servo with 3-pin JST PH 2mm Cable" became `cable`, "Right Mecanum Wheel - 48mm Diameter - TT Motor or Cross Axle" became `inductor`, "NEO Vortex Brushless Motor" and "SDS MK4n Swerve Modules" became `connector`, "1309 Series Sonic Hub" became `ic`. It was user-visible on the exact pages Google crawls: `/queries/robot-wheel-motor` listed the two adafruit mecanum wheels as `inductor` and `/queries/frc-encoder` listed "SDS MK4n Swerve Modules" as `connector` with maker `unknown`. Migrations `0034` (142 rows) and `0035` (36 rows) move a component only when its **head noun** — the name with parentheticals and trailing qualifier clauses (" *with …*", " *- 48mm …*") removed — maps unambiguously to a category, and only when the name is not actually that part's accessory (kits, bundles, driver boards, HATs, servo arms, extension cables, power/USB/pneumatic hubs are all deliberately left alone rather than guessed at). 289 names stayed untouched as UNSURE. Classifier and the reviewed change list: `robopartpicker-seo/categorise_head_noun.py`, `proposed-changes-2026-10-22.json`, `proposed-changes-2-2026-10-22.json`. `mechanical` grew 72 -> 149 components, `actuator` 1,410 -> 1,496, `sensor` 605 -> 614.
- Because the category is part of the URL (`/parts/<category>/<slug>`), correcting a category used to strand the old path. `resolveSeoDocument` now resolves a `/parts/<category>/<slug>` request whose category does not match by looking the slug up on its own and returning a `301` to the canonical path (slug is `UNIQUE` in `components`, so the part is never ambiguous); the old URL keeps resolving instead of falling through to the SPA shell. `SeoDocument` gained an optional `redirectTo` that `serveSeoAsset` answers with `301` + `Location` + a day of cache. Verified live with a Googlebot UA: `/parts/inductor/adafruit-right-mecanum-wheel-…` -> `301` to `/parts/mechanical/…`, canonical `200` with the prerender block and `Category: mechanical`. 3 new worker tests.
- Fixed a silent regression that category correction would have caused on `/queries` pages. `loadQueryPartFacts` keyed catalogue facts by `slug\u0000type`, where the type came from the baked `QUERY_COVERAGE` snapshot; once a component's category changed, the lookup missed and the page showed the *stale* type and maker `unknown` instead of the catalogue's answer. Facts are now keyed by slug alone (the catalogue row is authoritative, the snapshot is only a fallback for parts that no longer exist), so any future category correction is automatically reflected. New worker test pins a stale `inductor` entry rendering as `mechanical`. Verified live: `/queries/robot-wheel-motor` now reads `mechanical` for both mecanum wheels with maker `Adafruit`, `/queries/frc-encoder` reads `mechanical` for the swerve modules, and the sourcing-notes category mix follows.
- `robopartpicker-seo/deploy.sh` pointed at `/root/robopartpicker`, which is three crawl-health commits behind the live tree (`/home/hermes/rpp`): running it would have silently redeployed the soft-404 regression. It now builds from `/home/hermes/rpp`, reads `/home/hermes/.cloudflare/credentials`, and exports `TMPDIR=/tmp/rpp-build` (the harness `TMPDIR` under `/root/.hermes/cache/scratch` is root-owned mode 700, so `tsx` and miniflare died with `EACCES`).

### Earlier

- Unknown URLs now answer with a real `404` instead of the SPA shell. Cloudflare serves the built `index.html` for any unmatched path (`not_found_handling: single-page-application`), so the Worker's not-found handler answered *everything* with `200` + HTML: `/google-service-account.json`, `/package.json`, `/credentials.json`, `/this-does-not-exist-zzz9` all returned 200 with an indexable page shell. That is a soft 404 at catalogue scale — scanner probes and stale links look like valid pages, so crawl budget is spent on URLs that can never rank. Googlebot fetched `/google-service-account.json` three times today. New `worker/services/app-routes.ts` mirrors the `<Route path>` table in `src/App.tsx` (including `/parts/:category/:slug`, `/community/t/:id`, `/boms/:bomId/items/:itemId`, `/marketplace/wanted/new`, `/admin/*`, `/oauth/consent`); a path the app owns keeps the previous behaviour and 200, everything else returns `404` + `noindex,follow` + a server-rendered not-found body with real links to `/projects`, `/boms`, `/marketplace`, `/queries`. A path whose last segment contains a dot is never an app route, which catches probe and missing-asset URLs. Verified live after deploy: `/google-service-account.json`, `/package.json`, `/credentials.json`, `/this-does-not-exist-zzz9` -> `404` with `noindex,follow`; `/`, `/projects`, `/marketplace`, `/community`, `/auth`, `/search`, `/builder`, `/boms`, `/teardowns` -> `200` with prerender intact; sitemap 12,342 URLs sampled at 200. 5 new worker tests (100 total), 677 unit tests, `tsc -b` clean. Version `81eec704`.

- Stopped offering the non-sourcing `/queries` pages to search engines. A query page is indexable when `QUERY_COVERAGE` marks it (`ix`), but `ix` is only a coverage test — at least one component or project matched, by token. For keywords outside the catalogue those matches are coincidences and the page is a near-duplicate template with nothing behind it: `/queries/where-to-buy-ninja-blender` bound to the `ic` category, `/queries/robotics-camp` to `led`, `/queries/robotics-jobs` to `fuse`. 40 such slugs (other categories of goods, plus career, education, media and entertainment intents) are now listed in the new reviewed `src/lib/query-exclusions.ts` and served `noindex,follow`: removed from `sitemap.xml` (12,382 -> 12,342 URLs), hidden from the `/queries` index and skipped when part pages choose related guides. Advertised query pages 379 -> 339. The list is explicit rather than a threshold so each exclusion is reviewable, and the test fails if an entry is misspelled, no longer generated, or no longer `ix` (which would make it dead weight). 8 new worker tests (95 total), 677 unit tests, `tsc -b` clean.
- Closed the indexable-empty `/parts/<anything>` fallback. `staticSeo` answered every single-segment `/parts/` path with `index,follow` and no body whenever the category had no catalogue rows, which also swallowed legacy flat part URLs — measured live: `/parts/nosuchcategory` and `/parts/dfr-2933` returned 200, `index,follow`, self-canonical and zero prerender words. Reaching that branch means the DB-backed listing found no rows, so there is nothing to offer a crawler: the fallback is now `noindex,follow`, still crawlable and still reachable by link.

- Stopped advertising the 26,000 component pages that have nothing behind them. 34,760 catalog components are reachable at `/parts/<category>/<slug>`, but only 7,987 have a source specification, 1,582 have an observed supplier price and 102 appear in a published project; the rest render a stub that literally reads "No structured source specifications have been published for this component yet." (~80 words, one identity line, six generated sibling links). All of them were in `sitemap.xml`: Google was crawling 10-34 Googlebot requests a day across 42,231 URLs and had indexed about 1,860 of them, so the crawl budget was being spent on pages that cannot rank. `sitemap.xml` now advertises a component only when it has a specification, an observed price, or published-project usage (34,760 -> ~8,300 component URLs, 42,231 -> ~14,000 total), and the excluded pages serve `noindex,follow` so they stay reachable through category and sibling links and re-enter the index automatically once they gain data. The rule is computed from three flat `DISTINCT` scans rather than a per-component correlated subquery: the correlated form exceeds D1's per-query CPU limit on production data, and this route runs on every crawl. New worker test file covers the sitemap filter, the indexable/noindex split and the marker leak (87 worker tests, `tsc -b` clean).
- The `RPPGUIDE-V2-MARKER` test anchor was being printed as visible text at the end of every related-sourcing-guides list on part pages. It is now an HTML comment, so the tests still anchor on it and readers never see it.

- Gave every indexable `/queries` page its own catalogue evidence. The 379 indexable sourcing pages were template-identical apart from the keyword (measured token Jaccard 0.69-0.80 between random pairs) even though they had been crawlable and internally linked for weeks: Googlebot fetched them and indexed none of the 379, so the gap was per-page substance rather than discovery. Each page now renders a table of its actual matched catalogue components (name, category, maker, lowest observed supplier price with offer count, or an explicit "no observed offers") plus a "Sourcing notes" paragraph derived from that same match set (category mix, how many matches carry observed prices, the cheapest one, how many published projects build with them). Match with no supplier offers is labelled as such rather than priced; a catalogue lookup failure falls back to the previous link list, and the 12 `ix` pages whose match set is project-only say so instead of claiming component rows. Data comes from `components`/`manufacturers`/`supplier_offers` in D1, scoped by the same `deleted_at`/`is_demo` filters as the finder pages. Verified live with a Googlebot UA: 6/6 sampled pages serve the table and notes, robots stays `index,follow` for indexable slugs and `noindex,follow` for the rest, homepage prerender unchanged; sample of 24 pages: 115 table rows, 19 with a real observed price, 29% of pages showing at least one price. 6 new worker tests (83 total) plus `tsc -b` clean. IndexNow re-pinged the 379 URLs (Yandex 200 `success:true`). Version `ca02acf7`; diff staged at `robopartpicker-seo/staged-changes/queries-substance-2026-10-20/`.

- Deployed internal crawl links from part and category pages into the programmatic `/queries` inventory (the 382-URL keyword index gap). Part pages and category listings now render up to 6 rotating links to indexable (`ix`) query pages, so Googlebot — which fetches part pages heavily — can discover the `/queries` pages instead of relying solely on the sitemap. Only queries whose coverage is indexable are ever linked, so no noindex page is advertised internally. Fixed the FNV-1a seed hash returning a signed int, which made the modulo negative and left an empty link window on some part pages (caught in live verification, pinned with a 60-seed regression test). Verified live with a Googlebot UA: category and part pages emit 6 links each, all `/queries/*` targets return 200 and are indexable, humans still receive the cleanup script so the prerender block never shows in the app. Commits `3a911f8`, `9c92309`.

- Enabled HSTS at the Cloudflare zone (`strict-transport-security: max-age=15552000`; subdomains and preload intentionally not enabled). The site already redirected all plaintext traffic to HTTPS, but responses carried no HSTS header, a security gap for humans and a failed check in the VerifyMCP directory scan (which auto-listed the public MCP server from the official registry, trust score 65/100). Verified live after the change: header present on apex, `www`, and `/mcp`. Reversible via the same zone setting.

### Tooling

- Repaired the local build and test toolchain. `NODE_ENV=production` in the shell made npm omit devDependencies, which had pruned `wrangler`, `vitest`, `cross-env` and the Cloudflare/Vite plugins out of `node_modules` and stripped the `dev` flags from `package-lock.json`. Restored the lockfile from git and reinstalled with `npm ci --include=dev`. `tsc -b` is clean, all 677 unit tests and all 72 worker tests pass, and `vite build` produces the real `dist/client` + `dist/robopartpicker` pair again instead of relying on a hand-rolled esbuild bundle.

### Operator / SEO

- Restored the daily Cloudflare traffic snapshot: the script's auth header had been mangled to a literal `Bearer ***` and the credentials file was unreadable by the job user; both are fixed (creds readable by `hermes` group only; header now sends the loaded token).
- Purged the zone edge cache to clear any stale sitemap/robots objects; re-verified live `sitemap.xml` (42,231 URLs, all `robopartpicker.com`), `robots.txt` (correct Sitemap directive), and the IndexNow key file (200).
- Re-submitted the full public URL set to IndexNow: Yandex accepted 60/60 batches; Bing and api.indexnow.org reject this datacenter IP (403) — same as prior runs; payload/key validity confirmed by Yandex acceptance. Google and Bing public `ping?sitemap=` endpoints are deprecated (404/410) — dead ends; Search Console remains OAuth-gated.
- Confirmed the client-IP rate-limit rule (60 GET/10s) explicitly exempts `cf.client.bot` — verified-bot crawlers pass (spoofed UAs are correctly throttled); calm-rate crawl of 60 sampled sitemap URLs all return 200. No WAF change needed.
- Submitted a free directory listing for robopartpicker.com on robotics-startups.com (category: Robotics software and AI) — pending manual review (~90 days max), first real external listing.
- Removed the stale static `public/sitemap.xml` (33,471 URLs, Aug 25) and `public/robots.txt`, and stopped `scripts/sync-public-seo.ts` from rewriting them. `robots.txt` and `sitemap.xml` are served dynamically by the Worker, so the static copies were dead weight that could silently shadow live crawl directives if a route ever changed. Verified after deploy: `/sitemap.xml` still returns all 42,231 URLs and `/robots.txt` the Worker's 202-byte policy.

### Fixed

- Empty bill-of-materials pages are no longer offered to search engines. 2,370 of the 2,408 public BOMs have zero resolved line items, and the site advertised every one of them: a page whose entire purpose is a bill of materials that says "0 line bill of materials" is thin content at scale. They now serve `noindex,follow`, are dropped from the sitemap (40,054 to 37,684 URLs), and state plainly why they are excluded. The 38 BOMs with real lines stay indexed and stay in the sitemap, and each page re-enters the index by itself once line items are resolved. The `/boms` hub also stopped claiming 2,408 complete bills of materials: it now reports the 38 with resolved lines and says the remaining records are archived and excluded until their lines exist.
- Component pages now carry their source-recorded specifications and published files in the server-rendered HTML. They were only 57 words of body text because the prerender emitted the component's identity but not the specifications it has on record (60,458 spec rows across 33,344 components) or its published files (6,534 components). Catalog bookkeeping keys (`category`, `measurement_units`, `manufacturer_slug`, `source`) are excluded rather than padded in, so the table holds specifications a reader can use. The human-facing page already showed this data; only the crawler view was thin.
- Replaced the dead Discord invite. `discord.gg/robopartpicker` returned Discord's "Unknown Invite" (code 10006) while three live surfaces advertised it: the site-wide footer, the homepage "Join the Discord to shape what the platform becomes" call to action, and the community page button. The real server invite now backs all three, verified against Discord's API before shipping (guild `Robopartpicker`, channel `#general`, non-expiring), and `src/lib/site-config.ts` documents that check for future changes. The footer's GitHub link also pointed at a 404ing organisation; it now points at the published repository.
- A supplier-relationship record carried a third-party personal email address as its contact channel. It is now the project's public page, so no personal address is published and the record still passes the pipeline validator.

- Stopped publishing 2,558 near-duplicate programmatic pages. All but one of the `/queries` pages shared a single body template with only the keyword substituted, which is scaled content rather than a useful page and a site-wide quality risk for a domain with no search authority. Every page is now scored against the live catalog (`src/lib/query-coverage.ts`, generated from production D1): the 381 pages the catalog can actually answer stay indexed and gained a real "what the catalog actually has for this query" section with matching component and project links and live counts, so no two of them read the same; the remaining 2,177 are served `noindex,follow` with an honest "the catalog has nothing matching this yet" notice and no FAQ markup. The sitemap drops from 42,231 to 40,054 URLs and advertises only the 381 backed queries, and `/queries` links only those.

- Card project previews no longer keep the "Identity illustration" overlay on top of a real photo. Loaded-state was recorded against the absolutised thumbnail `src` but read back against the relative candidate URL, so `hasLoadedImage` never became true on cards and the placeholder stayed visible over every preview image. Both sides now key on the same value, with regression tests for the card thumbnail request and the overlay hand-off.

- Added a public legal center with separate Privacy, Terms, Cookies and Storage, Acceptable Use, Marketplace Terms, AI Notice, Intellectual Property and Takedown, Accessibility, and Contact pages. Policies describe the deployed Cloudflare, Google OAuth, AI, analytics, robotics, quote, and marketplace boundaries; publish `support@robopartpicker.com`; and avoid inventing a legal entity, business address, jurisdiction, payment protections, or complete-compliance claim.

- Added a single maturity registry and visible Beta labels across the AI Assistant, project import/BOM generation, completed quotes, marketplace publishing, and build/reproduction workspace. Unreleased Build Workspace marketing remains explicitly Coming soon instead of being mislabeled as Beta.

- Added fail-closed Google authentication through Better Auth. The Worker enables Google only when both Cloudflare secret bindings exist, the public health response exposes only a boolean capability, and the auth page preserves validated internal callback destinations while retaining email/password fallback.

- Rebuilt Discover Projects around server-side marketplace facets. New visitors start with 43 open physical humanoid designs, can browse all projects explicitly, and can filter by source type, robot category, inferred/official price range, BOM evidence, build outcomes, difficulty, ROS support, license, media, CAD, assembly guidance, official source and verification freshness. Open physical designs receive clearly labeled low-confidence category/BOM estimates when no stronger cost exists; commercial robots remain official-price-only.

- Added an Open source / Closed source switch to the completeness-ranked homepage rail and replaced the weak verified-BOM count with the live normalized BOM line total.

- Added privacy-safe daily interaction aggregates and a moderator/administrator-only analytics dashboard covering traffic, project engagement, featured interactions, discovery behavior, acquisition, catalog health, operations and bounded CSV export. No IPs, cookies, fingerprints, user identities, raw search text or per-person histories are stored.

- Unified project previews across the catalog, homepage and related-project surfaces. Cost now distinguishes active official prices, published estimates and known BOM subtotals; build counts state started and independently verified outcomes; BOM previews state verified, partial, unavailable, manufacturer-unavailable or not-applicable status without bare dashes. The homepage hero now uses its former empty area for an automatic information-completeness-ranked featured-project scroller, with live catalog metrics in a compact strip beneath it.

- Expanded the reviewed current-market closed-source humanoid catalog to 62 unique products. The release adds or refreshes 49 manufacturer-listed models across direct purchase, preorder, reservation, rental, robot-as-a-service, enterprise pilot, deployment, and sales-inquiry channels. It publishes 48 exact reviewed product visuals and one visibly labeled Persona identity illustration, keeps unverified prices unpublished, and excludes announced-only or historical products without a current manufacturer market channel.

- Made project discovery default to server-ranked information completeness before pagination. Verified BOM publication, BOM depth, current specifications, evidence, managed media, official sources, and core identity metadata now determine the initial order instead of client-side sorting a partial page.

- Repaired the homepage commercial showcase so humanoids are filtered before pagination and eight source-backed cards render instead of one. Project media now keeps a labeled identity illustration visible while lazy images load or fail, preventing blank gray cards.

- Withdrew synthetic category-baseline prices and build times from 300 commercial profiles, added an explicit `not_published` price state, and republished all 2,408 project descriptions from corrected evidence packets. Commercial pages now distinguish manufacturer prices, reservation deposits, contact-sales status, and unpublished pricing; Unitree G1 and H2 retain direct official prices while Atlas and other unpriced systems no longer show guesses.

- Corrected commercial catalog identities discovered during the live audit: DOBOT X-Trainer is now a manipulator rather than a humanoid, DOBOT URL filename suffixes no longer leak into published names, and reviewed manufacturer specifications now back the homepage commercial profiles.

- Rebuilt closed-source project detail surfaces around normal product language and source-backed manufacturer data. Commercial heroes now use resilient multi-image mosaics, empty audit buckets are omitted, manufacturer specifications and named systems render with official product views, BOM rows include verified photos or honest identity illustrations, and raw checksum, `Purchased`, and `Extended` implementation labels no longer leak into customer-facing copy.

- Replaced the public legacy-RPPS BOM fallback with an explicit source-traceable compiler and publication lifecycle. CSV, TSV, XLSX, Markdown, HTML, JSON, YAML, XML and KiCad adapters now account for every source object, preserve evidence locators, keep missing quantities unresolved, aggregate only exact manufacturer-plus-MPN identities, and publish lines only from verified or explicitly partial source BOMs. Software projects, commercial models without manufacturer BOMs, unclassified projects and physical projects without explicit BOMs now render distinct honest states instead of guessed parts.

- Closed unsupported BOM leakage through project counts, BOM lists and exports, component usage, sourcing estimates, customer quotes, completed quotes, project forks and RFQs. Public quote controls now use real version readiness and plain-language blockers, while owners retain private draft-estimation workflows. Removed the hard-coded `Quote gate / Fail closed` homepage metric and replaced it with a live source-verified BOM count.

- Rebuilt the project header so identity and actions occupy a full-width row above the media. The second row pairs a stable 4:3 source image with a height-filling evidence summary, preventing short descriptions and portrait assets from leaving a blank column beside each other. The surface stacks full-width on mobile.

- Added source-cited AI description generation with immutable model, prompt, voice-profile and source fingerprints. Generated prose is third-person and evidence-only, follows the project's direct builder cadence, and is rejected for unknown citations, unsupported numbers, first-person review claims, em/en dashes, semicolons and common AI filler before publication.

- Added private-evidence open-source project claims with moderator-only evidence streaming, self-review denial, stale-project protection, audited decisions and atomic edit-ownership transfer. Evidence files, references and moderator notes remain outside public DTOs.

- Added the project-page maintainer claim panel and noindexed moderator review workspace. Claimants upload bounded private evidence, track or withdraw pending requests, while authorized reviewers inspect the protected stream, record private notes, and approve or reject without exposing claim material publicly.

- Published stable, non-self-referential source-cited descriptions for all 2,408 production projects. Every current project points to exactly one immutable published generation; all sentence references resolve to the stored fact packet, and production has zero missing mappings, invalid validation reports, banned dash/semicolon prose, or local-to-D1 fingerprint mismatches.

- Mirrored 918 additional exact official component photos from Pololu, REV Robotics, SCHUNK, and T-Motor after exact manufacturer-part-number confirmation on the canonical product page. Every image is bounded, normalized to WebP, content-addressed in R2, and linked with source-page, source-image, checksum, dimensions, and transform provenance; 17 unsupported candidates remain honest identity illustrations.

- Added a global high-contrast keyboard focus indicator and repaired low-contrast warning labels and identity-illustration foregrounds. Live exact-photo and illustration part pages now have zero sampled unlabeled controls, missing alt attributes, focus failures, or horizontal overflow; sampled contrast passes AA thresholds.

- Unified homepage, project-catalog and project-detail imagery behind a resilient source-backed renderer that prioritizes managed media, deduplicates canonical URLs, advances past failed candidates, reserves stable layout space and falls back to honest robot-category illustrations.

- Eliminated mobile document overflow on the audited Unitree project and Adafruit part pages by allowing long evidence hashes to wrap anywhere and giving part-detail grid/file tracks explicit zero minimum widths.

- Canonicalized persisted project cover and RPPS image URLs at the Worker DTO boundary so retired Workers-host media links are returned as same-origin file paths while official third-party product images remain untouched.

- Replaced the part table's hardcoded missing-photo label with source-backed product images when available and honest yellow category illustrations otherwise; broken images now fail over per row without implying the fallback depicts the exact component.

- Made project 3D previews fail closed on incomplete URDF dependencies, preserve package-path mesh identity, try every eligible URDF, reject terrain/world/jig geometry, and show unassembled STL/STEP artifacts one part at a time instead of inventing robot assemblies.

- Reframed the public component catalog as technical data: typed labeled specifications with units, canonical product/manufacturer links, lifecycle and completeness profiles, explicit unknowns, engineering files, normalized BOM usage, and evidence. Supplier identities, SKUs, stock, lead time, prices, offer history, commercial filters, public search entities, public MCP tools, and legacy supplier profiles are no longer exposed; internal completed-quote workflows retain private observations.

- Recovered 23,299 collision-free Adafruit product-image links across 5,495 components from retained numeric product IDs, left seven unmatched files unlinked rather than guessing, and materialized canonical product-source evidence for every production component with a source URL.

- Replaced duplicate homepage SEO metadata on project, component, category, and BOM routes with server-generated titles, descriptions, canonical URLs, Open Graph/Twitter cards, robots directives, and schema.org data; replaced the stale static sitemap with a live D1-backed sitemap that includes every public project, component, category, and BOM while excluding private application routes from robots.

- Rebuilt BOM presentation around readable desktop rows and structured mobile cards, added explicit part-page links to every identified BOM component, expanded component detail pages with public files, source-backed images, evidence, observed product links, and published project usage, and corrected STL previews so partial part sets are normalized for inspection and never presented as a complete robot assembly.

- Improved media and purchase affordances on public catalog surfaces: project and homepage cards now use up to four source-backed RPPS images instead of only a single cover, marketplace list results hydrate all listing images for multi-image previews, marketplace cards expose a direct inquiry action, and verified supplier/product URLs now render as explicit `Buy / verify` actions on part and project BOM surfaces.

- Completed the demo-record withhold sweep across the remaining BOM, AI-tool, and build-edit paths that surfaced demo records as live claims (BOM list/detail aggregates, AI mutation tools, build selected-offer PATCH). This pass closes the last build-write seams: adding an item to a build via `POST /builds/:id/items` now rejects demo components and demo supplier offers at the repository layer (so the BOM-to-build fork and AI tool calls are covered too), and the RPPS manifest importer no longer resolves release MPNs to demo components. A demo part can therefore no longer be written into a live build, whose detail page renders unguarded component names.

- Kept the generated `REPORT_*.md/json`, offline audit scratch (`.jcode-audit/`, `tmp/`, `.hermes-handoff.md`), and regenerable `data/offer-source/` harvest candidates out of source control. These are outputs of the committed offer-source and catalog-audit tooling, not tracked source, so the working tree no longer shows them as untracked noise.

- Documented the release-blocking worker test gate as environmental: `npm run test:worker` currently cannot start its Cloudflare test pool on this host because the bundled `workerd` binary (via `@cloudflare/vitest-pool-workers`) requires GLIBC 2.29-2.35 while the host ships glibc 2.28 (AlmaLinux 8.10). The child runtime dies at load, wrapping as `write EPIPE` in `Runtime.updateConfig`. This reproduces on a clean stashed tree and is not caused by any repo change; there is no in-repo fix (the `MINIFLARE_WORKERD_PATH` override can only re-point to an equally-incompatible binary). Worker test coverage gaps for 8e5dc64, if any, are unverifiable on this host and must be run on glibc ≥2.35.
- Unified a project's current BOM into one normalized source of truth: the D1-backed BOM linked by `bom_id` now drives the overview, parts, and cost aspect pages instead of the smaller legacy flat RPPS `bom` list. Line count, unit count, known cost, and unpriced counts come from the reviewed, offer-backed items, the legacy list is shown only as supplemental source evidence, and linked-but-unresolved BOMs render honestly instead of deriving a misleading total from the legacy list.

- Made the unit/worker test scripts environment-robust by pinning `NODE_ENV=test` internally, so a globally exported `NODE_ENV=production` can no longer silently load React's production JSX runtime and break UI component rendering in the test suite.
- Hardened the project catalog listing boundary so `GET /api/v1/projects?mine=true` without a session returns `401 AUTHENTICATION_REQUIRED` instead of a `200` with an empty list. The anonymous call no longer masks the signed-in requirement from API consumers, and the one failing post-deploy acceptance gate now closes safely.
- Corrected the source-backed GitHub metadata backfill tool's completion-floor thresholds. It previously gated on `summary<20 / description<80`, so its dry run reported `0` projects even though the catalog audit counts 230 holes (177 short summaries under 80 chars, 44 short descriptions under 500, 121 missing licenses). The deterministic gate now matches the documented floor (`summary≥80`, `description≥500`) and honestly skips repos that 404 or report no concrete license/readme text.

- Hardened BOM ingestion for real-world spreadsheets and documentation by preserving XLSX column alignment across self-closing empty cells, recognizing multilingual headers, and parsing credible Markdown BOM tables without relaxing partition-table safeguards.

- Made RFQ line keys stable against BOM storage IDs, preserved `RFQ_EXPIRED` errors for late supplier responses, and isolated offer-history regression fixtures so quote and sourcing behavior is deterministic across requests and tests.

- Prioritized human-readable project documentation ahead of generic configuration files during bounded GitHub imports, while keeping slash-bearing imported file IDs on the unambiguous query-based content endpoint.

- Corrected source-backed DigiKey BOM pricing imports to use the canonical `exact` match label and `{ quantity, unitPriceMinor }` price-break shape, so exact-part sourcing and quantity tiers are no longer silently filtered out.

- Added a slash-safe file content endpoint, kept the legacy UUID content route, and updated file URL generation so harvested file IDs with path separators can be downloaded without bypassing auth or visibility checks.

- Added the missing MCP setup guide and clarified the developer page with a usable remote Streamable HTTP configuration, discovery URLs, and the expected browser-only `GET /mcp` 406 response.

- Ensured Marketplace wanted private drafts stay private, reopen in the wanted editor, and cannot be overwritten from the sell-listing editor or converted across listing types.

- Hardened RFQ response recording so quotes can only be written from states that allow `receive_partial`, unknown line keys are rejected, omitted substitute flags preserve existing values, and the frontend exposes a typed response-recording client binding.

- Accepted both `redirect` and legacy `next` authentication return parameters safely, normalized product sign-in links to `redirect`, and replaced stale header/data wording with current API-derived labels.

- Made whole-BOM sourcing objective selection deterministic across line order for fewest-suppliers and balanced estimates, and added honest delivery grouping metadata with supplier subtotals, lead ranges, and unpriced/unknown-lead blockers without inventing shipping, tax, or arrival dates.

- Replaced unsafe catalog completeness backfill mapping with a dry-run-first harvested-artifact workflow that restricts candidates to production `physical_design` projects and only writes ready file rows after verified R2 upload size and SHA-256 checks.

- Hardened project import BOM detection so ESP32 partition tables and arbitrary CSVs are not classified or parsed as bills of materials unless their filename and headers are credible BOM inputs.

### Added

- Expanded the reviewed top-300 closed-source commercial robot release from one cover per profile to source-backed product galleries. Static official-page metadata, Product JSON-LD, responsive images, rendered product-page assets, video posters, and model-specific page captures are ranked before mirroring; an explicit reviewed override records Fourier GR-2 images from the manufacturer-issued PR Newswire release after the current Fourier product route began returning a 404 shell. Every asset is normalized to WebP, checked for minimum dimensions, stripped of metadata, assigned a deterministic file identity, and rejected when its checksum or perceptual hash duplicates another image for the same robot. The release adds 828 distinct gallery objects: all 300 profiles have at least two extra images and therefore at least three visible media records, while 228 profiles have three extras. Publication is idempotent and updates managed files, project attachments, project media, and exported RPPS commercial-profile metadata without exposing supplier data.

- Added the reviewed top-300 closed-source commercial robot catalog from a 415-model candidate registry. Ranking uses anchored 12-month Google Trends interest, exact-identity 90-day Google News mentions, recent YouTube view velocity, and official product activity; first-party traffic remains excluded until sample sufficiency. Every published profile carries the raw signal sources, collection timestamps, methodology/window, source-backed description, explicit undisclosed-spec state where needed, labeled USD category estimate, and a manufacturer-attributed managed WebP thumbnail with source provenance and checksum.

- Added normalized project-profile reads and a public Specifications tab with current source-backed fields, public USD price/range freshness, transparent trend signals, methodology/window provenance, and server-ranked `Trending now` catalog pagination.

- Added authenticated project Reviews and Discussion tabs for every public project type: one editable revision-audited review per user/project, published-only rating aggregates, substantive written reviews, one-level comments, idempotent helpful reactions, reporting and platform moderation controls. No fake ratings, comments, counts, or contributor identities are seeded.

- Added private owner/operator/manufacturer-representative experience claims backed by claimant-owned private files. Only platform moderators can verify claims, self-review is denied, and public payloads expose only the approved badge type, display name and verification date, never evidence files, references, or moderator notes.

- Added private, authenticated customer quote requests for projects and BOMs with complete contact and destination intake, explicit consent, 90-day retention, frozen materials/shipping snapshots, deterministic zone-based preliminary shipping estimates, owner-only readback, redacted creation receipts, and human-review labeling. Supplier identities and commercial offer details remain absent from customer-facing snapshots.

- Added signed-in structured project proposals for assembly steps/videos, integrations, sources, identity/BOM corrections, and issue reports. Source links are mandatory, pending proposals stay private, public reads expose approved records only, and project owners, organization administrators, or platform moderators receive an audited review queue with approve/reject controls.

- Added stable detail destinations for every BOM line, including resolved catalog parts and unresolved/fabricated identity records; added source-backed part imagery and exact component STEP/STL/OBJ previews; and added honest price-history frames that display no invented time-series data.

- Added a compact Build Workspace preview to the homepage in place of the recently indexed part table, with planned inventory, BOM revision, compatibility, replacement, price-watch, and order-readiness workflow states.

- Added a fail-closed commercial catalog contract for the top-300 pipeline: closed-source complete-robot identity, canonical URL and alias deduplication, strict RFC3339 provenance, source-backed or explicitly undisclosed specifications, USD minor-unit pricing, bounded five-signal trend snapshots, and validated evidence/product-media declarations.

- Added a deterministic commercial trend scorer and CLI: tied-percentile normalization, explicit exclusion for missing/blocked public signals, first-party weight redistribution only while traffic is insufficient, alias-aware source joins, versioned source/timestamp validation, stable tie-breakers, and contiguous rank output capped at 300.

- Added immutable shared project specification, price-estimate, and trend-snapshot DTOs aligned with migration 0028, including fail-closed active selection, price freshness, proportional traffic-weight redistribution, and commercial-profile completeness that rejects undisclosed or structurally empty required evidence.

- Added a reviewed commercial candidate registry with 415 closed-source complete-robot models in nine disjoint batches, a cross-file fail-closed validator, explicit rejection/merge audit, and source verification for every accepted official URL without publishing any candidate to D1.

- Reviewed BOM Wave 2 for TNY-360 and NodeQuad, with immutable source revisions and SHA-256s, conservative Markdown/XLSX transforms, RPPS-safe deterministic refs, expected-line-count guards, explicit per-line completeness, source evidence, guarded production SQL and rollback generation, plus six verified BOM/document artifacts prepared for R2 publication.

- Public partners/advertisers/suppliers interest intake on `/partners`, backed by same-origin protected `POST /api/v1/partner-interest`, D1 persistence, basic spam checks, IP-scoped rate limiting, and an honest manual-review success state.

- Commercial showcase Wave 1 importer (`scripts/import-commercial-showcase-wave1.ts`) with 12 vendor-official closed-source records, dry-run default, explicit production gate, deterministic IDs, conflict checks, generated guarded rollback SQL, RPPS evidence, and explicit `search_index` population without repository, license, image, CAD, BOM, file, assembly, or pricing fields.

- Safe physical-design wave importer (`scripts/import-physical-design-wave1.ts`) that is dry-run-first, requires explicit preview/production selection, gates production apply, queries D1 for duplicate upstreams before insert generation, emits forward/rollback SQL under `JCODE_SCRATCH_DIR`, and preserves reviewed provenance plus analyzer-only BOM components.

- Configurable public SEO canonical base syncing for `index.html`, `robots.txt`, and `sitemap.xml`; production defaults to the active Workers URL until a custom domain resolves.

- Project records now carry a constrained `project_kind` (`physical_design`, `robotics_software`, `commercial_showcase`, `unknown`) with project-first popularity ordering, API filtering, and discovery badges/filters for physical robotics designs.

- Safe BOM data repair tooling (`scripts/repair-production-boms.ts`) that dry-runs by default, requires explicit preview/production environment selection, writes auditable SQL under `/tmp`, removes partition-table false BOMs by deterministic quality predicate, and conservatively matches snapshot BOM lines to current catalog components without fabricating prices.

## [0.7.0] - 2026-08-13

### Added

- **IU-SOURCING-DATA** — revision-aware supplier offer time-series: `offer_price_history` is appended on every observable change (never overwritten), offers carry condition, price breaks, reliability, risk and freshness labels (migration `0017`); ingestion-guarded `PUT /api/v1/offers/:id`.
- **IU-BOM-COMPILER** — per-line completeness buckets (verified/probable/unresolved/missing-qty/custom-fabricated/non-procurement), evidence locators, extraction method and confidence on the portable manifest and materialized `bom_items` (migration `0016`); unresolved lines are retained, and URDF model candidates become custom-fabricated components.
- **IU-PROJECT-CORPUS** — project provenance (`upstream_url`, `upstream_identity`, `maintainer`, `revision`, `ingested_at`, `last_checked_at`), publishability gating (no silent publication), and canonical upstream dedup (migration `0015`).
- **IU-PROJECT-GRAPH** — clone/fork lineage with upstream/downstream fork resolution, revision comparison, and change summaries (migration `0018`); `POST /projects/:id/clone`, `GET /projects/:id/forks`, `GET /projects/:id/compare/:otherId`.
- **IU-SOURCING-OPTIMIZER** — deterministic whole-BOM procurement optimizer with selectable objectives, quantity price breaks, and user constraints (preferred/blocked suppliers, region, delivery, exact/substitute/used/surplus, owned parts, price overrides); `POST /sourcing/estimate` and `/sourcing/preferences` (migration `0019`); unpriced lines are listed, never hidden.
- **IU-RFQ** — firm-quote state machine (`estimate_ready → … → user_review_required → option_selected`) with normalized line items, reconciliation, and an explicit approval gate before any handoff (migration `0020`).
- **IU-CATALOG** — per-category required field floors surfaced on part pages, and synthetic/demo data is never presented as a live supplier record.
- **IU-PROJECT-PAGE** — Sourcing estimate and Versions & forks sections on the project page, both backed by their APIs with honest not-available states.
- **IU-QUALITY-RECOVERY** — golden A/B/C semantic regression suite (`src/quality/golden.test.ts`) plus a dedicated `quality` CI workflow.

### Changed

- Production D1 database id backfilled into `wrangler.jsonc`; migrations `0014`–`0020` applied and the Worker deployed to production (`robopartpicker-production`).
- Worker integration tests now cover provenance, lineage and offer history (run in CI).

## [0.6.1] - 2026-08-12

### Added

- Corrected product definition (`docs/product-definition.md`): workflow spine, six pillars (aggregation, BOM compilation, sourcing optimization, firm quotes, user-controlled sourcing, project lineage), revised hierarchy, completion floors, golden acceptance projects A/B/C, scope boundary.
- IU-PRODUCT-RECOVERY coverage matrix (`docs/product-recovery-coverage.md`): grounded inventory of routes, API, tables, migrations, tests; partial/intentional/abandoned findings; gaps required by the corrected definition.
- Rebuilt Graph Coder Nano plan (`gcl-plan.md`): bounds, requirements, acceptance criteria, managers, and ten unit contracts (IU-PRODUCT-RECOVERY, IU-PROJECT-CORPUS, IU-BOM-COMPILER, IU-PROJECT-PAGE, IU-SOURCING-DATA, IU-SOURCING-OPTIMIZER, IU-RFQ, IU-PROJECT-GRAPH, IU-CATALOG, IU-QUALITY-RECOVERY).
- Versioned real-BOM snapshot (`data/bom-snapshots/2026-08-12-real-boms.json`, 25 projects / 401 components) and restore script (`scripts/restore-bom-snapshot.ts`, dry-run by default) so D1 BOM state can be rolled back.

## [0.6.0] - 2026-08-12

### Added

- Bulk open-source robotics catalog with popularity sorting (`feat(projects)`).
- Real-BOM harvesting: 25 popular projects now carry 401 genuine BOM components extracted from their repository BOM files and persisted to project versions. Reusable parallel harvester (`scripts/harvest-top-boms.ts`, git-protocol fetch with no GitHub API quota) and D1 persister (`scripts/persist-harvested-boms.ts`).
- Project import analyzer now parses UTF-16 and tab-separated CSVs and .xlsx BOMs, detects header rows inside title-prefixed sheets, recognizes common name/qty column variants (`Value`, `Part Name`, `Manufacturer Part`, `qty*`), and filters placeholder values.
- Reference-first project imports with partial-fetch reporting and hardened GitHub reference fetches.
- Real `sitemap.xml`, robots Sitemap directive, `og:image`/`twitter:image` (SEO).

### Fixed

- Removed 203 crawler-garbage components (JS-template names).
- Labeled 56 auto-generated artifact BOMs as such.
- Classified GitHub import denials; capped reference fetch attempts.

### Changed

- Versioned release process introduced: `VERSION` file, `scripts/release.sh`, semver tags and GitHub releases.

## [0.5.0] - 2026-07-20

### Added

- Deterministic mixed-file project analysis for up to 100 authorized R2 files, with bounded text extraction, checksums, provenance, explicit BOM candidates, URDF joint/interface structure, dependency manifests, configuration key/type metadata, procedure candidates, preview selection, and repository engineering signals.
- Lightweight, lazy-loaded URDF/mesh viewing on project pages with orbit/zoom controls, bounded device pixel ratio, disposal, and an explicit visual-preview disclaimer.
- Prominent exact-release reproduction from the project header, project-level started/evidence-backed successful reproduction counts, and dedicated detail routes for reproducibility, cost, parts, time, assembly, software, integrations, and evidence.
- Narrative descriptions for persistent builds and advisory AI quality review for project, build, Community, Marketplace, and wanted-request submissions.
- Narrative-first Marketplace listing creation with AI organization, multi-image R2 uploads, image removal, authorized source-build linking, known parts-cost coverage, asking-price comparison, and expanded price/condition/sort filters.
- D1 migration `0013_build_descriptions.sql`.

### Changed

- The primary navigation now labels the personal build workspace as “My builds”; projects remain canonical releases while personal builds are exact-release reproduction passports.
- Project import source files are attached to the resulting project after publication when authorization and scope allow. Uploaded artifacts remain private or organization-scoped by default.
- Marketplace build-cost context is computed from recorded build-item costs or selected internal supplier offers. It is not a live quote, profit calculation, or substitute for the future catalog-backed sourcing planner.

### Security

- Mixed-file analysis verifies ownership or active organization membership, caps file count/aggregate inventory/extracted text, and never executes imported content.
- Marketplace source-build IDs are server-authorized before creation or update; only aggregate cost and coverage are exposed on a listing.
- Marketplace media accepts only validated image uploads, enforces a twelve-image limit, remains private while the listing is a draft, and becomes public with the published listing.
- Marketplace parts-cost aggregation excludes supplier offers whose currency differs from the linked build currency instead of silently mixing currencies.

### Preview

- Deployed the isolated Cloudflare preview at Worker version `156a4542-8bf8-4077-aa8a-322764e79cca`, applied all thirteen migrations, and verified the empty catalog, live API/MCP boundaries, structured AI form drafting and quality review, SPA deep links, and the single Berkeley Humanoid Lite image/URDF test record.

## [0.4.0] - 2026-07-20

### Added

- Universal deterministic project analysis for public GitHub repositories, portable/legacy RPPS, CSV/JSON/YAML BOMs, URDF, and bounded ZIP project packages stored privately in R2. Imports inventory source artifacts, preserve provenance, generate a portable draft, and produce the progressive buildability scorecard without executing or treating imported content as instructions.
- Anonymous import analysis for bounded text inputs, authenticated owner-only ZIP analysis, strict canonical GitHub URLs, archive traversal/expansion limits, and explicit staging for saved repository imports.
- OAuth 2.1 authorization-server support through Better Auth with PKCE, public dynamic client registration, short-lived JWT access tokens, refresh tokens, scoped consent, protected-resource metadata, and session-linked revocation.
- Authenticated private `/mcp/private` tools for projects, exact releases, builds, release collaboration, and confirmation-gated build mutations. The public `/mcp` remains stateless and read-only.
- AI-assisted, review-before-apply form drafting for projects, Community threads, Marketplace listings/wanted requests, build engineering records, and RPPS change proposals.
- Exact-release build passports pinned to the immutable RPPS release ID, version, and package hash, with stable mappings into editable build items and procedure steps.
- Evidence-backed release outcomes, server-derived maintainer/independent status, Structured/Tested/Reproduced/Repeated levels, honest separate freshness status, structured change proposals and maintainer review, draft publication, and stable-ID semantic release diffs.
- D1 migrations `0011_oauth_provider_and_private_mcp.sql` and `0012_rpps_release_collaboration.sql`.

### Changed

- Project creation is private by default, permits analysis before sign-in, and offers GitHub, RPPS/BOM/URDF/ZIP, manual, and legacy RPPS JSON entry paths in the existing yellow/neutral interface.
- Health metadata now advertises public/private MCP and tokenless versus token-enhanced repository import capabilities separately.
- Zod is pinned to 4.4.3 for the Better Auth OAuth provider and MCP/AI schema stack; `fflate` provides Worker-compatible bounded ZIP extraction.

### Security

- Private MCP validates issuer, audience, scope, signature, and the live Better Auth session inside the Worker; sign-out or session deletion revokes MCP access.
- AI and MCP mutations remain inert proposals until literal user confirmation. Release-change proposals do not mutate published packages; accepted changes are incorporated only through a new immutable release.
- Secret values were scanned against the browser bundle with zero matches. Cloudflare's build-time `.dev.vars` copy remains ignored, untracked, preview-only, and outside the static client directory.
- The isolated empty-data Cloudflare preview was migrated, deployed, and smoke-tested at Worker version `fe68d7f1-25e9-40ea-a6aa-fbcd21011e8b`.

## [0.3.0] - 2026-07-19

### Added

- Vendor-neutral `RPPS 0.1 Draft` manifest and lockfile contracts with stable object IDs, namespaced extension preservation, legacy RPPS conversion, checked-in JSON Schemas, examples, and local `init`, `validate`, `buildability`, and `migrate` CLI commands.
- Deterministic progressive Core, Buildable, Reproducible, and Collaborative scorecards with stable rule IDs, blocker/warning severity, affected dimensions, and explicit corrective guidance.
- Anonymous `/api/v1/rpps/validate` plus server-authorized, content-addressed immutable project releases with private drafts, public publication, audit history, and normalized D1 assemblies, interfaces, provenance, and findings.
- D1 foundations for structured RPPS change proposals and release-linked build outcomes without prematurely exposing incomplete product flows.
- Browser-based YAML/JSON manifest and lockfile validation, scorecard inspection, portable downloads, and authenticated draft/public release creation.
- Portable RPPS validation in the existing read-only MCP and authorized AI toolsets, with legacy validation retained for compatibility.

### Changed

- Projects/import/releases now treat the previous flat RPPS 1.0 JSON as a legacy application format; the rest of RoboPartPicker remains unaffected and continues to use its existing domain APIs.
- Evidence language uses Structured, Tested, Reproduced, and Repeated achievement levels while Current is a separate freshness status. Compatibility sources are explicit and the product does not claim certification.
- RPPS composes Open Know-How, CycloneDX, SPDX, ROS REP-103, and native engineering formats instead of replacing them. SPDX 3.1 hardware adapters remain experimental until the upstream specification is published.

## [0.2.9] - 2026-07-19

### Added

- R2-backed managed project artifacts with project-version linkage, server-authorized listing/detach, image header/dimension validation, and Project Detail upload/download controls.
- Stateless `/mcp` Streamable HTTP endpoint with public read-only robotics search, comparison, project-artifact, and RPPS-validation tools.
- OpenRouter configuration for `deepseek/deepseek-v4-pro` with response, tool-step, retry, per-minute, and rolling token cost controls.

### Changed

- Empty catalog, project, and Marketplace states are now the default local and preview workflow; fixture seeding is an explicit optional utility.

### Removed

- Previously generated demo projects and all remaining demo fixture records from the isolated live preview database.

## [0.2.8] - 2026-07-19

### Added

- Six public RPPS demo projects derived deterministically from the downloaded BOM and component fixtures.
- Explicit demo-fixture labels on the home page, project catalog, and project detail routes.
- Schema validation that requires project fixture coverage in addition to components, suppliers, and BOMs.

### Changed

- The idempotent seed now links each fixture BOM to its derived project and preserves the original fixture author as a labeled RPPS author value.

## [0.2.7] - 2026-07-19

### Added

- Collapsible project technical-record editor for authors, required tools, required skills, known issues, and evidence.
- D1 normalization of RPPS tools/skills into `project_requirements` and evidence into `evidence` plus `evidence_claims`.
- Worker integration coverage for technical-record authorization, normalization, version publication, and stale-write rejection.

### Changed

- RPPS publication now requires the current project record version and rejects stale browser state with a conflict response.

## [0.2.6] - 2026-07-19

### Added

- Organization ownership and visibility controls for project creation, project access settings, build creation, and build settings.
- Server-authorized project/build scope transfers with organization-admin checks and optimistic concurrency protection.
- Build name, lifecycle status, and progress editing in the persistent build workspace.

### Fixed

- Generated project BOMs now inherit and retain the project owner, organization, and visibility scope.
- Optimistic update checks now allow D1 search-index trigger changes while still rejecting stale versions.

## [0.2.5] - 2026-07-19

### Added

- Isolated Cloudflare preview environment using a dedicated Worker, D1 database, and R2 bucket.
- Public full-stack preview at <https://robopartpicker-preview.ludomi2502.workers.dev>.
- Explicit preview migration, demo-seed, build, and deployment commands for repeatable live previews.
- Guarded remote-D1 bootstrap for the equivalent trigger syntax required by Cloudflare, without rewriting an applied migration.

## [0.2.4] - 2026-07-19

### Added

- Organization workspace for creation, settings, member addition, role/status changes, and removals through the Worker API.
- Organization authorization regression coverage for privileged role changes and final-owner protection.

## [0.2.3] - 2026-07-19

### Added

- D1-backed notification center with unread filtering/counts, safe internal links, mark-read actions, and in-app/email preference controls.
- Preference-aware in-app notifications for Community replies and Marketplace inquiries, with recipient-isolation tests and truthful email-provider messaging.

## [0.2.2] - 2026-07-19

### Added

- Authorized D1 APIs and compact Builder editors for configuration snapshots, pinned firmware references, calibration results, and verification tests.
- Build activity/audit records and attached-file validation for technical records, with Worker integration coverage for persistence, isolation, deletion, and structured calibration data.

## [0.2.1] - 2026-07-19

### Added

- Atomic administrator promotion of staged offers, projects, BOMs, and integrations into canonical D1 records, including validated external/canonical dependency references and regression coverage.
- Structured BOM-item and integration-entity definitions in the versioned scraper ingestion contract.
- Required-secret declarations for local validation and fail-closed production deployment.

### Fixed

- Corrected imported evidence persistence to use the D1 `confidence` column and bounded generated canonical slugs to the RPPS limit.

## [0.2.0] - 2026-07-19

### Added

- Same-origin Cloudflare Worker API with request IDs, structured errors, validation, rate limiting, CSRF-oriented origin checks, and server-side authorization.
- Nine sequential D1 migrations covering Better Auth, identities and organizations, the robotics catalog, RPPS projects and BOMs, persistent builds, Community, Marketplace, imports, files, AI, notifications, audit records, and cross-domain FTS search.
- Better Auth email/password sessions on D1, profile APIs, organization roles, account recovery/verification delivery boundaries, revocation, and deletion support.
- R2 upload intents, ownership-aware access, private/public metadata, attachment authorization, file limits, and a malware-scanning quarantine boundary.
- Versioned external ingestion contract with service authentication, partial batch success, idempotency, staging, deterministic match candidates, withdrawal, admin review, canonical promotion, and audit history.
- D1-backed components, suppliers, offers, projects/RPPS, BOMs, builds, Community, Marketplace, search, notification, import, admin, file, and AI routes.
- Worker-side AI provider abstraction with stored conversations/usage, authorized tools, injection-resistant context rules, and confirmation-gated mutation proposals.
- Idempotent demo fixture importer, guarded local reset, local export, schema validation, isolated Worker/D1/R2 integration tests, and CI validation.
- Secret-safe baseline archive, repository engineering guide, local/deployment documentation, and machine-readable ingestion/RPPS schemas.

### Changed

- Replaced browser database calls and local-only core product records with the typed `/api/v1` client and D1-backed persistence.
- Preserved the yellow-and-neutral engineering interface while adding honest demo-state, loading, empty, error, authorization, upload, and persistence states.

### Removed

- Lovable runtime integration, AI gateway dependency, Supabase client/auth/database/storage/function code, packages, environment variables, and migrations.

## [0.1.0] - 2026-07-19

### Archived

- Original downloaded Lovable/Supabase implementation, before the standalone migration.
