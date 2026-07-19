# Changelog

All notable changes to RoboPartPicker are recorded here. Versions follow semantic versioning while the standalone application is developed.

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
