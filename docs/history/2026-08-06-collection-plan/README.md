# RoboPartPicker data-collection plan

This repository preserves RoboPartPicker's Cloudflare-first collection architecture, source inventories, provenance rules, safety model, prioritization, maintenance controls, verification gates, and staged rollout plans.

- Source repository checkpoint: `bd261f21562a817a07115cb1e0898e33269dc19c`
- Plan date: 2026-07-28
- Current planning status: Cloudflare-first runtime architecture recorded; live recurring collection remains disabled until implementation and source-specific pilot approval.
- Cloudflare-first runtime plan: [`docs/plans/2026-08-06-002-cloudflare-first-scraping-operations-plan.md`](docs/plans/2026-08-06-002-cloudflare-first-scraping-operations-plan.md)
- Provenance and ingestion plan: [`docs/robopartpicker-data-collection-plan.md`](docs/robopartpicker-data-collection-plan.md)
- Runtime contract: [`docs/architecture/collection-runtime-contract.md`](docs/architecture/collection-runtime-contract.md)
- Component-spec promotion contract: [`docs/architecture/component-spec-promotion-contract.md`](docs/architecture/component-spec-promotion-contract.md)
- First-wave source queue: [`docs/inventories/first-wave-source-queue.md`](docs/inventories/first-wave-source-queue.md)
- First adapter packet: [`docs/adapter-specs/robotis-emanual-x-series.md`](docs/adapter-specs/robotis-emanual-x-series.md)
- Master list system: [`docs/inventories/README.md`](docs/inventories/README.md)
- Preserved legacy inventory: [`docs/inventories/legacy-canonical-inventory.txt`](docs/inventories/legacy-canonical-inventory.txt)
- Master list requirements: [`docs/plans/2026-08-06-001-docs-robopartpicker-master-list-system-plan.md`](docs/plans/2026-08-06-001-docs-robopartpicker-master-list-system-plan.md)

The plans distinguish architecture decisions, implementation readiness, and live-source approval. They contain no credentials and do not authorize bypassing source policies, robots directives, terms, or paid-service gates.
