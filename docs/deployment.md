# Cloudflare deployment

Preview and production are isolated full-stack Worker deployments. Production was first deployed on 2026-07-23 and must remain independently verified after every release.

## Live production environment

- Worker: `robopartpicker-production`
- D1: `robopartpicker-production` (`10c57e79-e34f-4643-8c4e-4f0c7968a74d`)
- R2: `robopartpicker-files`
- Queue: `robopartpicker-imports-production`
- Dead-letter queue: `robopartpicker-imports-production-dlq`
- URL: <https://robopartpicker-production.ludomi2502.workers.dev>
- Verified Worker version: `032e2294-face-4c0e-a234-29adf91ceba4`

The initial production database has all 14 migrations, 184 tables, no foreign-key failures, and no demo component, supplier, or BOM rows. The Workers Free account does not have Containers access, so production deliberately omits the `Sandbox` Durable Object and native CAD/ROS/archive processing. Worker-native safe parsers remain enabled, and unsupported native jobs fail closed.

The production health endpoint, SPA homepage and legal deep links, empty project API, public MCP initialization and six-tool discovery, OAuth resource metadata, and private MCP challenge were verified against the live origin. AI remains fail-closed until a rotated provider credential is configured; do not reuse a credential exposed through chat.

## Live preview environment

The `preview` Wrangler environment is a full-stack Worker deployment with isolated Cloudflare resources:

- Worker: `robopartpicker-preview`
- D1: `robopartpicker-preview`
- R2: `robopartpicker-preview-files`
- URL: <https://robopartpicker-preview.ludomi2502.workers.dev>
- Verified 0.5.0 Worker version: `156a4542-8bf8-4077-aa8a-322764e79cca`
- Previous 0.4.0 Worker version: `fe68d7f1-25e9-40ea-a6aa-fbcd21011e8b`
- Pre-0.5.0 D1 Time Travel bookmark: `0000002f-00000000-000050ae-b9818d0b01eca4029002a9524f4e4929`

It serves the React assets, `/api/*`, the public read-only `/mcp` endpoint, and the OAuth-protected `/mcp/private` endpoint from one origin. Apply migrations, validate the intentionally empty catalog, then deploy:

```powershell
npm run db:migrate:preview
npm run db:validate:preview
npm run deploy:preview
```

Preview secrets are environment-specific and must be configured with `--env preview`. Catalog population is a separate run; neither preview nor production is seeded by default.

The 0.5.0 preview was deployed on 2026-07-20 after applying migration `0013_build_descriptions.sql`. Remote validation reported 128 tables, 13 migrations, no foreign-key failures, and no optional demo component, supplier, or BOM rows. The public health/API routes, SPA deep links, public MCP initialization and six-tool discovery, private MCP's unauthenticated challenge, and OAuth protected-resource metadata were checked against the deployed URL. Automated in-app browser control was unavailable, so interactive drag/rotate and mobile visual checks remain explicitly unverified.

Use the recorded Worker version for code rollback and the recorded D1 Time Travel bookmark for database rollback. A direct SQL export was attempted before migration but D1 rejected it because the schema contains an FTS5 virtual table; no export file was created and no database mutation occurred during that attempt.

After rotating the OpenRouter key that was shared through chat, enter the replacement without placing it on the command line:

```powershell
npx wrangler secret put AI_PROVIDER_KEY --env preview
```

Wrangler prompts for the value interactively. Do not paste the key into source, `.dev.vars.example`, shell arguments, or documentation.

The preview deploy script passes `--env preview` explicitly. It cannot silently deploy the base or production configuration.

The migration command includes the guarded remote-D1 compatibility bootstrap documented in `docs/database-schema.md`; it does not edit previously applied migration files.

## 0.6 infrastructure prerequisites

Version 0.6 adds migration `0014_cross_product_systems.sql`, a Queue consumer, dead-letter queues, and the `Sandbox` container/Durable Object used for fixed-command native file inspection. Provision the queues once, then regenerate types and run the dry run before a release:

```powershell
npx wrangler queues create robopartpicker-imports-preview
npx wrangler queues create robopartpicker-imports-preview-dlq
npx wrangler queues create robopartpicker-imports-production
npx wrangler queues create robopartpicker-imports-production-dlq
npm run cf:types
npm run deploy:dry-run
```

The container image and `@cloudflare/sandbox` package are pinned to `0.12.4`. Keep these versions aligned. When the account lacks Containers, keep the environment's container, Durable Object, and migration arrays empty; do not silently process native formats in the Worker. Imported scripts, launch files, and Xacro content are never executed by the Worker; the container only invokes the repository-owned allowlisted static processor when that binding is available.

Model routing can use `AI_PROVIDER_KEYS_JSON` for provider-key-to-credential mapping. `AI_PROVIDER_KEY` remains the environment fallback. `AI_DATA_SENSITIVITY_POLICY` controls which data classes that fallback may receive. Candidate prompt or routing changes still require a passing live regression evaluation before activation.

## Local mobile workflow validation

Run the isolated Pixel 5 workflow suite before a release:

```powershell
npm run test:e2e:mobile
```

The harness resets only `.wrangler/e2e-state`, applies all migrations there, starts the same-origin Worker/Vite application, and creates synthetic local accounts. It does not alter the normal local D1 state. The isolated Windows test configuration disables local Containers while exercising the safe Worker-native URDF path. Preview and production also keep Containers disabled on the current Workers Free account. The Playwright configuration uses the installed stable Chrome channel.

## One-time production resources

```powershell
npx wrangler login
npx wrangler d1 create robopartpicker-production
npx wrangler r2 bucket create robopartpicker-files
```

The current production D1 ID is already recorded in `wrangler.jsonc`. Keep local bindings local; do not add `remote: true` to the default development configuration.

## Secrets

The three required production secrets are:

```powershell
npx wrangler secret put BETTER_AUTH_SECRET --env production
npx wrangler secret put BETTER_AUTH_URL --env production
npx wrangler secret put INGESTION_SECRET --env production
```

The authentication and ingestion names are declared under `secrets.required` in the production Wrangler environment. AI is optional and fails closed while its provider key is absent. After rotating the previously exposed credential, configure it interactively with `npx wrangler secret put AI_PROVIDER_KEY --env production`. OpenRouter's base URL and model ID are non-secret Wrangler vars; the credential is entered only through Wrangler's interactive secret prompt.

Add email provider, OAuth, repository provider, AI provider, and malware scanner credentials only for features that are configured. Secrets are environment-specific, so every production secret command includes `--env production`. Never put them in `vars`, `VITE_*`, source control, or client code.

`GITHUB_TOKEN` is optional and only raises the GitHub API rate limit for repository imports. Better Auth provides the OAuth authorization server used by private MCP clients; no separate OAuth client secret is required for dynamically registered public PKCE clients. Migrations `0011_oauth_provider_and_private_mcp.sql` and `0012_rpps_release_collaboration.sql` must be applied before private MCP or exact-release collaboration is enabled.

## Release

```powershell
npm ci
npm run check
npm run db:migrations:list:remote
npm run db:migrate:remote
npm run deploy
```

Remote migrations are an explicit production action. Do not seed demo fixtures into production unless that is an intentional release decision.

The normal `npm run build` selects the named Cloudflare `production` environment at Vite build time and generates a flattened deploy configuration with `APP_ENV=production`. Local `npm run dev` continues to use the top-level development bindings.

## Verification

After deploy, verify the health endpoint, SPA deep links, signup/sign-in/sign-out, private-resource isolation, organization roles, file authorization, malformed/duplicate imports, deterministic project analysis, AI provider failure behavior, public MCP initialization/tool discovery, private MCP's unauthenticated challenge, OAuth discovery metadata, the mobile primary workflows, and any configured custom domain. Confirm the catalog is empty unless an intentional population run occurred. Local Playwright results do not replace deployed-environment checks, and a deploy command alone is not evidence that deployment succeeded.

Cloudflare references:

- <https://developers.cloudflare.com/d1/wrangler-commands/>
- <https://developers.cloudflare.com/workers/wrangler/configuration/>
