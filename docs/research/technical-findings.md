# RoboPartPicker data-collection technical findings

Research date: 2026-07-29 UTC

## Repository stack and constraints

- Application version: `0.6.0`.
- Declared runtime and validation stack: Hono `^4.12.31`, Zod `4.4.3`, Wrangler `4.112.0`, Cloudflare Vite plugin `1.45.1`, Cloudflare Vitest pool `0.18.6`, Vitest `4.1.10`, TypeScript `^5.8.3`, Vite `8.1.5`, `fflate` `0.8.3`, YAML `2.9.0`, and `urdf-loader` `^0.12.6` from `package.json`.
- The production application is a same-origin Cloudflare Worker using D1, R2, Queues, Hono, Better Auth, static assets, and Worker observability. Production and preview omit Containers and native Sandbox processing on the current Workers Free account.
- `worker/services/project-import.ts` pins GitHub API version `2022-11-28`. The external collector is a separate workflow and must not silently change that interactive import path.
- The requirements-ready canonical plan is `docs/plans/2026-07-28-robopartpicker-data-collection-plan.md`, hash `0d92cb7995721e5b84feba638e208a60e8da593146bf0b69cbde8cfa134424da` before technical-plan mutation.

## Locked technical decisions

### TD-001: External collector runtime

Use a containerized Python collector as the primary acquisition and heavy-parser runtime. Schedule it with GitHub Actions for the pilot after a Git remote and Actions-enabled repository exist. Keep the collector runnable locally and in a generic OCI-compatible runner so scheduling can move without rewriting adapters.

Rationale:

- GitHub documents standard GitHub-hosted runners as free for public repositories; private repositories receive plan-dependent included minutes and storage, with excess billable to the repository owner.
- Scheduled workflows support POSIX cron, run from the default branch, may be delayed during high load, and are not a real-time scheduler. The design therefore treats cadence as a target and records freshness debt rather than promising exact start times.
- Hosted runners can execute Python, Node, headless-browser libraries, PDF tools, and safe metadata parsers that do not fit the production Worker. Native or risky parsers remain allowlisted and sandboxed by the runner, not the Worker.
- Repository secrets can hold the ingestion credential and source API tokens without placing secret values in the plan or repository.

Fallback order:

1. Self-hosted runner using the same locked container image and workflow contract.
2. A small OCI-compatible scheduled VM or container service only after price, region, egress, secret management, and shutdown caps are verified within the USD 50 monthly ceiling.
3. Manual operator invocation for development and incident recovery. Manual mode is not acceptable as the final production cadence.

Launch blocker: the recovered handoff records no Git remote. GitHub Actions scheduling cannot be implementation-ready for production until a remote, repository ownership, visibility, included minutes, billing budget, and secret authority are verified.

Authoritative sources:

- Scheduled workflows: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- Actions billing: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- Actions limits: https://docs.github.com/en/actions/reference/limits
- Actions secrets: https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions
- Workflow artifact retention: https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/removing-workflow-artifacts

### TD-002: Cloudflare remains the trust and canonicalization boundary

Cloudflare responsibilities:

- Authenticate external ingestion.
- Validate versioned envelopes and record schemas.
- Persist source, job, record, claim, policy, conflict, review, canonical-link, budget, and audit metadata in D1.
- Store policy-approved immutable evidence bytes in content-addressed R2 objects; otherwise store immutable external references and hashes.
- Queue bounded pointer messages for asynchronous internal normalization, matching, conflict generation, and review preparation.
- Serve review and provenance APIs, enforce authorization, expose current canonical views, and record withdrawals or supersession.
- Run lightweight scheduled maintenance such as due-source calculation, freshness debt, retention sweeps, or stalled-job recovery. Cron is not the primary broad crawler.

External responsibilities:

- Network discovery and acquisition.
- Robots and source-policy preflight.
- Conditional HTTP and API requests.
- Headless browser work.
- PDF/OCR and safe document conversion.
- CAD, ROS, archive, spreadsheet, and large-file metadata processing.
- AI-assisted extraction and evidence-span production.
- Submission of bounded records and snapshot manifests.

Cloudflare Workers best practices require binding access for Cloudflare services, Queues or Workflows for background work, streaming for unknown-size bodies, awaited or `waitUntil` promises, generated binding types, secret bindings, and structured observability.

Authoritative sources:

- Workers best practices: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Queues limits: https://developers.cloudflare.com/queues/platform/limits/
- Queues pricing: https://developers.cloudflare.com/queues/platform/pricing/

### TD-003: Queue messages are pointers, not evidence payloads

- Cloudflare Queues messages are limited to 128 KB, with a maximum consumer batch size of 100.
- Workers Free queue retention is 24 hours and includes 10,000 operations per day. A normal delivery commonly incurs write, read, and delete operations.
- Durable job and retry state therefore belongs in D1. Queue messages contain only job IDs, source IDs, record IDs, content hashes, attempt numbers, and trace IDs.
- Evidence bodies belong in R2 or approved external immutable references. Records that exceed bounded synchronous ingestion are uploaded or registered first, then processed by pointer.
- A dedicated scrape-ingestion queue and dead-letter queue should be separate from project-import and AI-evaluation queues to avoid retry-policy and ownership coupling.

Authoritative sources:

- https://developers.cloudflare.com/queues/platform/limits/
- https://developers.cloudflare.com/queues/platform/pricing/

### TD-004: D1 stores normalized state, not large raw bodies

Current Free-plan facts documented by Cloudflare on the research date:

- Maximum database size: 500 MB per database on Workers Free.
- Maximum account storage: 5 GB on Workers Free.
- Maximum D1 queries per Worker invocation: 50 on Workers Free.
- Maximum string, BLOB, or row size: 2 MB.
- Free-plan billing allowance: 5 million rows read per day and 100,000 rows written per day.

Design implications:

- Keep D1 rows narrow and indexed. Store normalized claims, locators, hashes, and references rather than full large documents.
- Split high-cardinality observations from stable entities and derive latest views through indexed queries.
- Batch writes deliberately under the subrequest/query ceiling and use job checkpoints rather than unbounded transactions.
- Add source-level daily write budgets before the pilot. Stop acquisition before D1 limits are exhausted.
- Treat the current 184-table schema as a migration-risk signal. New tables must be cohesive and additive instead of generating a table for every source-specific field.

Authoritative sources:

- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/

### TD-005: R2 is content-addressed evidence storage with policy and lifecycle gates

Current R2 facts documented by Cloudflare on the research date:

- Standard storage free tier: 10 GB-month per month.
- Free operations: 1 million Class A and 10 million Class B requests per month.
- Standard storage pricing above the free tier: USD 0.015 per GB-month; Internet egress is free.
- Single-part upload maximum: 5 GiB; multipart is available for larger objects. The application will impose much smaller source-class limits.

Design implications:

- Key approved evidence by SHA-256, for example `source-snapshots/{source_id}/{sha256}`.
- Store immutable metadata in D1: hash, size, MIME, retrieval date, license/reuse state, retention class, encryption or access state, and source record links.
- Deduplicate identical bytes and use R2 lifecycle rules only where the corresponding D1 retention state can remain auditable.
- Do not copy whole public repositories or third-party assets by default. Store repository coordinates, commit hashes, paths, API metadata, and bounded relevant files where policy permits.
- The USD 50 budget service must account for R2 storage and operations even when current usage remains in free allowances.

Authoritative sources:

- R2 limits: https://developers.cloudflare.com/r2/platform/limits/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/

### TD-006: New GitHub collector uses current versioned API and bounded traversal

- GitHub REST documentation reports `2026-03-10` as the latest API version on the research date. The new external adapter should send an explicit version header, recorded in source-adapter provenance.
- Existing interactive project import stays pinned to `2022-11-28` until a separate compatibility-tested change is approved.
- Use authenticated requests, serialized or bounded concurrency, conditional `ETag` and `Last-Modified` requests, pagination links, and documented rate-limit headers.
- GitHub states that correctly authorized conditional requests returning `304 Not Modified` do not count against the primary rate limit.
- Prefer repository metadata, contents, tree, release, license, issue, pull-request, and discussion endpoints as needed. Do not download repository archives by default.
- Recursive tree responses can truncate on large repositories. The adapter must detect truncation and traverse selected subtrees or relevant paths rather than treating a truncated tree as complete.
- Large file behavior and endpoint limits must produce explicit unsupported or metadata-only records rather than implicit omissions.

Authoritative sources:

- API versioning: https://docs.github.com/en/rest/about-the-rest-api/api-versions
- Rate limits: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- REST best practices: https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
- Repository contents: https://docs.github.com/en/rest/repos/contents
- Git trees: https://docs.github.com/en/rest/git/trees

### TD-007: Robots, terms, reuse, and authorization are separate policy dimensions

- RFC 9309 standardizes robots.txt parsing, matching, errors, and caching. It explicitly states that robots rules are not access authorization.
- Each source registry entry therefore records robots state, terms state, authentication or license authority, copyright or reuse state, and internal approval independently.
- A robots allow does not imply permission to reproduce content. A robots disallow or internal policy denial blocks automated acquisition.
- Policy checks run before each scheduled acquisition and are revisioned when robots, terms, credentials, or internal approval change.
- Unavailable or ambiguous policy fails closed for new content. Previously collected evidence follows its recorded retention and takedown policy.

Authoritative source:

- RFC 9309: https://www.rfc-editor.org/rfc/rfc9309

### TD-008: Conditional acquisition and retry behavior follow HTTP semantics

- Store `ETag`, `Last-Modified`, final URL, redirect chain, status, content type, content length, and retrieval timestamp for each check.
- Send `If-None-Match` and `If-Modified-Since` where supported. A `304` records a successful check without creating a duplicate snapshot.
- Honor `Retry-After`; a `429` may carry it. Also honor source-specific reset and poll headers.
- Back off exponentially with jitter, cap attempts, and open a source circuit breaker. Do not continue requests while rate limited.
- Revalidate every redirect target against scheme, host, port, DNS/IP policy, credentials policy, and robots/terms scope.

Authoritative sources:

- HTTP semantics, validators, conditional requests, redirects, and Retry-After: https://www.rfc-editor.org/rfc/rfc9110.html
- HTTP 429: https://www.rfc-editor.org/rfc/rfc6585
- GitHub REST best practices: https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api

### TD-009: Acquisition and file parsing use defense in depth

- Prefer per-source host allowlists. Permit only `https` unless an explicit source exception is approved.
- Resolve and reject loopback, link-local, private, multicast, metadata-service, and otherwise non-public targets. Repeat validation after DNS resolution and every redirect to mitigate SSRF and rebinding.
- Enforce response-header and streamed-byte caps before parsing. Abort decompression on member count, nesting depth, expansion ratio, or total extracted byte limits.
- Allowlist extensions and parsers, validate signatures and content rather than trusting `Content-Type`, generate internal filenames, store outside public roots, and never execute downloaded files.
- Disable XML external entities and unsafe YAML constructors. Treat HTML, Markdown, CSV formulas, archives, meshes, PDFs, and model prompts as hostile inputs.
- Unsupported native CAD and executable formats remain metadata-only until an approved sandbox is available.

Authoritative sources:

- OWASP SSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

### TD-010: Budget and observability are correctness controls

Track at least:

- Source checks attempted, succeeded, unchanged, denied, deferred, failed, and withdrawn.
- Requests, bytes, snapshots, R2 operations, D1 rows read and written, Queue operations, runner minutes, proxy spend, model tokens and spend, and estimated month-end total.
- Freshness target, last success, next due, debt age, backoff, circuit state, and policy revision.
- Accepted, rejected, conflicted, unresolved, AI-inferred, and automatically promoted claims.
- Review latency, retry count, dead-letter count, parser failures, and schema-version distribution.

The scheduler stops paid work before projected month-end spend exceeds USD 50. No overage is authorized by this plan.

## Alternatives rejected for the pilot

- **Cloudflare-only broad crawler:** rejected because Workers Free and current production configuration do not support the heavy/native/headless parser set, and broad acquisition would compete with application request limits.
- **Managed scraping vendor as the primary runtime:** rejected for the pilot because cost, policy behavior, retention, and vendor-specific extraction would complicate the USD 50 cap. A later adapter may use one only after per-source approval and cost proof.
- **Whole-repository cloning and R2 mirroring:** rejected because it increases copyright, retention, storage, malware, and freshness burden without being required for bounded engineering extraction.
- **Synchronous heavy processing inside `POST /api/v1/imports/batches`:** rejected because the existing request path is bounded and D1/Worker limits favor pointer-based asynchronous internal processing.

## Unverified and execution-time checks

- The repository currently has no verified Git remote, visibility, Actions billing plan, or included-minute quota.
- Live Cloudflare account plan, deployed Queue/DLQ resources, current D1/R2 usage, account budgets, and remote secrets were not queried.
- Target-specific robots, terms, APIs, licenses, and rate limits remain per-source adapter preflight work.
- Exact parser packages and container image digests must be selected and source-verified during implementation planning units, then locked with checksums or lockfiles.
- The exposed provider credential still requires rotation before AI-assisted extraction can run.
- Jcode execution remains gated by the 0.54.16-dev versus APS 0.55.0 compatibility result.

No live target was scraped, no credentials were used, and no deployment or application code was changed during this research.
