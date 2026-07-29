# RoboPartPicker data-collection unblock runbook

**Current decision:** GO for U-002
**Latest evidence:** `.agent-planning/artifacts/execution-readiness-recheck.json`

## Completed safely

- All 139 preserved dirty-worktree files remain byte-identical to the U-001 baseline.
- U-002 now has a concrete canonical inventory path, explicit `tests/db` creation, existing-table ownership rules, and pilot/expansion capacity test envelopes.
- Jcode compatibility is GO based on verified APS capabilities on the current runtime, replacing the earlier unverified numeric-version proxy.
- The account owner confirmed the previously exposed provider credential was revoked or rotated; production AI remains fail-closed until a replacement is deliberately configured.
- A private authoritative repository now exists at `lucadominguez/robopartpicker`, with `origin` configured for this checkout.
- Cloudflare authentication is active. Preview and production each report all 14 existing migrations applied, 184 application tables, and zero foreign-key failures.
- Fresh preview and production Time Travel bookmarks were captured without restoring or mutating either database.
- No data-collection implementation, remote migration, scraping, live-source access, production database mutation, or paid external-service action occurred during preflight.

## Cleared execution gates

1. **Authoritative Git repository**
   - The account owner authorized creation of the private `lucadominguez/robopartpicker` repository.
   - This checkout uses that repository as `origin`.

2. **Cloudflare authentication**
   - `wrangler whoami` reports an authenticated account with Workers and D1 access.
   - The read-only preview and production migration checks both report no pending migrations.

3. **Remote D1 compatibility and recovery evidence**
   - Fresh read-only queries confirm 184 application tables and zero foreign-key failures in both preview and production.
   - Current Time Travel bookmarks were retrieved for both databases. No restore was attempted.
   - Historical evidence still confirms the fresh production database traversed migration `0003` and the upgraded preview traversed migration `0014` without editing prior migrations.

4. **Provider credential rotation**
   - The account owner confirmed rotation or revocation without disclosing the credential.
   - Production has no `AI_PROVIDER_KEY` secret and therefore remains fail-closed.

## Immediate next executable step

The 139-file baseline verifier reports zero mismatches. Begin U-002 with **only** these authorized writes:

- `migrations/0015_data_collection_provenance.sql`
- `docs/database-schema.md`
- `tests/worker/data-collection-provenance.test.ts`
- `docs/database/data-collection-capacity.md`
- `tests/worker/data-collection-capacity.test.ts`
- `scripts/validate-schema.ts`
- `tests/worker/api.test.ts`

Any need to edit migrations `0001` through `0014`, overwrite historical rows, or store large raw documents in D1 is an immediate STOP.
