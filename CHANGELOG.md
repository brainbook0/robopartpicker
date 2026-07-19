# Changelog

All notable changes to RoboPartPicker are recorded here. Versions follow semantic versioning while the standalone application is developed.

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
