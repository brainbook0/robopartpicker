# RoboPartPicker

**RoboPartPicker is a project-first platform for discovering, reproducing, modifying, and sourcing robotics designs.**

It aggregates open robotics projects, preserves their source and revision history, extracts or imports bills of materials, matches BOM lines to canonical components, compares supplier observations, and produces an honest procurement plan. Closed-source projects may also be listed as clearly labeled showcases, but their unavailable design files are never represented as reproducible.

> Product shorthand: robotics project discovery + automatic BOM generation + PCPartPicker-style sourcing + assisted procurement.

Production: <https://robopartpicker-production.ludomi2502.workers.dev>

## Vision: the information layer for robotics

RoboPartPicker aims to become **the information layer and the largest marketplace for robotics components**.

That goal is only reachable through the most extensive data collection in the space:

- every open physical robot design cataloged and categorized (humanoid, manipulator, quadruped, mobile, and more);
- every bill of materials derived, whether from an explicit BOM file, project documentation, or the CAD/model files themselves;
- every component identity normalized with specifications, evidence, and provenance;
- every supplier catalog and observed price collected, with honest freshness and uncertainty, so a builder can see the whole market rather than one distributor.

The component catalog is therefore treated as a first-class data asset. Breadth and provenance of supplier data are the foundation of the marketplace — but the same data-honesty rules apply: an observed price is an observation, not a quote, and missing evidence stays visible.

## What the product is for

A builder should be able to move through one coherent workflow:

1. **Discover or import a robotics project.** Search the public catalog, paste a repository URL, upload project files, or create a project manually.
2. **Identify the exact design revision.** Keep the upstream source, maintainer, license, revision, timestamps, files, and evidence attached to the project.
3. **Compile the BOM.** Read explicit BOM files plus project documentation, robot-description files, CAD metadata, configuration, firmware references, and nested assemblies.
4. **Resolve uncertainty.** Retain unmatched lines, missing quantities, fabricated parts, and weak matches instead of silently dropping them.
5. **Source the full build.** Match parts to observed supplier offers and optimize across price, quantity breaks, lead time, region, condition, substitutions, and supplier consolidation.
6. **Plan deliveries.** Show which supplier ships which lines, expected arrival windows, and the parts that block a complete build.
7. **Request firm quotes.** Prepare normalized supplier RFQs, reconcile responses against the estimate, and require explicit user approval before any purchasing handoff.
8. **Reproduce or fork the design.** Lock a build to an immutable release, change CAD/files/descriptions/BOMs, and preserve upstream attribution and project lineage.

The robotics **project** is the primary product object; the component and supplier catalog is the data layer that the marketplace is built on.

## Product surfaces

| Surface | Purpose | Current status |
| --- | --- | --- |
| Projects | Discover, import, publish, inspect, reproduce, and fork robotics designs | Live |
| BOMs | Versioned bills of materials with line-level completeness and evidence | Live, corpus coverage still growing |
| Sourcing | Whole-BOM estimated baskets with constraints, offer freshness, and unpriced lines | Live estimates |
| Firm supplier quotes | RFQ package, supplier-response reconciliation, approval state machine | Workflow live, outbound supplier delivery remains integration-dependent |
| Components | Canonical parts, specifications, revisions, media, offers, and alternatives | Live |
| Build workspace | Persistent project reproductions and BOM decisions | Live |
| Marketplace | Parts, robots, fabrication, services, and wanted requests | Live internal listings, no platform payment processing |
| Public MCP | Read-only project, component, and supplier data for external agents | Live at `/mcp` |
| Private MCP | OAuth-scoped user/project actions with confirmation gates | Live at `/mcp/private` |
| AI robotics workspace | AI-native environment for designing and modifying robotics projects | **Coming soon** |
| Automated supplier outreach | Provider-backed sending and response ingestion at scale | **Coming soon** until a delivery integration is configured |

## Data honesty

RoboPartPicker distinguishes facts from estimates and roadmap promises.

- An observed supplier price is not a binding quote.
- Shipping, tax, duties, stock, and delivery are shown only when supported by evidence.
- Unpriced BOM lines remain visible and are excluded from claimed totals.
- AI-inferred values require classification and provenance.
- Imported project text and files are untrusted data.
- A repository without a clear license is source-available, not automatically open source.
- Closed-source projects are showcase records unless the owner supplies reproducible artifacts.
- No supplier is contacted and no payment is processed without an explicit, configured integration and user approval.

See [the canonical product definition](docs/product-definition.md), [product recovery coverage](docs/product-recovery-coverage.md), and [data ingestion contract](docs/data-ingestion-contract.md).

## Architecture

This repository contains one deployable TypeScript application:

- `src/`: React and Vite frontend, typed same-origin API client, build/project UI, and portable RPPS tools.
- `worker/`: Cloudflare Worker router, D1 repositories, R2 file access, project/BOM ingestion, sourcing, RFQ, AI provider boundary, and MCP servers.
- `migrations/`: immutable sequential D1 schema.
- `contracts/`: versioned machine-readable ingestion schemas.
- `standards/rpps/`: vendor-neutral RPPS draft, examples, and conformance profiles.
- `scripts/`: validation, ingestion, migration, enrichment, and production operations.
- `tests/worker/`: API, authorization, D1, R2, marketplace, AI, ingestion, and MCP integration tests.
- `docs/history/`: preserved planning artifacts from earlier RoboPartPicker repositories. Historical plans are evidence, not current requirements.

Runtime stack: React, TypeScript, Vite, Hono, Better Auth, Cloudflare Workers, D1, R2, Queues, and the Model Context Protocol SDK.

## Local development

Requirements: Node.js 22 or newer and npm. The pinned Wrangler release requires Node.js 22.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:validate
npm run dev
```

Open <http://127.0.0.1:8080>. Local Wrangler state is isolated under `.wrangler/` and does not access production by default.

Required local variables:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `INGESTION_SECRET`

Email, authenticated GitHub import, AI, malware scanning, and outbound supplier delivery are optional integration boundaries. Their absence must produce an explicit unavailable or draft-only state.

## Quality and verification

```bash
npm run typecheck
npm run lint
npm run contracts:validate
npm run test:unit
npm run test:worker
npm run build
# or all gates
npm run check
```

The golden semantic suite covers:

- a clean open-source project with an explicit BOM
- a messy project with unresolved BOM evidence
- a user-created derivative with substitutions and fabricated parts

A feature is not complete because a card renders. Public workflows must load real records, preserve uncertainty, cross API and storage boundaries, and fail honestly.

## Important commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the frontend and Worker together with local bindings |
| `npm run check` | Type-check, lint, validate contracts, test, and build |
| `npm run test:unit` | Run browser-independent and shared-domain tests |
| `npm run test:worker` | Run Worker integration tests against isolated bindings |
| `npm run rpps:validate -- manifest lock` | Validate an RPPS manifest and lockfile |
| `npm run rpps:buildability -- manifest lock` | Print RPPS buildability findings |
| `npm run db:migrate:local` | Apply migrations to local D1 |
| `npm run db:migrate:preview` | Apply migrations to preview D1 |
| `npm run db:migrate:remote` | Explicitly apply migrations to production D1 |
| `npm run deploy:preview` | Build and deploy the isolated preview environment |
| `npm run deploy` | Build and deploy production |

## Deployment

Cloudflare resources are defined in `wrangler.jsonc`. Production migrations and deployments are deliberately explicit.

```bash
npm run check
npm run db:migrate:remote
npm run deploy
```

A successful deploy is not an acceptance test. Verify the production health endpoint, public project and component APIs, a project detail page, a BOM with priced and unpriced lines, an R2-backed file, public MCP initialization/tool calls, and private-resource isolation.

Detailed references:

- [Backend architecture](docs/backend-architecture.md)
- [Database schema](docs/database-schema.md)
- [Deployment](docs/deployment.md)
- [Local development](docs/local-development.md)
- [MCP](docs/mcp.md)
- [RPPS draft](standards/rpps/README.md)

## Repository consolidation

The canonical repository is `lucadominguez/robopartpicker`.

The useful contents of the former planning repositories are preserved under [`docs/history`](docs/history/README.md). The legacy application baseline remains documented under [`archive`](archive/README.md). Old GitHub repositories should be archived only after the consolidated copies are verified. They should not be deleted as part of an automated cleanup.

## Commercial and community contact

Marketplace participants, robotics suppliers, fabrication partners, project maintainers, and advertisers can use the in-product community and marketplace surfaces. A dedicated partnership contact workflow is part of the public product cleanup and must remain clearly separate from supplier RFQs and user support.

## License and status

RPPS 0.1 is a portable draft, not an established industry standard or engineering certification. Project and component records retain their own upstream licenses and attribution. Consult the repository license and each upstream record before reuse.
