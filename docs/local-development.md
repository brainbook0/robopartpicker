# Local development

Local development uses the Cloudflare Vite plugin with local Wrangler bindings. D1 and R2 state is persisted beneath `.wrangler/` and is ignored by Git. No production binding is accessed by default.

## Expected setup

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:validate
npm run dev
```

The frontend and API share one origin. Authentication cookies therefore require no local cross-origin exception. A clean database applies all 13 sequential migrations and contains no catalog, project, build, Community, or Marketplace fixture records.

Useful local endpoints are:

- `/api/health` for bindings and capability metadata.
- `/api/v1/projects/import/analyze` for deterministic text/GitHub import analysis.
- `/api/v1/projects/import/archive` for authenticated private ZIP analysis.
- `/api/v1/projects/import/files` for authenticated, owner-scoped analysis of mixed R2 file sets.
- `/api/v1/ai/form-drafts` for optional server-side form drafting.
- `/mcp` for public read-only tools and `/mcp/private` for OAuth-scoped user tools.
- `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` for MCP OAuth discovery.

Private MCP clients use authorization code plus PKCE. Dynamic registration is public-client only, consent is explicit, access tokens are short-lived and audience-bound, and signing out invalidates the Better Auth session backing subsequent MCP requests. AI and MCP write tools return inert proposals; only a separate explicit confirmation request can perform the mutation.

## Portable RPPS commands

```powershell
npm run rpps:init -- my-robot
npm run rpps:validate -- path/to/rpps.yaml path/to/rpps.lock.yaml
npm run rpps:buildability -- path/to/rpps.yaml path/to/rpps.lock.yaml
npm run rpps:migrate -- legacy.rpps.json output/rpps.yaml
```

These commands use the same pure TypeScript parser and deterministic rules as the Worker. They do not connect to D1, R2, RoboPartPicker, or any AI provider. The draft schemas and interoperability example live in `contracts/` and `standards/rpps/`.

## Database commands

```powershell
npm run db:migration:create -- add_feature_name
npm run db:migrations:list
npm run db:migrate:local
npm run db:reset
npm run db:seed
npm run db:inspect
npm run db:export
npm run db:validate
```

`db:migrate:remote` is deliberately separate and includes Wrangler's `--remote` flag. Do not use it for ordinary development. The repository does not require `better-sqlite3`, a sidecar database process, or a manually opened `.sqlite` file.

`db:export` writes application-table data to ignored `exports/`. Apply the migrations before restoring that file. The export intentionally omits schema, Wrangler metadata, and FTS5 virtual/shadow tables because Wrangler's local exporter cannot dump a database containing virtual tables; the migrations recreate the FTS schema and triggers rebuild its index as rows are restored.

## Local secrets

`.dev.vars.example` documents required names without values. `.dev.vars` must contain a unique local `BETTER_AUTH_SECRET`, local `BETTER_AUTH_URL`, an ingestion credential, and optional email/OAuth/AI provider credentials. It is ignored by Git. The catalog starts empty; `npm run db:seed` remains an explicit legacy-fixture utility and is not part of normal setup.

The AI route defaults to OpenRouter's `deepseek/deepseek-v4-pro` model only when `AI_PROVIDER_KEY` is supplied. Tests never call the live provider. Local requests are capped by the configured per-response and rolling token limits. `GITHUB_TOKEN` is optional: unauthenticated public repository imports still work within the provider's lower rate limit.

Cloudflare's Vite plugin copies `.dev.vars` into the ignored Worker build directory for `vite preview`; Cloudflare documents that this copy is not deployed. Never publish or commit `dist/`, and do not use a production credential in the local file. The Wrangler configuration declares the three mandatory binding names so development warns when one is absent and deployment refuses to proceed until they have been configured on the Worker.

Wrangler local D1 and R2 behavior is documented at:

- <https://developers.cloudflare.com/workers/local-development/>
- <https://developers.cloudflare.com/r2/api/workers/workers-api-usage/>
