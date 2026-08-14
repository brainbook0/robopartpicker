# Risks, safeguards, and stop conditions

The goal is not maximum crawling. The goal is trustworthy, reviewable evidence collected within explicit source, cost, privacy, and operational boundaries.

## Hard stop conditions

Stop the affected source immediately when any of the following occurs:

- current policy or reviewer disposition is denied, expired, missing for required scope, or materially changed
- collection would require bypassing authentication, access controls, a CAPTCHA, a paywall, geographic controls, or deliberate anti-automation measures
- robots directives or documented API restrictions conflict with the approved request paths or method
- an unapproved domain, path, locale, account, field set, request method, or data class enters the run
- secrets, session tokens, personal data, or restricted content appear in logs or artifacts outside the approved boundary
- the global or source-specific budget, request, bandwidth, storage, or paid-API ceiling is reached
- the source returns blocking signals such as repeated 401, 403, 407, 429, CAPTCHA, abuse notice, or cease request beyond the approved retry policy
- error rate, retry amplification, duplicate explosion, parse failure, schema drift, or queue growth crosses its circuit-breaker threshold
- raw evidence, source locator, retrieval time, extractor version, or content hash cannot be preserved
- cancellation, idempotency, replay, or withdrawal behavior is broken
- parser output could silently corrupt identity, revision, units, currency, compatibility, price, availability, or provenance
- canonical promotion occurs without the required review gate
- a human reviewer or operator invokes the kill switch

## Risk register

| Risk | Leading signals | Preventive safeguards | Detection evidence | Response |
|---|---|---|---|---|
| Policy mismatch | terms or robots change, unclear license, expired review | policy preflight, scoped approval, stale threshold | timestamped policy evidence and diff | stop, re-review, constrain or deny |
| Access escalation | new login, CAPTCHA, token, browser challenge | least-powerful method, no bypass rule | response classification and domain/path audit | stop and set manual-only or denied |
| Source overload | 429s, rising latency, timeouts | conservative concurrency, caching, incremental fetch | request, latency, retry, and status metrics | back off, pause, reduce cadence |
| Cost runaway | page count or paid calls exceed estimate | hard per-run and per-source budgets | real-time cost and usage ledger | cancel run and require reapproval |
| Crawl explosion | unbounded pagination, calendars, facets, duplicate URLs | allowlisted URL patterns and page ceilings | unique URL and depth counters | circuit break and quarantine frontier |
| Schema drift | field disappearance, selector failures, new templates | versioned fixtures and drift probes | parse yield and structural signature change | pause promotion, refresh fixtures and parser |
| Silent data corruption | plausible but wrong units, currency, SKU, or revision | raw retention, typed normalization, golden tests | sample audit and invariant failures | quarantine affected outputs and replay after fix |
| Entity conflation | similarly named products or revisions merged | evidence-based stable keys and conflict states | merge confidence and reviewer disagreement | split identity and reprocess dependents |
| Evidence laundering | community or inferred value labeled official | explicit epistemic classes and source authority | provenance audit | correct class, withdraw affected claims |
| Stale facts | old prices, availability, software versions, or documentation | observation timestamps and stale thresholds | freshness dashboards | mark stale and refresh or suppress |
| Duplicate amplification | aliases, mirrors, regional pages, repeated offers | canonical source and item IDs, content hashes | duplicate ratio and key collisions | deduplicate and fix identity rules |
| Missing provenance | records lack exact locator or extractor version | required provenance envelope | ingestion validation failures | reject batch, do not promote |
| Irreversible withdrawal | downstream records cannot be traced to source | lineage from raw to derived to canonical | withdrawal rehearsal | stop source until deletion propagation passes |
| Unsafe files | malicious archives, CAD, PDFs, binaries, macros | type validation, sandboxing, size and expansion limits | scanner and sandbox reports | quarantine file and block processing |
| Secret leakage | tokens in URLs, fixtures, logs, screenshots | secret bindings, redaction, fixture review | secret scanning | revoke token, contain artifact, investigate |
| Personal-data overcollection | profiles, emails, usernames, location, faces | field minimization and UGC policy | field audit and samples | stop, delete or redact, review scope |
| Defamation or unsafe claims | unverified failure reports attached as fact | claim separation and moderation | review queue flags | constrain display, preserve source context |
| Licensing conflict | copied manuals, images, CAD, or datasets lack reuse rights | license capture, link-only disposition | license completeness audit | withdraw copies, retain permitted metadata or links |
| Copyright overcapture | whole pages retained when facts suffice | minimal raw retention policy and access controls | storage sampling | narrow capture and purge disallowed material |
| Regional mismatch | different prices, models, certifications, or terms merged | locale and market dimensions | cross-region inconsistency checks | separate observations by market |
| Currency or tax error | tax-inclusive and exclusive prices mixed | raw price text and price-context fields | reconciliation tests | quarantine price facts and correct parser |
| Availability ambiguity | preorder, backorder, discontinued, lead time treated alike | explicit availability states | offer sample review | correct states and downstream ranking |
| Compatibility hallucination | inferred fit presented as verified | relationship evidence and confidence gates | compatibility conflict review | mark unverified, remove unsafe recommendation |
| AI extraction error | model invents fields or citations | evidence-grounded extraction and abstention | locator validation and deterministic checks | reject unsupported outputs and retrain prompt |
| Prompt injection in sources | page content manipulates agent or parser | treat source as untrusted data, tool isolation | anomalous instructions and tool attempts | quarantine and process with deterministic parser |
| Queue poisoning | malformed or huge records consume workers | schema, size, type, and rate validation | rejection and resource metrics | isolate source and enforce limits |
| Replay storm | retries duplicate writes or costs | idempotency keys and checkpoints | repeated run and record IDs | stop queue, deduplicate, fix retry logic |
| Partial-run inconsistency | pages fetched but manifest or batch incomplete | transactional manifests and completion markers | missing sequence and checksum checks | mark incomplete and resume or discard safely |
| Monitoring blind spot | no metrics or alerts for active adapter | observability gate before pilot | heartbeat and synthetic checks | pause adapter until visibility restored |
| Owner abandonment | stale review, alerts unowned, broken adapter | explicit owner and refresh cadence | overdue ownership checks | pause or retire source |
| Vendor or API shutdown | deprecation notice, endpoint failures | fallback inventory and version monitoring | health and documentation checks | migrate, manual-only, or retire |
| Repository history rewrite | tags or commits disappear or move | commit hashes and archived approved artifacts | reference validation | pin replacement evidence and record supersession |
| Marketplace manipulation | fake reviews, counterfeit listings, bait prices | source authority and trust signals | outlier and seller-quality checks | lower confidence or exclude seller/listing |
| Community brigading | coordinated votes or claims distort evidence | preserve timestamps and independent corroboration | anomaly and cross-source comparison | flag, reduce weight, require review |
| Research retraction | paper corrected or withdrawn | DOI/version/retraction tracking | metadata refresh | supersede claims and notify dependents |
| Operational scope creep | pilot silently expands cadence or fields | immutable approved scope and config diff | run-to-approval comparison | stop and require new approval |

## Safeguard layers

### Governance

- explicit source lifecycle and collection disposition
- time-bounded approvals with exact paths, fields, frequency, volume, and budget
- independent review for policy, promotion, and incidents
- visible denial, manual-only, and link-only states
- complete change and decision history

### Acquisition

- APIs, feeds, exports, and repositories preferred over page scraping
- URL and domain allowlists
- minimum concurrency and respectful cadence
- incremental fetch, cache validators, and content hashes
- bounded retries, pagination, depth, bytes, duration, and spend
- immediate cancellation and per-source kill switch

### Data integrity

- raw evidence before normalization
- immutable locator, retrieval time, extractor version, and hash
- separate identity, revision, claim, measurement, and derivation
- typed units, currencies, markets, and temporal fields
- explicit missing, conflicting, unsupported, and uncertain states
- human review before uncertain canonical mutation

### Security and privacy

- secrets only in managed bindings or secret stores
- untrusted source content never treated as agent instruction
- sandboxed processing for files and risky parsers
- file size, archive expansion, content-type, and execution limits
- personal-data minimization and access controls
- log redaction and retention controls

### Operations

- per-source and global budgets
- run manifests and idempotency keys
- structured metrics, logs, traces, and alerts
- fixture-based drift detection
- incident, replay, rollback, withdrawal, and retirement runbooks
- named owner and maintenance cadence

## Minimum monitoring dimensions

- requests, responses, status classes, redirects, retries, and cache hits
- unique URLs, pages, bytes, duration, concurrency, and rate
- records discovered, parsed, rejected, duplicated, conflicted, reviewed, and promoted
- field completeness and parse yield by template and extractor version
- provenance completeness and raw evidence availability
- price, currency, unit, revision, and compatibility anomaly counts
- queue depth, oldest item age, worker failures, and replay counts
- dead-letter arrivals, source lease age, consecutive failures, health state, and incident signature
- canary result, DOM or schema fingerprint change, required-field yield, and deviation from the last-known-good baseline
- paid calls, compute, storage, egress, and total cost
- policy review age, fixture age, adapter version, and owner freshness
- incidents, pauses, withdrawals, and unresolved defects

## Resumption evidence after a stop

A source may resume only when:

- the triggering condition is understood and bounded
- affected records and downstream views are identified
- corrective action has a regression fixture or test
- policy and technical approvals are current for the resumed scope
- withdrawal or correction has completed where required
- monitoring can detect recurrence
- a Cloudflare canary or shadow run succeeds with canonical promotion disabled
- any AI-assisted repair has passed human review and cannot self-deploy or resume the source
- the reviewer records an explicit resume decision
