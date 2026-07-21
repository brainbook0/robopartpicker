# Backend architecture

## Runtime topology

RoboPartPicker is one same-origin Cloudflare Worker deployment:

1. The Cloudflare Vite plugin builds the React client and Worker.
2. `/api/auth/*` is handled by Better Auth.
3. `/api/v1/*` is handled by the Hono API router.
4. `/mcp` is a stateless Streamable HTTP MCP endpoint for public read-only robotics tools.
5. `/mcp/private` is an OAuth-protected, scoped MCP endpoint for authorized projects, exact releases, builds, and confirmation-gated proposals.
6. Worker-proxied file routes enforce D1 metadata and authorization before reading `FILES`.
7. Other paths use Cloudflare static assets with SPA fallback to `index.html`.

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

Better Auth tables are managed by sequential D1 SQL migrations. Runtime auto-migration is forbidden. The Better Auth OAuth provider exposes authorization-code plus refresh-token flows with PKCE, scoped consent, short-lived JWT access tokens, and public dynamic client registration for native MCP clients. Private MCP verifies signature, issuer, audience, scopes, and the referenced live session; revoking the session invalidates access immediately. Product profiles and organization authorization remain explicit RoboPartPicker tables so the role model can express owner, admin, engineer, builder, procurement, and viewer independently of authentication.

Authoritative references:

- <https://better-auth.com/docs/concepts/database>
- <https://better-auth.com/docs/installation>
- <https://better-auth.com/blog/1-5>

## Data access and consistency

Route handlers call typed domain repositories. Repositories own prepared SQL and row-to-domain mapping. Multi-statement invariants use `DB.batch()` with carefully ordered statements because D1 does not expose interactive transactions to Worker code. IDs are generated before writes.

Public list endpoints use bounded cursor/limit pagination, allow-listed sorts, indexed filters, and explicit response shapes. Private repositories always accept an authenticated actor or an already-authorized scope.

Build engineering records use nested, owner/organization-authorized endpoints for configurations, firmware, calibrations, and tests. Repositories commit each record and its build-activity entry in one D1 batch. A configuration, firmware binary, or test-evidence file ID is accepted only when the ready R2-backed file is already attached to that build.

## Files

D1 stores file identity, object key, owner, organization/project/build relationships, visibility, status, size, media type, checksum, and timestamps. R2 stores bytes. Object keys are generated server-side and never derived directly from a filename. Upload and read endpoints enforce size/type/ownership; private objects are Worker-proxied. Image uploads require recognized headers and bounded dimensions before storage. Project artifacts are linked to the current immutable project version and remain distinct from external references declared in RPPS. Malware scanning is an explicit quarantine-to-ready integration boundary.

## Imports and external content

Repository and scraper imports never write directly to canonical tables. The external-agent pipeline is raw record -> validated staging row -> deterministic candidates/conflicts -> review or policy-approved promotion -> canonical rows -> audit event. Imported text is data, never an instruction to AI tools.

The interactive project importer is a separate bounded analysis boundary. Anonymous requests accept portable/legacy RPPS, CSV/JSON/YAML BOMs, and URDF up to 1 MiB. Public GitHub analysis is reference-first: it accepts only canonical HTTPS repository URLs, calls the fixed `api.github.com` origin, inventories at most 10,000 tree entries/500 relevant files, prioritizes RPPS/BOM/robot-model/dependency files, and downloads at most 24 small relevant text files. The analysis records request, file, byte, inventory-only, and mirroring counts; reference imports mirror zero files to R2. Authenticated ZIP imports first use the owner's private R2 upload, then enforce compressed, expanded, file-count, path-traversal, and extracted-text limits. Authenticated mixed-file analysis accepts up to 100 authorized R2 records/100 MiB of inventory and parses at most 5 MiB of bounded text. It extracts explicit BOM identities, URDF structure and joint limits, dependency manifests, configuration key/type metadata, procedure candidates, previews, and repository engineering signals. Analysis preserves source mappings and produces a reviewable manifest/scorecard; it never infers a purchasable part from geometry and does not populate canonical catalog data.

## AI

Provider keys and calls stay in the Worker. OpenRouter uses `deepseek/deepseek-v4-pro` through its OpenAI-compatible API. Tools expose narrow, authorized domain operations rather than unrestricted SQL. Read tools return evidence metadata; mutation tools create structured proposals and require user confirmation before writes. Review-before-apply structured drafting covers the main project, Community, Marketplace, build-record, and release-proposal forms. Conversations, messages, tool calls, usage, and cost estimates persist in D1. Output, tool-step, retry, per-minute, and rolling token limits bound spend.

## Model Context Protocol

`/mcp` implements the current Streamable HTTP transport with the Web Standards MCP SDK. The server is stateless and exposes only public, read-only catalog/project/supplier search, component comparison, managed public project artifacts, and portable-or-legacy RPPS validation. It cannot read private projects/builds/files or mutate data.

`/mcp/private` is a separate OAuth 2.1 protected resource with `rpp:read` and `rpp:write` scopes. It reads authorized project files, exact releases/collaboration, and persistent build state. Write tools create inert D1 proposals; a second call with `confirm=true` and write scope applies a still-authorized proposal. No MCP tool receives unrestricted SQL, database credentials, raw R2 object keys, or provider secrets.

## Notifications

Notifications are user-scoped D1 records. Community replies and Marketplace inquiries call a shared service that checks the recipient's per-type in-app preference before inserting. Reads, unread counts, and mutations are authenticated and constrained by `user_id`; the React notification center accepts navigation only through the existing safe-internal-path validator. Email preferences store the user's intent but do not claim delivery unless the Worker email-provider boundary is configured.

## Organization collaboration

Organization settings and membership are managed through `/api/v1/organizations/*`. The Worker enforces owner/admin/engineer/builder/procurement/viewer permissions, optimistic organization versions, owner-only ownership grants, and a final-active-owner invariant. The frontend organization workspace only reflects these policies; hiding a control is never the authorization boundary.

Projects and builds may be created in an organization by members with the relevant engineering/build permission. Changing an existing organization owner scope or its visibility is a separate administrative action: the Worker requires administrator permission in the current organization and in any destination organization. Project scope updates synchronize the generated BOM owner, organization, and visibility in the same D1 batch.

RPPS technical-record publication is versioned and optimistic: the client submits the current project record version, the Worker rejects stale writes, and a successful publication creates a new immutable `project_versions` row. Required tools and skills are projected into `project_requirements`; RPPS evidence is projected into `evidence` and `evidence_claims` while the complete validated package remains the portable source record.

Project pages and personal builds share one reproduction journey without collapsing their data models. A project is the immutable, portable release; “Reproduce” creates a private-by-default personal build passport. Aggregate reproduction and independently successful-outcome counts are exposed on the project while private build contents remain authorized separately.

Marketplace listings may link an authorized source build. Public listing responses expose only aggregate known parts cost and priced-line coverage, never private build rows. Listing images are validated R2 objects with a twelve-image limit; seller narrative and evidence declarations remain D1 records. Asking price minus known parts cost is context only and is explicitly not represented as profit or valuation.

## Portable RPPS releases

The existing flat `project_versions.rpps_json` record is the legacy application adapter. Portable RPPS 0.1 Draft is implemented as a separate, vendor-neutral manifest and lockfile so current project screens remain compatible while the public format evolves.

`POST /api/v1/rpps/validate` is anonymous, size-bounded, deterministic, and performs no persistence. Authenticated engineers may append releases through `/api/v1/projects/:id/releases`; release rows are immutable and content-addressed. Draft releases are visible only to the project owner or organization members, even when the containing project is public. Published releases inherit project read scope.

The complete normalized YAML remains authoritative. D1 also projects assemblies, interfaces, artifact source mappings, and validation findings for queries. Published releases are immutable; a draft may be published exactly once. "Build this release" creates a private-by-default build passport pinned to its stable release ID, version, and package digest, with stable component/procedure mappings. Outcomes require an exact passport and recorded build evidence; maintainer versus independent status is derived server-side. Structured proposals are reviewed for a future release and never rewrite a published package. Semantic diffs compare stable object IDs and changed fields. The pure TypeScript core and CLI have no Cloudflare dependency.

## Cloudflare sources

- <https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/>
- <https://developers.cloudflare.com/workers/runtime-apis/bindings/>
- <https://developers.cloudflare.com/d1/reference/migrations/>
- <https://developers.cloudflare.com/d1/wrangler-commands/>
- <https://developers.cloudflare.com/r2/api/workers/workers-api-usage/>
