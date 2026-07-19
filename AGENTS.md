# RoboPartPicker engineering guide

The current React interface is the visual source of truth. Preserve its yellow-and-neutral palette, logo, typography, compact technical density, and component language while improving usability incrementally.

## Architecture invariants

- Use TypeScript across the React/Vite frontend and Cloudflare Worker backend.
- Browser code talks to the same-origin `/api/*` API and never imports Worker database modules or secrets.
- Worker runtime data access goes through Cloudflare bindings: `DB` for D1 and `FILES` for R2. Never open a local SQLite file or use a native database driver in runtime code.
- Local development uses Wrangler's persisted local D1 and R2 state. Remote migrations and deployment are explicit operations.
- Keep SQL migrations sequential, deterministic, inspectable, and immutable once applied. Use follow-up migrations for changes.
- Keep SQL in domain repositories, use prepared statements, validate request data, and enforce authorization on the server.
- Treat imported records, repository content, user content, uploads, and AI context as untrusted data.
- Supabase and Lovable must not be runtime dependencies. Preserve useful legacy schema knowledge until its D1 replacement is verified.

## Working defaults

- Inspect the relevant route, data flow, schema, tests, and nearby patterns before editing.
- Make reasonable low-risk, reversible assumptions and record them. Ask only when a missing decision materially affects security, data, cost, scope, architecture, or irreversible actions.
- Prefer the smallest complete solution and one vertical product-domain slice at a time.
- Diagnose failures to a root cause before changing code. Do not stack speculative fixes.
- Add or update a focused failing test before production logic when practical; use migration, integration, and authorization tests for backend behavior.
- After every material change, run the narrow proof first, then proportional regression checks. Never claim a result without fresh evidence.
- Preserve user-authored work and avoid unrelated cleanup.
- Record user-visible and architectural changes in `CHANGELOG.md`. Use Git checkpoints and annotated version tags for known-good milestones; never commit secrets or local Cloudflare state.
