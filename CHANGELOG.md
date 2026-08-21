# Changelog

## Unreleased

### Fixed

- Completed the demo-record withhold sweep across the remaining BOM, AI-tool, and build-edit paths that surfaced demo records as live claims: BOM list/detail aggregates now exclude demo offers and their demo suppliers (`supplier_offers.is_demo = 0`, `suppliers.is_demo = 0` on the selected-offer and lowest-offer joins plus the `knownOfferCount` subquery), so a demo price/count can no longer appear on a live BOM or project detail page; the AI mutation tools (`propose_bom_item`, `propose_substitution`) no longer resolve demo components into a live build; and a build item's selected supplier offer now rejects demo offers. These are additive SQL predicate guards matching every guarded sibling seam (catalog, search, marketplace, sourcing, MCP, and the other AI tools) from the prior sweep.

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
