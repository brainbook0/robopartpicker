# D1 database schema

The SQL migrations in `migrations/` are authoritative. This document explains the domain model and conventions.

Remote D1 bootstrap preserves the immutable migration files. Cloudflare's remote SQL parser rejects the `SELECT CASE … RAISE()` trigger form in the already-applied `0003` migration, while accepting the equivalent `SELECT RAISE() WHERE …` form. `scripts/apply-remote-migration-compat.ts` performs that one exact guarded substitution only when a fresh remote database has exactly migrations `0001–0002`; it executes and records `0003` atomically, after which normal Wrangler migrations resume. Any unexpected migration or table state fails closed.

## Conventions

- IDs are application-generated text UUIDs.
- Timestamps are UTC ISO-8601 text in one consistent millisecond format.
- Boolean values are integers constrained to `0` or `1`.
- Money uses integer minor units plus an ISO currency code; measured decimal values use documented numeric units.
- Dynamic JSON is text with `json_valid` checks where appropriate. Stable business fields remain normalized columns.
- Foreign keys, unique/check constraints, and indexes are explicit. Runtime code does not depend on mutable PRAGMA state or extensions.
- Soft deletion is limited to recovery/audit-sensitive user content. Version columns protect collaborative mutable records.

## Domains

| Domain | Tables |
| --- | --- |
| Better Auth | `user`, `session`, `account`, `verification` |
| Users and organizations | `profiles`, `user_preferences`, `organizations`, `organization_members`, `organization_invitations` |
| Catalog and sourcing | `manufacturers`, `suppliers`, `supplier_regions`, `components`, `component_revisions`, `component_specs`, `component_files`, `supplier_offers`, `offer_price_history`, `evidence`, `evidence_claims`, `data_conflicts`, `integrations`, `integration_entities`, `component_alternatives` |
| Projects and RPPS | `projects`, `project_versions`, `project_maintainers`, `project_files`, `project_media`, `project_requirements`, `project_steps`, `project_known_issues`, `boms`, `bom_versions`, `bom_items`, `bom_item_alternatives` |
| Builds | `builds`, `build_members`, `build_versions`, `build_items`, `build_steps`, `build_step_dependencies`, `build_files`, `build_configurations`, `build_firmware`, `build_calibrations`, `build_tests`, `build_problems`, `build_resolutions`, `build_decisions`, `build_activity` |
| Community | `forum_categories`, `forum_threads`, `forum_posts`, `forum_reactions`, `forum_bookmarks`, `forum_reports`, `forum_moderation_actions` |
| Marketplace | `marketplace_listings`, `marketplace_listing_images`, `marketplace_listing_items`, `marketplace_saves`, `marketplace_inquiries`, `marketplace_offers`, `marketplace_messages`, `marketplace_reports`, `marketplace_moderation_actions`, `marketplace_transactions` |
| Imports | `import_sources`, `import_jobs`, `import_records`, `staging_components`, `staging_manufacturers`, `staging_suppliers`, `staging_offers`, `staging_projects`, `staging_integrations`, `canonical_match_candidates`, `import_errors`, `import_audit_events` |
| AI and notifications | `ai_conversations`, `ai_messages`, `ai_tool_calls`, `ai_usage`, `project_memory`, `notifications`, `notification_preferences` |
| Administration | `audit_events`, `rate_limit_events`, `feature_entitlements`, `subscriptions`, `usage_counters` |
| Files | `files` centralizes R2 metadata and ownership; domain-specific file tables reference it. |

Marketplace buyer/seller offers and supplier commercial offers are deliberately separate tables and APIs.

Each published RPPS package remains intact as validated JSON in `project_versions`. Queryable technical records are also normalized: assembly steps populate `project_steps`, known issues populate `project_known_issues`, required tools and skills populate `project_requirements`, and evidence produces provenance rows in `evidence` plus project-scoped `evidence_claims`. Older version rows are retained for history.

## Authorization invariants

Private project/build/file/marketplace/import/message reads require ownership, membership with a permitted role, or a platform moderation policy. Organization membership is unique per user and organization. Organization owner is a distinct role and the last active owner cannot be removed without an ownership transfer.

Question acceptance is enforced by explicit owner/type/post checks followed by a trigger-protected update: the actor owns the question thread, the thread type is `question`, and the post belongs to the thread. A database trigger rejects invalid accepted-answer references. Deleting an accepted reply clears the accepted ID and returns the question to `open` before deleting the reply.

## Migration policy

Files are named `0001_description.sql`, `0002_description.sql`, and so on. Applied migrations are immutable; corrections use new files. Schema migrations never include demo or production data. Clean migration and empty-schema validation run in CI against Wrangler's local D1 state.

D1 migration reference: <https://developers.cloudflare.com/d1/reference/migrations/>.
