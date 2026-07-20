# RoboPartPicker

RoboPartPicker is the data, collaboration, sourcing, marketplace, and AI build platform for DIY robotics. This repository is a standalone TypeScript application: a React/Vite frontend and same-origin Cloudflare Worker backed by D1 and R2.

The runtime does not depend on Lovable or Supabase. The original downloaded application is preserved in the sanitized `v0.1.0-lovable-baseline` Git tag and the local archive documented in `archive/README.md`.

## Local setup

Requirements: Node.js 20 or newer and npm.

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:validate
npm run dev
```

Open <http://127.0.0.1:8080>. Vite and the Worker run together; `/api/*` uses locally simulated bindings. Local D1 and R2 data persists under ignored `.wrangler/` state and never accesses production by default.

Replace every placeholder in `.dev.vars`. `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `INGESTION_SECRET` are required. Email, authenticated GitHub import, AI, and malware scanning providers are optional integration boundaries and report unavailable when not configured. Public GitHub imports work against the bounded unauthenticated API path; a token only raises the provider rate limit.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run React and the Worker together with local bindings |
| `npm run check` | Type-check, lint, run all tests, and build |
| `npm run test:unit` | Run browser-independent/frontend unit tests |
| `npm run test:worker` | Run API, auth, D1, R2, authorization, ingestion, Community, Marketplace, AI, and MCP tests |
| `npm run rpps:validate -- manifest lock` | Validate a portable RPPS manifest/lockfile and print deterministic profile results |
| `npm run rpps:buildability -- manifest lock` | Print the full RPPS scorecard and findings |
| `npm run rpps:migrate -- legacy output` | Convert the legacy flat RPPS JSON record to portable YAML without discarding the source record |
| `npm run db:migration:create -- name` | Create the next D1 migration |
| `npm run db:migrations:list` | List local migration state |
| `npm run db:migrate:local` | Apply migrations to Wrangler's local D1 |
| `npm run db:migrate:remote` | Explicitly apply migrations to production D1 |
| `npm run db:migrate:preview` | Explicitly apply migrations to the isolated Cloudflare preview D1 |
| `npm run db:reset` | Remove only local Wrangler D1 state and apply clean migrations |
| `npm run db:seed` | Optional: idempotently import labeled legacy demo fixtures |
| `npm run db:seed:preview` | Optional: intentionally seed labeled fixtures into the preview D1 |
| `npm run db:inspect` | List local tables and indexes |
| `npm run db:export` | Export local application-table data; restore after migrations |
| `npm run db:validate` | Check migrations, required tables, and foreign keys; an empty catalog is valid |
| `npm run db:validate:preview` | Validate the migrated preview D1 remotely |
| `npm run deploy:dry-run` | Build and validate the deployment bundle without publishing |
| `npm run deploy` | Deploy after production resources, secrets, and remote migrations are ready |
| `npm run deploy:preview` | Build and deploy the full-stack preview Worker |

## Architecture

- `src/` contains the React UI, typed same-origin API client, Better Auth client, and legacy plus portable RPPS cores.
- `worker/` contains the Worker router, middleware, domain repositories, deterministic project/import pipeline, R2 access, server-side AI provider boundary, public read-only MCP, and OAuth-protected private MCP.
- `migrations/` is the immutable, sequential, SQLite-compatible D1 schema.
- `scripts/` owns local seed, reset, export, and schema validation workflows.
- `contracts/` contains versioned machine-readable external schemas.
- `standards/rpps/` contains the vendor-neutral RPPS draft, interoperability examples, and profile semantics.
- `tests/worker/` executes against isolated local D1 and R2 bindings.

Detailed references: [backend architecture](docs/backend-architecture.md), [database schema](docs/database-schema.md), [ingestion contract](docs/data-ingestion-contract.md), [local development](docs/local-development.md), and [deployment](docs/deployment.md).

## Live preview

The live preview is available at <https://robopartpicker-preview.ludomi2502.workers.dev>. It is a single Cloudflare Worker serving the React SPA, same-origin `/api/*` backend, public `/mcp`, and OAuth-protected `/mcp/private`. It uses dedicated `robopartpicker-preview` D1 and `robopartpicker-preview-files` R2 resources, never the Attentify or production resources. The preview catalog is intentionally unpopulated; data ingestion, catalog population, scraping, and price tracking are separate work.

## Production deployment

Production creation/migration is deliberately explicit:

```powershell
npx wrangler login
npx wrangler d1 create robopartpicker-production
npx wrangler r2 bucket create robopartpicker-files
# Put the D1 database ID in wrangler.jsonc, then configure secrets:
npx wrangler secret put BETTER_AUTH_SECRET --env production
npx wrangler secret put BETTER_AUTH_URL --env production
npx wrangler secret put INGESTION_SECRET --env production
npx wrangler secret put AI_PROVIDER_KEY --env production
npm run check
npm run db:migrate:remote
npm run deploy
```

Do not seed demo fixtures into production unless that is an intentional release decision. The configured AI provider is OpenRouter with `deepseek/deepseek-v4-pro`; enter its credential only through Wrangler's interactive secret prompt. A successful deploy command is not a health check; follow `docs/deployment.md` and test the deployed URL, authentication, and private-resource isolation.

## Data honesty

Local seed records carry `is_demo = 1` and the UI labels them as demo/fixture data. Supplier prices, marketplace listings, RFQs, email, AI, scanning, and delivery are never represented as live or completed unless a configured provider confirms the action. RPPS 0.1 is a portable draft, not an established industry standard or engineering certification.
