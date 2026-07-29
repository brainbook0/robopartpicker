# Changelog

All notable changes to RoboPartPicker are recorded here. Versions follow semantic versioning while the standalone application is developed.

## [Unreleased]

### Added

- Production-facing Terms of Service, Privacy Policy, Community Guidelines, legal overview, footer navigation, and explicit account-creation acknowledgement.
- Public reproduction attribution on the project reproducibility page, with release/outcome/evidence context and anonymity preserved for private builds.

### Changed

- The RPPS explanation is now a compact note at the bottom of the homepage so featured projects and core platform data remain the primary focus.
- The homepage now explains the RoboPartPicker Project Standard in plain language, ranks a dedicated featured-project section from project completeness and reproduction evidence, and makes the component, supplier, project, and BOM metrics navigable.
- RPPS is expanded as “RoboPartPicker Project Standard” on discovery and specification pages.

### Security

- Public reproduction responses expose only outcome metadata and show builder identity only when the associated build is public; private build details remain undisclosed.

## [0.6.0] - 2026-07-21

### Added

- Contextual AI actions with preview, field/source/fact/inference/confidence/missing-information disclosure, apply/edit/reject/undo controls, high-impact confirmation, and model/prompt/tool/latency/cost audit records.
- Server-configurable provider/model registry, task routing, budgets, timeouts, fallbacks, caching, usage tracking, prompt versions, regression-gated activation, and a versioned robotics evaluation suite.
- Privacy-aware AI-friction records with user inspection/deletion and protected operational clustering and resolution queues.
- Queue-backed, persistent project import jobs and isolated native-format processing for robot descriptions, CAD, archives, documents, BOMs, manifests, and configuration files without executing imported scripts or Xacro.
- Robot link/joint/geometry extraction, interactive hierarchy browsing, missing-asset reporting, and explicit human review of purchasable, fabricated, assembly, or unresolved candidates.
- Rich sanitized Markdown editors, technical records, resolvable missing-information requests, BOM verification states and immutable corrections, versioned reproductions, project roles, contribution review, notifications, and safe direct messaging.
- Private creator analytics, complete-robot part-out inventory and pricing ranges, individual draft listings, protected operations interfaces, and responsive workflow screens.
- Isolated Pixel 5 end-to-end coverage for mobile navigation, filters, upload/import progress, build checklists and Technical Records, part-out and listing creation, full-screen editor focus, message requests/replies, improvement-record privacy, and administration denial.

### Changed

- Mobile editor grids now contain wide tables and toolbars without page overflow; Preview and Full screen remain immediately tappable, and shared dialogs are viewport-centered with explicit focus restoration.

### Security

- Imported code and Xacro are never evaluated in the Worker; native/archive processing uses fixed trusted commands in an isolated service.
- Project evidence, uploads, part-out sources, conversations, and administrative queues are authorized server-side. Analytics use rotating hashes and coarse geography, and AI-improvement records omit unnecessary full conversations and source files.
- Prompt and routing candidates cannot be promoted without a passing regression evaluation. High-impact AI changes remain explicit user-confirmed proposals.

### Deployment

- Not deployed by this change. Queue, dead-letter queue, container, Durable Object, D1 migration, R2, provider secrets, and evaluation runner must be provisioned and validated per environment before release.

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
