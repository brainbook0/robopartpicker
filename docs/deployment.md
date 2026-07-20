# Cloudflare deployment

The isolated preview has been deployed and verified. Production deployment remains explicit and must be verified against its resulting endpoint.

## Live preview environment

The `preview` Wrangler environment is a full-stack Worker deployment with isolated Cloudflare resources:

- Worker: `robopartpicker-preview`
- D1: `robopartpicker-preview`
- R2: `robopartpicker-preview-files`
- URL: <https://robopartpicker-preview.ludomi2502.workers.dev>
- Verified checkpoint Worker version: `93684800-3daf-43e3-9bb2-a941029b39`

It serves the React assets, `/api/*`, and the public read-only `/mcp` endpoint from one origin. Apply migrations, validate the intentionally empty catalog, then deploy:

```powershell
npm run db:migrate:preview
npm run db:validate:preview
npm run deploy:preview
```

Preview secrets are environment-specific and must be configured with `--env preview`. Catalog population is a separate run; neither preview nor production is seeded by default.

After rotating the OpenRouter key that was shared through chat, enter the replacement without placing it on the command line:

```powershell
npx wrangler secret put AI_PROVIDER_KEY --env preview
```

Wrangler prompts for the value interactively. Do not paste the key into source, `.dev.vars.example`, shell arguments, or documentation.

The preview deploy script passes `--env preview` explicitly. It cannot silently deploy the base or production configuration.

The migration command includes the guarded remote-D1 compatibility bootstrap documented in `docs/database-schema.md`; it does not edit previously applied migration files.

## One-time production resources

```powershell
npx wrangler login
npx wrangler d1 create robopartpicker-production
npx wrangler r2 bucket create robopartpicker-files
```

Copy the created D1 ID into the production binding in `wrangler.jsonc`. Keep local bindings local; do not add `remote: true` to the default development configuration.

## Secrets

At minimum, configure:

```powershell
npx wrangler secret put BETTER_AUTH_SECRET --env production
npx wrangler secret put BETTER_AUTH_URL --env production
npx wrangler secret put INGESTION_SECRET --env production
npx wrangler secret put AI_PROVIDER_KEY --env production
```

The authentication and ingestion names are declared under `secrets.required` in the production Wrangler environment. The AI route fails closed when its provider key is absent. OpenRouter's base URL and `deepseek/deepseek-v4-pro` model ID are non-secret Wrangler vars; the credential is entered only through Wrangler's interactive secret prompt.

Add email provider, OAuth, repository provider, AI provider, and malware scanner credentials only for features that are configured. Secrets are environment-specific, so every production secret command includes `--env production`. Never put them in `vars`, `VITE_*`, source control, or client code.

## Release

```powershell
npm ci
npm run check
npm run db:migrations:list:remote
npm run db:migrate:remote
npm run deploy
```

Remote migrations are an explicit production action. Do not seed demo fixtures into production unless that is an intentional release decision.

The normal `npm run build` selects the named Cloudflare `production` environment at Vite build time and generates a flattened deploy configuration with `APP_ENV=production`. Local `npm run dev` continues to use the top-level development bindings. Replace the production D1 placeholder ID before either remote migrations or deployment.

## Verification

After deploy, verify the health endpoint, SPA deep links, signup/sign-in/sign-out, private-resource isolation, organization roles, file authorization, malformed/duplicate imports, AI provider failure behavior, MCP initialization/tool discovery, and the custom domain. A deploy command alone is not evidence that deployment succeeded.

Cloudflare references:

- <https://developers.cloudflare.com/d1/wrangler-commands/>
- <https://developers.cloudflare.com/workers/wrangler/configuration/>
