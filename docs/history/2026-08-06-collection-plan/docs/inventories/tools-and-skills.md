# Tools, skills, roles, and command patterns

This inventory maps the capabilities needed for RoboPartPicker data collection. It is a capability and routing guide, not an approval to install tools, scrape sources, spend money, or promote canonical catalog records.

## Operating boundary

RoboPartPicker's trusted application boundary is the same-origin Cloudflare Worker described in `/home/lenovo/robopartpicker/docs/backend-architecture.md`:

- The Application Worker owns authentication, authorization, canonical D1 repositories, application R2 file authorization, MCP endpoints, AI provider calls, review gates, and canonical promotion.
- A separate Cloudflare collection Worker owns schedules, Queue consumption, deterministic adapters, collection-operations D1 state, and private raw-evidence R2. It submits bounded batches through the Application Worker ingestion service and never writes canonical tables directly.
- The import path is raw evidence -> normalized batch -> validated staging row -> deterministic candidates/conflicts -> review or policy-approved promotion -> canonical rows -> audit event.
- Imported text, scraped content, repositories, documents, files, and AI outputs are untrusted data. They are never instructions to agents or application tools.
- Browser-to-database paths, broad CORS, runtime migrations, direct R2 object-key exposure, unrestricted SQL tools, and production data access from local development remain out of bounds.

Use this document with:

- [`README.md`](README.md) for authority order and shared record fields.
- [`workflow-checklists.md`](workflow-checklists.md) for gates from discovery through retirement.
- [`coverage-matrices.md`](coverage-matrices.md) for source, object, method, tool, and evidence coverage.
- [`prioritization-and-status.md`](prioritization-and-status.md) for lifecycle and ranking.
- [`risks-and-stop-conditions.md`](risks-and-stop-conditions.md) for hard stops.

## Installed Jcode skills relevant to this work

| Skill | Best use | Selection rule | Boundary |
|---|---|---|---|
| `/agent-reach` | Internet research across search, social, dev, web, video, RSS, and platform-specific sources. | Use when discovering or verifying public sources, URLs, domains, repositories, discussions, or platform evidence. | Research only. Does not authorize scraping, posting, or bypassing platform controls. |
| `/technical-research` | Turn open technical decisions into sourced questions and decisions. | Use before choosing unfamiliar parsers, storage patterns, source APIs, or ingestion architecture. | Produces planning evidence, not implementation approval. |
| `/source-driven-development` | Verify version-sensitive SDK, platform, framework, or API behavior against primary docs. | Use before adopting external libraries, Cloudflare APIs, GitHub APIs, package registries, parser versions, or auth flows. | Must cite authoritative docs. Do not rely only on model memory. |
| `/cloudflare` | Cloudflare Workers, Cron Triggers, Queues, D1, R2, Browser Run, Containers, storage, networking, and IaC. | Use for the collection Worker, Application Worker ingestion boundary, bindings, scheduling, storage, and deployment architecture. | The collection Worker remains isolated from canonical writes. The Application Worker remains the canonical trust boundary. |
| `/workers-best-practices` | Production Worker implementation and review. | Use for API handlers, repository methods, middleware, streaming, observability, secrets, and binding usage. | No runtime migrations, no floating promises for critical writes, no direct secrets in logs. |
| `/wrangler` | Wrangler commands, local D1/R2 setup, migrations, deployments, and secrets. | Load before running Wrangler commands or documenting exact syntax. | No production secrets or remote production data without explicit approval. |
| `/durable-objects` | Stateful coordination, WebSockets, alarms, or SQLite-backed Durable Objects. | Consider only if measured source-lock or browser-session coordination cannot be handled by D1 leases, Queues, or Browser Run session patterns. | Not part of the initial collection runtime. |
| `/agents-sdk` | Cloudflare Agents, workflows, scheduled tasks, MCP, and durable execution. | Consider for a future incident-triage or repair assistant after deterministic monitoring exists. | No AI agent is required for routine collection. An agent cannot self-deploy, resume a paused source, or write canonical data. |
| `/sandbox-sdk` | Sandboxed code execution and untrusted processing environments. | Use when evaluating safe execution of third-party converters, archive handling, or untrusted code-like artifacts. | Fail closed for executable/native formats unless sandbox and policy are approved. |
| `/graph-coder`, `/graph-coder-lite` | Decompose implementation into cost-routed agent graphs. | Use for multi-file implementation after requirements are approved. | Planning and implementation coordination only. Does not bypass source approval. |
| `/ce-plan`, `/gcl-plan`, `/delegation-graph`, `/plan-forge`, `/plan-rehearsal`, `/routing-plan` | Structured plans, execution packets, rehearsals, and model routing. | Use when turning list items into implementation-ready units. | Preserve existing authority order and list stable IDs. |
| `/execution-manager`, `/gcl-review`, `/verification-before-completion`, `/systematic-debugging` | Review, debugging, and completion gates. | Use during implementation, incident response, or validation of generated adapters. | Completion claims need fresh evidence after final material change. |
| `/effective-eta` | ETA and progress reporting. | Use for long-running collection or implementation efforts. | Estimates do not change budgets or approvals. |
| `/cloudflare-email-service`, `/turnstile-spin`, `/cloudflare-one`, `/cloudflare-one-migrations`, `/web-perf` | Adjacent platform concerns. | Use only if a selected unit touches email, CAPTCHA, Zero Trust, migration, or web performance. | Not part of routine source acquisition. |
| `/ce-brainstorm`, `/concept-grill`, `/idea-grill` | Product framing and subjective decision resolution. | Use when the list system needs unresolved product decisions, not for already-specified doc edits. | Requirements only. |

## Proposed custom skills

These are candidates for future local skills. They should be created only after the repeated workflow is proven useful.

| Proposed skill | Purpose | Inputs | Outputs | Guardrails |
|---|---|---|---|---|
| `/rpp-source-onboarding` | Guide one source from discovery through candidate or constrained disposition. | Source locator, legacy labels, desired objects, owner. | Source profile, policy checklist, lifecycle recommendation, unresolved questions. | No automated collection approval. Stops on unclear terms, robots conflicts, paywall, auth bypass, or CAPTCHA. |
| `/rpp-parser-contract` | Produce parser and fixture contracts for an approved source scope. | Source profile, sample fixtures, object-field map, limits. | Extraction schema, evidence locators, golden fixtures, drift probes, rejection rules. | Keeps raw values and claims separate. No silent defaults or canonical writes. |
| `/rpp-entity-resolution-review` | Review proposed identity matches, aliases, revisions, and conflicts. | Candidate records, evidence spans, normalized keys, conflict set. | Merge/split/defer recommendation with confidence and audit notes. | Does not invent identities. Uncertain matches stay as conflicts. |
| `/rpp-ingestion-runbook` | Generate noninteractive runbooks for pilot and active collection. | Approved source status, budgets, adapter, parser, fixtures, owners. | Commands, dry-run plan, monitoring checklist, stop conditions, rollback/withdrawal steps. | Requires explicit budgets, kill switch, and reviewer. |
| `/rpp-list-maintainer` | Maintain list records and cross-list matrices. | Updated source/object/tool records. | Stable IDs, aliases, changelog, coverage deltas, stale items, migration notes. | Does not delete history. Uses supersession and retired states. |

## Agent roles

| Role | Primary responsibility | Typical skills/tools | Handoff artifact |
|---|---|---|---|
| Data strategist | Expand and classify source, object, field, and relationship universe. | `/technical-research`, `/ce-plan`, Markdown/YAML registry checks. | Proposed records with evidence class, coverage tags, and schema gaps. |
| Source researcher | Resolve identity, authority, access, policy, license, and reuse status. | `/agent-reach`, robots/terms review commands, URL evidence capture. | Source profile with disposition, verification date, and open questions. |
| Collection engineer | Design adapters, parsers, normalization, staging submission, limits, and tests. | Cloudflare Workers, Queues, D1, R2, Browser Run, Worker-compatible parsers, fixtures, `/source-driven-development`. | Adapter/parser contract, Cloudflare dry-run output, fixtures, operational limits. |
| Entity-resolution reviewer | Decide duplicates, aliases, manufacturer identity, part numbers, revisions, and conflicts. | Deterministic fingerprints, fuzzy candidates, evidence comparison. | Match decisions, conflict states, aliases, supersession links. |
| Review operator | Approve, deny, pause, resume, retire, or promote staged candidates. | Worker review UI/API, status lists, audit logs. | Recorded lifecycle transition and reviewer decision. |
| Worker/API engineer | Maintain D1/R2 models, validation, staging, promotion, auth, MCP, and API contracts. | `/cloudflare`, `/workers-best-practices`, `/wrangler`. | Migration, repository/API code, validation tests, deployment notes. |
| QA and observability owner | Verify fixtures, drift, budgets, run metrics, incidents, and dashboards. | Test runners, log summaries, budget ledgers, canaries. | Validation report, alert thresholds, incident or stale records. |
| Security and policy owner | Enforce trust boundary, secrets, UGC limits, license constraints, and stop conditions. | Secret scanners, allowlists, sandbox policy, review checklist. | Risk decision, exception record, containment actions. |
| Agent coordinator | Route planning, implementation, review, and debugging across agents. | Graph-coder family, execution/review skills, todo tracking. | Bounded task graph, reviewed artifacts, completion evidence. |

## Tool inventory by workload

### Acquisition

| Workload | Preferred tools | Use when | Notes |
|---|---|---|---|
| Public APIs and feeds | Collection Worker `fetch`, Worker-compatible feed parsers, and source-specific SDKs after documentation review. | API/feed is documented, bounded, and policy-approved. | Respect quotas, ETags, cursors, backoff, and attribution. |
| Static HTML | Collection Worker `fetch`, HTMLRewriter, embedded JSON or JSON-LD extraction, and Worker-compatible HTML parsers. | Content is available without browser-only execution and policy permits retrieval. | Prefer stable structured data such as JSON-LD, tables, and canonical links. |
| Rendered pages | Cloudflare Browser Run Quick Actions or Playwright sessions. | Only when approved and static methods cannot obtain the reviewed fields. | Do not bypass CAPTCHA, login, paywalls, rate controls, or anti-bot systems. |
| Repositories | GitHub/GitLab APIs, release assets, bounded tree listing, and referenced file downloads from the Collection Worker. | Repository analysis is approved by reference and bounded. | Mirror zero public files by default unless file retention is explicitly approved. |
| Files and documents | Controlled Worker downloads, streaming hashes, MIME sniffing, size ceilings, and Cloudflare Containers only for justified full-runtime parsing. | File acquisition is approved and content type is supported. | Store permitted raw evidence or immutable snapshot references with retrieval metadata. |
| Manual export | Human-reviewed CSV/JSON/XLSX/PDF export. | Source is manual-only, authenticated, paid, restricted, or high-risk. | Preserve export metadata and reviewer identity. |

### Parsing and file handling

| Data type | Candidate tools | Guardrails |
|---|---|---|
| HTML/Markdown/text | Worker-compatible deterministic parsers, HTMLRewriter, and regular expressions only for local patterns. | Preserve evidence locators, source labels, and extraction method. |
| CSV/TSV | Worker-compatible streaming or bounded parsers. | Explicit encoding, headers, units, and row-level errors. |
| XLSX | A reviewed Worker-compatible parser or Cloudflare Container when a full runtime is justified. | No macros. Record workbook, sheet, and cell locators. |
| JSON/YAML/XML | Worker-compatible schema and format parsers. | Schema/version validation and explicit unknown-field handling. |
| PDF | Metadata or bounded text extraction through an approved Cloudflare-hosted parser. Use Containers only when necessary. | Prefer metadata or link-only if copyright/reuse is unclear. Avoid OCR unless approved. |
| URDF/Xacro/SDF/SRDF/MJCF | Safe Worker-compatible XML parsing, with sandboxed Cloudflare Container tooling only when needed. | Safe text parsing only. No executable processing. |
| CAD/mesh/native binaries | Metadata extraction only unless a sandboxed Cloudflare Container converter is approved. | Fail closed for native or executable formats. Record checksum and declared format. |
| Archives | Worker-compatible bounded archive inspection or a sandboxed Cloudflare Container with strict limits. | Enforce compressed size, expanded size, file count, path traversal, symlink, and recursion limits. |

### Normalization and entity resolution

| Need | Tools/patterns | Required behavior |
|---|---|---|
| Units and quantities | `pint`, explicit conversion tables, decimal arithmetic. | Keep raw value, normalized value, unit, precision, and conversion method. |
| Currency and price context | ISO currency tables, exchange-rate source references when conversion is approved. | Preserve original currency, tax/shipping context, quantity breaks, and observation time. |
| Manufacturer and part identity | Deterministic normalized keys, domain authority, manufacturer part number, revision, GTIN/UPC where available. | Never merge on fuzzy name alone. Record aliases and competing hypotheses. |
| Compatibility | Interface dimensions, electrical/software versions, official matrices, successful build evidence. | Separate official compatibility, inferred fit, and user-reported success. |
| Deduplication | Content hashes, source-scoped idempotency keys, canonical URL normalization, near-duplicate candidates. | Produce candidates and conflicts, not silent canonical overwrites. |
| Revision tracking | Append-only observations and revision-aware subject IDs. | Mutable facts such as price, stock, firmware, releases, and availability are never overwritten silently. |

### Storage and promotion

| Layer | Tool or platform | Boundary |
|---|---|---|
| Collection operations | Dedicated Cloudflare D1 database. | Source registry, schedules, runs, health, incidents, leases, checkpoints, and budgets only. |
| Raw evidence | Private Cloudflare R2 bucket or prefix owned by the Collection Worker. | Untrusted. Must include source, retrieval time, hash, MIME, byte size, adapter version, and retention state. |
| Staging submission | Versioned ingestion contract over a Cloudflare service boundary to the Application Worker. | Bounded batch validation, idempotency, per-record errors, and backward compatibility. |
| Canonical relational data | Canonical Cloudflare D1 through Application Worker repositories. | Application Worker-only writes through typed repositories and `DB.batch()` for ordered invariants. |
| Application evidence bytes | Application Cloudflare R2 through Application Worker-mediated file records. | D1 stores identity/authorization metadata. R2 keys are server-generated and never exposed as authority. |
| Audit and review | D1 audit events, proposals, lifecycle records. | Promotion requires review or explicit policy-approved automation. |

### Orchestration, QA, observability, and security

| Area | Candidate tools | Minimum requirement |
|---|---|---|
| Orchestration | Cloudflare Cron Triggers, one Collection Queue, one dead-letter queue, Operations D1 leases, and Workflows only after measured need. | Noninteractive, resumable, cancellable, idempotent, source-scoped budgets. |
| Testing | Vitest or the repository test runner, snapshot fixtures, golden parser outputs, schema validators, replay tests, and local Wrangler simulation. | Normal, missing, malformed, drift, duplicate, policy-stop, and withdrawal cases. |
| Markdown/list validation | `markdownlint-cli2`, `prettier --check`, link checkers. | Documentation changes should validate before completion where tooling exists. |
| Metrics | Structured JSON logs, request counters, parse yield, stale counts, duplicate ratio, budget ledgers. | Include source ID, run ID, extractor/parser version, and request ID where applicable. |
| Alerting | Threshold checks, stale reports, budget warnings, drift canaries. | Alert before exhausting budget or corrupting staging. |
| Secrets | Wrangler secrets and narrow Cloudflare service bindings. | Never store tokens in fixtures, plans, logs, URLs, screenshots, or raw evidence. |
| Sandboxing | Cloudflare Container or Sandbox SDK for justified risky file conversion. | No network by default, size/time limits, read-only inputs, disposable environment. |
| Policy enforcement | Allowlists, robots/terms records, disposition fields, hard stops. | Denied/manual-only/link-only sources remain visible but nonexecutable. |

## Selection rules

1. Choose the least powerful reliable acquisition method: documented API/feed, repository or versioned file, static HTTP, rendered browser, then manual review.
2. Prefer official, versioned, structured, primary evidence over copied, community, inferred, or volatile evidence.
3. Keep acquisition outside the Application Worker. Use a separate Cloudflare Collection Worker, then use the Application Worker for validation, staging, authorization, review, canonical promotion, files, and audit.
4. Treat every source as disabled until lifecycle, policy state, owner, cadence, budget, and stop conditions are recorded.
5. Use deterministic normalization before fuzzy matching. Fuzzy matches create review candidates only.
6. Preserve raw evidence or immutable snapshot references before parsing.
7. Parse into claims with evidence locators. Do not collapse raw, normalized, measured, calculated, estimated, user-reported, official, or AI-inferred values.
8. Promote only through the staging and review pipeline. Never let collector code write canonical D1 rows.
9. Add a fixture and replay test before an adapter can leave pilot.
10. Prefer reusable Cloudflare adapter interfaces over source-specific one-off scripts, but allow one-off research probes that cannot submit to staging.

## Conditional and avoid list

| Condition | Allowed response | Avoid |
|---|---|---|
| Terms, robots, or license unclear | Research, metadata-only, link-only, or manual review. | Automated scraping or file mirroring. |
| Authentication, payment, CAPTCHA, or anti-bot challenge required | Stop and set manual-only, link-only, denied, or approval-needed. | Bypassing controls or simulating a user to evade restrictions. |
| Source has user-generated content or personal data risk | Minimize fields, preserve context, require review. | Collecting profiles, contact data, faces, or free-text claims without policy approval. |
| Parser cannot preserve provenance or locators | Reject batch and fix parser. | Promoting extracted facts. |
| Entity identity is ambiguous | Create conflict candidates and aliases. | Merging products, revisions, brands, or projects by name similarity alone. |
| Budget, rate, volume, or error thresholds exceeded | Circuit break, pause source, record incident. | Background retries that continue to amplify cost or load. |
| Native CAD, binaries, archives, executable formats, or macros | Metadata-only or sandboxed approved extraction. | Executing converters or macros in the collector host. |
| AI extraction is considered | Use for bounded assistance with evidence spans and review. | Treating AI output as authoritative or allowing imported text to instruct tools. |
| Browser automation is considered | Use only after approval and static/API routes fail. | Broad crawling, session abuse, hidden login flows, or CAPTCHA workarounds. |
| Production Worker data is needed locally | Use Wrangler local simulation or approved read-only export. | Remote production bindings by default. |

## Reusable noninteractive command patterns

These patterns are intentionally generic. Exact scripts are defined during implementation. All recurring production work runs on Cloudflare, while local commands exercise fixtures and local Wrangler simulation only.

```bash
# Validate source registry, policy records, and priorities.
rtk npm run collection:validate-registry

# Replay an adapter entirely from committed fixtures.
rtk npm run collection:test-adapter -- --source-id <source-id>

# Simulate collection Cron and Queue handlers locally.
rtk wrangler dev --local
rtk curl "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"

# Validate the ingestion contract and all collection tests.
rtk npm run contracts:validate
rtk npm run test:collection

# Verify Cloudflare configuration without deploying.
rtk npx wrangler deploy --dry-run
```

Production pause, resume, replay, and incident operations must use authenticated administrator tooling or a narrow internal operation. They must not be generic laptop scripts with production credentials.

## Adoption checklist for any new tool

- [ ] The workload cannot be satisfied by an already-approved simpler tool.
- [ ] License, maintenance status, security posture, and supply-chain risk are reviewed.
- [ ] The tool runs noninteractively and supports bounded time, memory, input size, and network behavior.
- [ ] Output is deterministic enough for fixtures or exposes uncertainty explicitly.
- [ ] It can preserve source locators, evidence spans, hashes, and parser versions.
- [ ] It does not require production credentials in local development.
- [ ] It has a rollback path and does not change canonical records directly.
- [ ] It has at least one fixture, one malformed-input test, and one drift or failure test before pilot use.
