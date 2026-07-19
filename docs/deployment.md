# Cloudflare deployment

Deployment is prepared here but must be explicitly approved and verified against the resulting endpoint.

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
```

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

After deploy, verify the health endpoint, SPA deep links, signup/sign-in/sign-out, private-resource isolation, organization roles, file authorization, malformed/duplicate imports, AI provider failure behavior, and the custom domain. A deploy command alone is not evidence that deployment succeeded.

Cloudflare references:

- <https://developers.cloudflare.com/d1/wrangler-commands/>
- <https://developers.cloudflare.com/workers/wrangler/configuration/>
