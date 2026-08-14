# Workflow checklists

These checklists operationalize the RoboPartPicker planning gates. Completing a checklist produces evidence for a decision. It does not replace the approval recorded by the responsible reviewer.

## 1. Source discovery

- [ ] Search canonical name, aliases, domains, organization names, and repository names in existing inventories.
- [ ] Confirm that the candidate is a source, not merely a copied storefront, affiliate page, aggregator, or stale mirror.
- [ ] Record the exact discovery locator and discovery date.
- [ ] Assign one stable provisional source ID.
- [ ] Classify source family and subtype.
- [ ] Tag likely objects, fields, languages, regions, and evidence classes.
- [ ] Record why the source may add unique value.
- [ ] Set lifecycle to `discovered` or `researching`.
- [ ] Record unknowns instead of guessing them.

**Exit evidence:** identity candidate, discovery evidence, initial coverage tags, open questions, owner.

## 2. Identity and authority verification

- [ ] Resolve canonical domain, publisher, operator, and parent organization.
- [ ] Record redirects, aliases, mirrors, acquired brands, regional domains, and legacy names.
- [ ] Distinguish official publisher material from distributor, reseller, community, or archive copies.
- [ ] Verify contact, about, organization, repository ownership, or documentation links where available.
- [ ] Identify version, model, SKU, revision, locale, and date boundaries.
- [ ] Record confidence and competing identity hypotheses.
- [ ] Link duplicates instead of deleting historical aliases.

**Exit evidence:** normalized identity, authority class, aliases, confidence, unresolved conflicts.

## 3. Access and policy preflight

- [ ] Enumerate available interfaces: documented API, feed, sitemap, static pages, rendered pages, downloadable files, repository, export, or manual review.
- [ ] Check current robots directives for relevant paths and user agents.
- [ ] Locate and record current terms, API terms, licenses, data reuse notices, and attribution requirements.
- [ ] Record authentication, account, subscription, geographic, age, or payment requirements.
- [ ] Identify personal data, user-generated content, safety, export-control, or sensitive-content concerns.
- [ ] Confirm that the planned fields and collection frequency fit the reviewed conditions.
- [ ] Prefer official APIs, feeds, exports, and repositories over browser extraction.
- [ ] Set policy state to clear, review-needed, restricted, or denied.
- [ ] Set collection disposition to automated candidate, manual-only, link-only, or denied.
- [ ] Record reviewer, evidence URLs, timestamps, and recheck date.

**Immediate stop:** bypassing authentication, access controls, CAPTCHAs, paywalls, explicit prohibitions, or reviewer constraints would be required.

## 4. Source characterization

- [ ] Measure approximate item count, page count, file count, and expected change rate.
- [ ] Identify pagination, filters, locale variants, canonical links, and stable identifiers.
- [ ] Sample representative pages, edge cases, empty states, discontinued items, and errors.
- [ ] Record content types, encodings, units, schemas, structured markup, and embedded data.
- [ ] Identify required render behavior, JavaScript, cookies, sessions, or browser-only interactions.
- [ ] Identify rate-limit headers, documented quotas, retry guidance, and cache validators.
- [ ] Estimate bandwidth, request count, storage, execution time, and paid-service cost.
- [ ] Identify likely drift points and source-specific fragility.

**Exit evidence:** source profile, samples, cost estimate, access method recommendation, known edge cases.

## 5. Acquisition design

- [ ] Choose the least powerful reliable method: API, feed, repository/file, HTTP HTML, then browser automation.
- [ ] Define allowed URL patterns, denied paths, request method, headers, concurrency, delay, timeout, and retry budget.
- [ ] Define incremental strategy using timestamps, ETags, checksums, cursors, or stable IDs.
- [ ] Define idempotency, deduplication, checkpoint, resume, and partial-failure behavior.
- [ ] Define raw evidence retention and content hashing before parsing.
- [ ] Define provenance envelope fields and extractor versioning.
- [ ] Define circuit breakers for error rate, block response, cost, volume, latency, and schema drift.
- [ ] Define secrets boundaries without placing credentials in fixtures, logs, or plans.
- [ ] Define withdrawal and deletion propagation behavior.

**Exit evidence:** bounded adapter contract, request budget, raw-capture plan, stop conditions, withdrawal plan.

## 6. Extraction and normalization design

- [ ] Map extracted fields to collection-universe concepts and accepted ingestion records.
- [ ] Keep raw values, labels, units, surrounding text, and locators.
- [ ] Specify unit parsing, conversion, precision, rounding, and invalid-value handling.
- [ ] Separate entity identity, revision, observation, claim, measurement, and derived metric.
- [ ] Preserve official, user-reported, measured, calculated, estimated, and AI-inferred values separately.
- [ ] Define stable keys and entity-resolution evidence.
- [ ] Define conflict, ambiguity, missing, not-applicable, withheld, and unsupported states.
- [ ] Define file discovery, type validation, checksum, license, and safe-processing boundaries.
- [ ] Avoid silent fallback values and irreversible lossy transformations.

**Exit evidence:** field map, parser contract, normalization rules, sample records, explicit gaps.

## 7. Fixtures and tests

- [ ] Save policy-compliant representative fixtures with source, retrieval time, and checksum.
- [ ] Include normal, missing, malformed, localized, discontinued, pagination, redirect, and drift fixtures.
- [ ] Add parser tests for exact fields, units, provenance, confidence, and missing-state behavior.
- [ ] Add adapter tests for request limits, retries, caching, pagination, idempotency, and cancellation.
- [ ] Add golden records for normalization and entity resolution.
- [ ] Add negative tests that prove denied paths and unsafe methods are not called.
- [ ] Add a withdrawal test from raw evidence through derived and canonical layers.
- [ ] Verify logs redact secrets and avoid storing unnecessary personal data.

**Exit evidence:** fixture manifest, passing tests, coverage of failure paths, artifact hashes.

## 8. Shadow run

- [ ] Run against approved fixture or preview endpoints before any live recurring schedule.
- [ ] Keep canonical mutation disabled.
- [ ] Capture request count, response mix, bandwidth, cost, duration, parse yield, duplicate rate, conflict rate, and review volume.
- [ ] Compare output with hand-reviewed samples.
- [ ] Validate circuit breakers and cancellation.
- [ ] Validate raw evidence and provenance completeness.
- [ ] Confirm no denied paths, unexpected domains, or credential leakage.
- [ ] Record drift signatures and noisy fields.

**Exit evidence:** shadow-run report, sample audit, cost actuals, defects, go or no-go recommendation.

## 9. Pilot approval

- [ ] Confirm policy and technical preflight are current.
- [ ] Confirm reviewer and operator ownership.
- [ ] Define exact source, paths, fields, locale, frequency, volume, duration, and budget.
- [ ] Define measurable acceptance thresholds and maximum review queue growth.
- [ ] Define rollback, pause, incident, and withdrawal procedures.
- [ ] Define a cheap source canary, last-known-good fixture, structural fingerprint, and required-field minimums.
- [ ] Confirm monitoring, deduplicated alert routing, automatic source-local pause, and manual kill switch.
- [ ] Record approval scope and expiration.
- [ ] Set lifecycle to `approved`, then `pilot` only when execution begins.

**Exit evidence:** signed-off pilot packet with bounded scope, expiry, limits, and stop conditions.

## 10. Pilot operation

- [ ] Start with minimum concurrency and frequency.
- [ ] Monitor blocks, errors, latency, bytes, costs, parse yield, drift, duplicates, conflicts, and queue age.
- [ ] Verify the shared Cloudflare scheduler dispatches the source from registry cadence without a laptop, GitHub Actions schedule, or AI-agent initialization.
- [ ] Sample raw and normalized records continuously.
- [ ] Stop automatically when any hard condition is triggered.
- [ ] Record every configuration and extractor change.
- [ ] Do not expand paths, fields, cadence, or volume without a new approval.
- [ ] Keep canonical promotion behind review.

**Exit evidence:** complete run ledger, metrics, incidents, reviewed samples, budget reconciliation.

## 11. Promotion to recurring collection

- [ ] Acceptance thresholds met across the approved pilot duration.
- [ ] No unresolved policy, data-loss, provenance, or withdrawal defect.
- [ ] Maintenance owner and on-call path assigned.
- [ ] Refresh cadence, stale threshold, and drift checks configured.
- [ ] Cost envelope and alert thresholds accepted.
- [ ] Fixtures and runbooks current.
- [ ] Promotion decision and exact recurring scope recorded.
- [ ] Set lifecycle to `active` only after explicit approval.

## 12. Ongoing maintenance

- [ ] Run the hourly Cloudflare maintenance sentinel and confirm it evaluates overdue runs, stuck leases, retries, dead letters, freshness, canaries, extraction baselines, semantic rejections, policy staleness, and budgets.
- [ ] Keep source health in an explicit `healthy`, `suspect`, `degraded`, `paused`, `denied`, or `retired` state.
- [ ] Stop automatic promotion when a source becomes degraded and stop scheduling when it becomes paused.
- [ ] Deduplicate incidents by source and failure signature so repeated Cron checks do not create alert storms.
- [ ] Recheck robots, terms, licenses, API versions, quotas, and authentication before their stale threshold.
- [ ] Track domain, template, schema, pagination, identifier, and unit drift.
- [ ] Refresh fixtures after reviewed source changes.
- [ ] Reconcile source counts, parse yield, conflict rates, and review queue trends.
- [ ] Rotate secrets and remove access promptly when no longer needed.
- [ ] Review unresolved items and false-positive entity matches.
- [ ] Audit costs against source and global budgets.
- [ ] Practice pause, replay, and withdrawal procedures.

## 13. Incident response

- [ ] Pause the affected source or global scheduler.
- [ ] Preserve logs, run IDs, raw hashes, configuration, extractor version, and timestamps.
- [ ] Classify policy, access, cost, data quality, security, privacy, availability, or drift incident.
- [ ] Bound affected records, dates, sources, and downstream projections.
- [ ] Quarantine suspect records and prevent canonical promotion.
- [ ] Notify responsible reviewer and operator.
- [ ] Correct or withdraw derived records where required.
- [ ] Add a regression fixture and test before resuming.
- [ ] Run a Cloudflare canary or shadow collection with canonical promotion disabled before resuming.
- [ ] Require human deployment and resume approval even when Jcode, Hermes, or another agent proposed the repair.
- [ ] Record root cause, remediation, approval, and residual risk.

## 14. Pause, denial, and retirement

- [ ] Record exact reason, effective date, decision owner, and supporting evidence.
- [ ] Stop schedules, queues, tokens, webhooks, and background retries.
- [ ] Preserve audit history and approved raw evidence according to retention policy.
- [ ] Apply withdrawal or deletion requirements.
- [ ] Mark dependent views, adapters, tests, and documentation.
- [ ] Link replacement source or migration plan if one exists.
- [ ] Change lifecycle to `paused`, `denied`, `manual-only`, `link-only`, or `retired`.
- [ ] Never erase a prior approval or incident trail by deleting the source record.
