# Standalone migration implementation plan

Status legend: `[x]` implemented and directly verified, `[~]` implemented foundation with remaining breadth or validation, `[ ]` pending.

## 0. Baseline audit and rollback

- [x] Selected npm from the checked-in lockfile; audited React 18, Vite, TypeScript, React Router, 30 browser routes, fixtures, local storage, Supabase, edge-function, environment, and test usage.
- [x] Installed the downloaded dependency tree and ran development startup, type-check, lint, tests, and build before architectural changes.
- [x] Preserved the yellow/neutral engineering UI as the visual source of truth.
- [x] Created a secret-safe ZIP, baseline commit `997edb5`, and annotated `v0.1.0-lovable-baseline` tag.
- [x] Added `AGENTS.md`, this plan, architecture/schema/ingestion/local/deployment documentation, and `CHANGELOG.md`.

## 1. Cloudflare foundation

- [x] Added Hono, Better Auth, Wrangler, the Cloudflare Vite plugin, generated Worker types, and isolated Worker test tooling.
- [x] Configured one same-origin Worker, Worker-first `/api/*`, static assets, SPA fallback, local `DB`/`FILES`, and a distinct flattened production environment.
- [x] Added typed bindings, request IDs, JSON errors, validation, security headers, request limits, same-origin mutation checks, D1 rate limiting, and audit events.
- [x] Created and clean-applied nine sequential D1 migrations: 112 tables including Better Auth, all requested product domains, indexes, constraints, triggers, and FTS5 search.
- [x] Added idempotent demo fixture seed, guarded local reset, schema validation, inspect, and FTS-aware data export commands.
- [x] Started `npm run dev` on `127.0.0.1:8080`; verified health, major public/private API groups, and SPA deep-link fallback over HTTP.

## 2. Authentication and authorization

- [x] Added explicit Better Auth D1 tables and mounted `/api/auth/*`; runtime auto-migration is not used.
- [x] Implemented email/password signup/sign-in/sign-out, cookie sessions, revocation/deletion through Better Auth, and email verification/password reset delivery boundaries.
- [x] Replaced Supabase browser auth with the Better Auth React client/context.
- [x] Added profiles, preferences, organizations, members, invitations schema, organization roles, platform roles, reusable authorization policies, and private resource checks.
- [x] Worker integration tests prove sign-up, sign-in, sign-out/revocation, unauthenticated denial, build/file isolation, organization viewer denial, owner mutation, and Community ownership.

## 3. Product-domain vertical slices

- [x] Components/manufacturers/suppliers/offers: D1 repositories/APIs, filters, numeric validation, region/manufacturer filters, save/compare (four same-category maximum), URL state, CSV/share/BOM actions, evidence/freshness, and honest demo labels.
- [~] Projects/RPPS/BOMs: versioned RPPS schema/import/export, normalized persistence, publication, BOM versions/items/export/fork, repository-import boundary, and review staging are implemented. Rich maintainer/media/evidence/known-issue editing screens remain limited.
- [~] Builds: D1 persistence, privacy, start-from-project, items/quantities/offers/status/cost, steps, problems/resolutions/decisions, version snapshots, files, export, and dedicated firmware/configuration/calibration/test editors are implemented. Organization creation, settings, membership, role, and suspension UX now expose the server-enforced collaboration model; assigning organization ownership to projects/builds from their editors remains limited.
- [x] Community: D1 threads, structured types/data, linked entities, posts, reactions, bookmarks, reports, contributor stats, safe paths, reply anchors, and accepted-answer invariants are implemented and tested.
- [~] Marketplace: persistent drafts/editing/publishing, seller/listing records, saves, wanted types, inquiries/messages/offers/reports/moderation schema, build/component prefills, and honest no-payment claims are implemented. Transaction-provider, expiration automation, and full moderation UI are intentionally absent.
- [x] Notifications/preferences have protected APIs, an unread header indicator, a dedicated notification center, safe internal links, read/read-all actions, and in-app/email preference controls. Community replies and Marketplace inquiries create in-app notifications; email preferences remain an honest integration boundary until a provider is configured.

## 4. Files, ingestion, search, and AI

- [x] R2 upload initialization, nonce/token validation, size/MIME policy, generated keys, metadata, attachments, ownership, private/public reads, deletion, and scanner quarantine boundary are implemented and tested.
- [x] External ingestion has a versioned JSON Schema/example, service credential, size/schema validation, partial success, idempotency, raw records, record-specific staging, exact matches, withdrawal, audit/errors, and admin review. Canonical creation supports manufacturers, suppliers, components, offers, projects, BOMs, integrations, and evidence, with validated dependency ordering and atomic D1 promotion; teardown, commercial-robot, and Marketplace-reference inputs remain reviewed reference records by design.
- [x] Indexed FTS search covers components, projects, manufacturers, suppliers, offers, visible builds, Marketplace, and Community with typed categories, filters, ranking, URL state, and pagination.
- [~] AI runs only in the Worker with streamed provider abstraction, stored conversations/messages/tool calls/usage, authorized read tools, evidence retrieval, comparison, RPPS validation, build state, and confirmation-gated BOM/substitution/problem proposals. RFQ/sourcing-plan, resolution, and Marketplace-draft tools remain future breadth.
- [x] No Queue binding was added: current batches run within the bounded request path. Long-running production extraction/notification processing should introduce Queues only when measured duration requires it.

## 5. Release quality

- [x] Unit tests cover comparison, RFQ normalization/storage safety, safe Community links, tags, and slugs.
- [x] Worker tests run all migrations against isolated D1/R2 and cover health/FTS, auth sessions, authorization/isolation, builds/BOM export, build engineering records and attached-file checks, organization role changes and final-owner protection, Community accepted answers, notification generation/isolation/preferences, ingestion validation/idempotency, R2 authorization, Marketplace inquiry honesty, and AI provider failure.
- [x] CI performs clean install, type-check, lint, contract validation, unit/Worker tests, clean D1 migrate/seed/schema validation, and production build.
- [x] Supabase/Lovable runtime code, packages, variables, migrations, generated types, stale Bun lockfile, and platform metadata were removed. The sanitized baseline archive/tag remains the rollback source.
- [x] Production `vite build` and `wrangler deploy --dry-run` pass with a flattened `robopartpicker-production` configuration and D1/R2/assets bindings; no publish occurred.
- [ ] In-app browser control was unavailable in this session, so desktop/mobile visual inspection, accessibility automation, and browser-driven end-to-end flows remain unverified.
- [ ] Production D1/R2 resources, real provider secrets, remote migrations, deployment, custom domain, and deployed health/auth/isolation checks require explicit production access and approval.
- [x] Record validated local states in annotated checkpoint tags through `v0.2.4-organization-management`; production deployment remains separate.

## Downloaded baseline results (2026-07-19)

| Check | Baseline result |
| --- | --- |
| `npm install` | Passed; inherited tree reported 20 advisories: 4 low, 6 moderate, 10 high. |
| `npx tsc -b --pretty false` | Passed. |
| `npm test -- --reporter=verbose` | Passed: 3 files, 27 tests. |
| `npm run build` | Passed in 36.95s; 4.26 MB main JS and 1.76 MB logo raised size concerns. |
| `npm run lint` | Failed: 62 errors and 23 warnings. |
| Development server | Started on `127.0.0.1:8080`, then stopped after the baseline check. |

## Decisions

- Raw prepared D1 repositories keep the large schema inspectable and avoid a second migration abstraction.
- D1 `batch()` plus validation and schema triggers enforce cross-statement invariants where an interactive transaction is unavailable.
- Local seed data is explicit demo data; production is not seeded by deployment scripts.
- Repository content, scraped data, posts, uploads, and AI context are untrusted input and never instructions.
- The large AI rendering/client chunk and 1.76 MB logo remain performance work; they do not invalidate correctness but should be code-split/optimized before traffic scale.
