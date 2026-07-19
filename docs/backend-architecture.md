# Backend architecture

## Runtime topology

RoboPartPicker is one same-origin Cloudflare Worker deployment:

1. The Cloudflare Vite plugin builds the React client and Worker.
2. `/api/auth/*` is handled by Better Auth.
3. `/api/v1/*` is handled by the Hono API router.
4. Worker-proxied file routes enforce D1 metadata and authorization before reading `FILES`.
5. Other paths use Cloudflare static assets with SPA fallback to `index.html`.

There is no browser-to-database path, broad CORS policy, Node server, native SQLite driver, or runtime Lovable/Supabase dependency.

## Bindings and configuration

- `DB: D1Database` — authentication and all relational product data.
- `FILES: R2Bucket` — uploaded images, CAD, BOMs, documents, and evidence bytes.
- `ASSETS: Fetcher` — built React assets where Worker access is required.
- Plain configuration uses Wrangler vars. Credentials use `.dev.vars` locally and Wrangler secrets remotely.

Wrangler local simulation is the default. No binding is configured with `remote: true`, so ordinary local development cannot touch production data.

## Request pipeline

API requests pass through request ID, security headers, body-size enforcement, error sanitization, optional authentication, validation, rate-limit policy, authorization, domain service, and repository layers. Success and failure responses include `X-Request-Id`.

Error responses use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request could not be validated.",
    "requestId": "01...",
    "details": [{ "path": "quantity", "message": "Must be at least 1" }]
  }
}
```

Internal database and provider messages are logged with the request ID and are not returned to clients.

## Authentication

`createAuth(env)` constructs Better Auth with the request's `DB` binding, same-origin secure cookies, email/password enabled, and explicit email/reset delivery callbacks. The Worker mounts the standards-based `Request`/`Response` handler. The React client uses the same origin and sends cookies.

Better Auth tables are managed by sequential D1 SQL migrations. Runtime auto-migration is forbidden. Product profiles and organization authorization remain explicit RoboPartPicker tables so the role model can express owner, admin, engineer, builder, procurement, and viewer independently of authentication.

Authoritative references:

- <https://better-auth.com/docs/concepts/database>
- <https://better-auth.com/docs/installation>
- <https://better-auth.com/blog/1-5>

## Data access and consistency

Route handlers call typed domain repositories. Repositories own prepared SQL and row-to-domain mapping. Multi-statement invariants use `DB.batch()` with carefully ordered statements because D1 does not expose interactive transactions to Worker code. IDs are generated before writes.

Public list endpoints use bounded cursor/limit pagination, allow-listed sorts, indexed filters, and explicit response shapes. Private repositories always accept an authenticated actor or an already-authorized scope.

## Files

D1 stores file identity, object key, owner, organization/project/build relationships, visibility, status, size, media type, checksum, and timestamps. R2 stores bytes. Object keys are generated server-side and never derived directly from a filename. Upload and read endpoints enforce size/type/ownership; private objects are Worker-proxied. Malware scanning is an explicit quarantine-to-ready integration boundary.

## Imports and external content

Repository and scraper imports never write directly to canonical tables. The pipeline is raw record -> validated staging row -> deterministic candidates/conflicts -> review or policy-approved promotion -> canonical rows -> audit event. Imported text is data, never an instruction to AI tools.

## AI

Provider keys and calls stay in the Worker. Tools expose narrow, authorized domain operations rather than SQL. Read tools return evidence metadata; mutation tools create structured proposals and require user confirmation before writes. Conversations, messages, tool calls, usage, and cost estimates persist in D1.

## Cloudflare sources

- <https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/>
- <https://developers.cloudflare.com/workers/runtime-apis/bindings/>
- <https://developers.cloudflare.com/d1/reference/migrations/>
- <https://developers.cloudflare.com/d1/wrangler-commands/>
- <https://developers.cloudflare.com/r2/api/workers/workers-api-usage/>
