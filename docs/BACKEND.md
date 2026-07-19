# RoboPartPicker — Backend Architecture

This document is the exact, exportable specification of the backend that
powers RoboPartPicker. It is generated from the live database and the
source of truth files in this repository, and is kept alongside the
frontend code so it travels through the GitHub sync.

The backend runs on Supabase (PostgreSQL 15 + PostgREST + GoTrue + Deno
Edge Functions). Everything below is reproducible on any Supabase
project by applying the SQL migrations under `supabase/migrations/` and
deploying the functions under `supabase/functions/`.

---

## 1. High-level topology

```
Browser (React / Vite SPA)
   │
   ├── @supabase/supabase-js  ──►  PostgREST  ──►  Postgres (public schema, RLS)
   │                                    │
   │                                    └──►  auth.users (GoTrue)
   │
   └── fetch() with Bearer <access_token>  ──►  Edge Function: chat
                                                    │
                                                    ├── service-role client → Postgres
                                                    └── Lovable AI Gateway (Gemini) via
                                                        `Lovable-API-Key` header
```

- **Client entry**: `src/integrations/supabase/client.ts` (auto-generated,
  do not edit). Reads `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env`.
- **Auth**: Supabase GoTrue. Email/password + Google OAuth. A trigger
  `handle_new_user` seeds `public.profiles` on signup.
- **Data API**: PostgREST. Every `public` table has explicit `GRANT`s
  and Row Level Security policies (see §4).
- **Edge Functions**: Deno runtime under `supabase/functions/`. The
  only deployed function today is `chat` — a streaming AI assistant
  that talks to the Lovable AI Gateway using tool-calling to query the
  catalog.
- **Storage**: no buckets provisioned yet.

> **Scope of this document.** Sections 1–8 describe what RoboPartPicker
> **owns**: the `public` schema, the `chat` edge function, and the
> project-level configuration. Section 9 (Appendix A) inventories the
> Supabase-managed schemas (`auth`, `storage`, `realtime`, `vault`,
> `extensions`, `supabase_migrations`) that ship with every Supabase
> project so this file is a complete backend picture, not a partial one.
> Those managed schemas are provisioned and migrated by Supabase itself
> — the app never issues DDL against them.

## 2. Environment / secrets

Server-side secrets (set in Supabase, never exposed to the browser):

| Name | Purpose |
| ---- | ------- |
| `SUPABASE_URL` | Base URL of the Supabase project |
| `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` | Public API key used by user-scoped requests in edge functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS; used inside the `chat` function for controlled writes |
| `SUPABASE_JWKS` | JWKS for verifying user JWTs |
| `SUPABASE_DB_URL` | Direct Postgres connection string |
| `LOVABLE_API_KEY` | Auth for the Lovable AI Gateway (`ai.gateway.lovable.dev`) |

Client-side (`.env`, safe to publish):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

## 3. Postgres object inventory


### 3.1 Enum types (schema `public`)

| Enum | Values |
| ---- | ------ |
| `app_role` | admin, moderator, user |
| `listing_condition` | new, like-new, used, for-parts |
| `listing_status` | active, sold, withdrawn |
| `part_status` | active, discontinued, preorder |
| `price_type` | fixed, quote, range |
| `user_role` | hobbyist, researcher, engineer, manufacturer |

### 3.2 Tables

The full column list, foreign keys, and RLS policies for every table
follow. All tables live in the `public` schema. Every table has RLS
enabled; policies whose role is `public` are enforced against both
anon and authenticated requests.


### 3.2 Tables (summary)

The catalog domain (`categories`, `manufacturers`, `parts`,
`part_suppliers`, `part_tags`, `compatibility_tags`, `suppliers`) is
world-readable and write-restricted (currently seeded via migrations
and admin flows).

The user-generated domain enforces strict per-user RLS:

| Table | Owner column | Public read? | Notes |
| ----- | ------------ | ------------ | ----- |
| `profiles` | `id` (= `auth.uid()`) | yes | Seeded by `handle_new_user` trigger on `auth.users` insert |
| `profile_flair` | `user_id` | yes | Cosmetic |
| `user_roles` | `user_id` | self only | `app_role` enum; checked via `public.has_role()` SECURITY DEFINER |
| `builds` | `user_id` | if `is_public` | Denormalized `like_count`; maintained by `bump_like_count` trigger |
| `build_parts` | via `builds.user_id` | if build visible (`build_is_visible`) | |
| `build_likes` | `user_id` | yes | Composite PK `(build_id, user_id)` |
| `build_comments` | `user_id` | if build visible | |
| `projects` | `owner_id` | if `visibility='public'` | Stores full RPPS package as JSONB |
| `project_versions` | via `projects.owner_id` | if project viewable | Immutable version snapshots |
| `marketplace_listings` | `seller_user_id` | if `status='active'` | |
| `contact_requests` | `buyer_user_id` / `seller_user_id` | parties only | |
| `chat_threads` | `user_id` | self only | Assistant conversations |
| `chat_messages` | `user_id` | self only | `parts` is AI-SDK `UIMessage.parts` JSONB |
| `forum_categories` | (seeded) | yes | |
| `forum_threads` | `user_id` | yes | `thread_type` ∈ {discussion, question, showcase, build-log, help}, `status` ∈ {open, solved, closed}. `accepted_post_id` gated by `set_accepted_answer` SECURITY DEFINER function |
| `forum_posts` | `user_id` | yes | Counters maintained by `forum_after_post_change` trigger |
| `forum_reactions` | `user_id` | yes | Counters maintained by `forum_after_reaction_change` trigger |

### 3.3 Functions (schema `public`)

- `has_role(_user_id uuid, _role app_role) → boolean` — SECURITY DEFINER lookup on `user_roles`, called from RLS policies to avoid recursion.
- `build_is_visible(_build_id uuid, _viewer uuid) → boolean` — SECURITY DEFINER visibility check reused by `builds` / `build_parts` / `build_comments` policies.
- `handle_new_user() → trigger` — SECURITY DEFINER; fires on `auth.users` insert, seeds `public.profiles` with a derived username.
- `set_updated_at() → trigger` — Generic `updated_at = now()` trigger.
- `bump_like_count() → trigger` — Maintains `builds.like_count` on `build_likes` insert/delete.
- `forum_after_post_change() → trigger` — Maintains `forum_threads.reply_count` and `last_activity_at`.
- `forum_after_reaction_change() → trigger` — Maintains reaction counters on posts/threads.
- `forum_reopen_on_accepted_delete() → trigger` — Reopens a solved question when its accepted post is deleted.
- `set_accepted_answer(_thread_id uuid, _post_id uuid) → void` — SECURITY DEFINER; the only path to set/clear `forum_threads.accepted_post_id`. Enforces that the caller is the thread author and the thread is a `question`.

### 3.4 Triggers

Triggers live directly on the tables that need them and are declared in
the migrations below. The main groups are:

- `handle_new_user` on `auth.users` (AFTER INSERT).
- `set_updated_at` on every table that has an `updated_at` column
  (`builds`, `chat_threads`, `forum_threads`, `marketplace_listings`,
  `profiles`, `profile_flair`, `projects`).
- `bump_like_count` on `build_likes` (AFTER INSERT/DELETE).
- `forum_after_post_change` on `forum_posts` (AFTER INSERT/DELETE).
- `forum_after_reaction_change` on `forum_reactions` (AFTER INSERT/DELETE).
- `forum_reopen_on_accepted_delete` on `forum_posts` (BEFORE DELETE).

### 3.5 Indexes (beyond primary keys)

Covering indexes are declared in the migrations. Notable ones:

- `builds_public_idx (is_public, like_count DESC)` — homepage/public feed.
- `builds_user_idx (user_id)` — “my builds”.
- `chat_threads_user_updated (user_id, updated_at DESC)` — assistant sidebar.
- `chat_messages_thread_created (thread_id, created_at)` — message stream.
- `contact_requests_seller_idx (seller_user_id, created_at DESC)` — seller inbox.
- `listings_status_idx (status, created_at DESC)` — marketplace feed.
- `idx_threads_activity`, `idx_threads_category`, `idx_threads_status`, `idx_threads_type`, `idx_threads_related` — forum sort/filter paths.
- `idx_posts_thread (thread_id, created_at)` — thread reply pagination.
- Unique indexes: `builds_slug_key`, `categories_slug_key`, `compatibility_tags_slug_key`, `forum_categories_slug_key`, `forum_threads_slug_key`, plus PK indexes on every table.

## 4. Row-Level Security summary

Every `public` table has RLS enabled. Access patterns:

- **Catalog reads** (`categories`, `manufacturers`, `parts`, `part_suppliers`, `part_tags`, `compatibility_tags`, `suppliers`, `forum_categories`, `forum_threads`, `forum_posts`, `forum_reactions`, `build_likes`, `profiles`, `profile_flair`): open to `public` role.
- **Owner writes**: user-owned rows use `auth.uid() = <owner_column>` for both `USING` and `WITH CHECK` on INSERT/UPDATE/DELETE.
- **Visibility-gated reads**: `builds` / `build_parts` / `build_comments` compose owner-or-public via `build_is_visible()`. `projects` / `project_versions` compose `visibility='public'` OR `owner_id = auth.uid()`. `marketplace_listings` shows `status='active'` OR owner.
- **Two-party reads**: `contact_requests` is visible to buyer and seller only.
- **Self-only tables**: `chat_threads`, `chat_messages`, `user_roles`.

`user_roles` is intentionally isolated from `profiles` (per Supabase
best practice); role checks always go through `has_role()`.

## 5. Edge Functions

### `chat` — `POST /functions/v1/chat`

- Runtime: Deno on Supabase.
- Auth: requires `Authorization: Bearer <access_token>` from a signed-in user; verifies claims via `supabase.auth.getClaims`.
- Body: `{ threadId: uuid, messages: UIMessage[] }` from the AI SDK.
- Behavior:
  1. Validates that the thread belongs to the caller.
  2. Persists the latest user `UIMessage` to `chat_messages` and updates thread title/`updated_at`.
  3. Streams a response using `streamText` against the Lovable AI Gateway model `google/gemini-2.5-flash`.
  4. Exposes tools that call Postgres via the service-role client:
     - `search_parts(query, category?, limit?)`
     - `get_part(slug)`
     - `search_projects(query, limit?)`
     - `get_project(slug)`
     - `list_categories()`
     - `estimate_bom_cost(items[{slug, qty}])`
  5. On completion, appends the assistant `UIMessage` to `chat_messages`.
- CORS: `Access-Control-Allow-Origin: *` (see `supabase/functions/_shared/cors.ts`).

## 6. Auth

- Provider: Supabase GoTrue.
- Providers enabled: email/password and Google OAuth.
- Signup side effect: `handle_new_user` trigger inserts a `profiles`
  row with a derived `username`.
- Client wrapper: `src/contexts/AuthContext.tsx` registers
  `onAuthStateChange` before calling `getSession`, and loads the
  profile via a deferred callback to avoid deadlocks inside the auth
  event.

## 7. Reproducing the backend elsewhere

1. Create a new Supabase project.
2. Set the secrets in §2 (only `LOVABLE_API_KEY` is external — the
   rest are auto-provisioned by Supabase).
3. Apply every SQL file under `supabase/migrations/` in filename
   order (they are timestamped).
4. Deploy `supabase/functions/chat` (Deno). It expects the shared
   `_shared/cors.ts` module.
5. Configure GoTrue: enable Email and Google providers; add your
   site URL to the allowed redirect list.
6. Point the frontend at the new project by updating
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and
   `VITE_SUPABASE_PROJECT_ID` in `.env`.

## 8. Source of truth — inline SQL

The following section inlines every migration so the doc is
self-contained. Files appear in creation order.


### `supabase/migrations/20260604061946_32f004b9-5258-4ec0-a76c-95f2995277da.sql`

```sql
GRANT SELECT ON public.forum_categories TO anon, authenticated;
GRANT ALL ON public.forum_categories TO service_role;

GRANT SELECT ON public.forum_threads TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.forum_threads TO authenticated;
GRANT ALL ON public.forum_threads TO service_role;

GRANT SELECT ON public.forum_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.forum_posts TO authenticated;
GRANT ALL ON public.forum_posts TO service_role;

GRANT SELECT ON public.forum_reactions TO anon, authenticated;
GRANT INSERT, DELETE ON public.forum_reactions TO authenticated;
GRANT ALL ON public.forum_reactions TO service_role;

GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

DROP TRIGGER IF EXISTS trg_forum_posts_count ON public.forum_posts;
CREATE TRIGGER trg_forum_posts_count
AFTER INSERT OR DELETE ON public.forum_posts
FOR EACH ROW EXECUTE FUNCTION public.forum_after_post_change();

DROP TRIGGER IF EXISTS trg_forum_reactions_count ON public.forum_reactions;
CREATE TRIGGER trg_forum_reactions_count
AFTER INSERT OR DELETE ON public.forum_reactions
FOR EACH ROW EXECUTE FUNCTION public.forum_after_reaction_change();

DROP TRIGGER IF EXISTS trg_forum_threads_updated ON public.forum_threads;
CREATE TRIGGER trg_forum_threads_updated
BEFORE UPDATE ON public.forum_threads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.forum_increment_view(_thread_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.forum_threads SET view_count = view_count + 1 WHERE id = _thread_id;
$$;
GRANT EXECUTE ON FUNCTION public.forum_increment_view(uuid) TO anon, authenticated;```

### `supabase/migrations/20260604062012_f07a795f-4e06-448a-95d0-428ad40c841d.sql`

```sql
REVOKE ALL ON FUNCTION public.forum_increment_view(uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.forum_increment_view(uuid);```

### `supabase/migrations/20260716080510_9fca9fd1-b404-4aac-8dbb-07b7c395828b.sql`

```sql

-- =========================================================
-- Projects + RPPS
-- =========================================================
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  summary text,
  description text,
  license text,
  version text NOT NULL DEFAULT '0.1.0',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','unlisted','private')),
  repo_url text,
  docs_url text,
  cover_image_url text,
  tags text[] NOT NULL DEFAULT '{}',
  difficulty text CHECK (difficulty IN ('beginner','intermediate','advanced','expert')),
  estimated_cost_usd numeric(12,2),
  reproducibility_score int CHECK (reproducibility_score BETWEEN 0 AND 100),
  rpps_version text NOT NULL DEFAULT '1.0.0',
  rpps jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projects_owner_idx ON public.projects(owner_id);
CREATE INDEX projects_visibility_status_idx ON public.projects(visibility, status);
CREATE INDEX projects_tags_idx ON public.projects USING gin(tags);

GRANT SELECT ON public.projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public projects are viewable by anyone"
  ON public.projects FOR SELECT
  USING (visibility = 'public' OR owner_id = auth.uid());

CREATE POLICY "owners insert own projects"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owners update own projects"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owners delete own projects"
  ON public.projects FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Project versions (revision history of the RPPS package)
-- =========================================================
CREATE TABLE public.project_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version text NOT NULL,
  changelog text,
  rpps jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE INDEX project_versions_project_idx ON public.project_versions(project_id, created_at DESC);

GRANT SELECT ON public.project_versions TO anon;
GRANT SELECT, INSERT, DELETE ON public.project_versions TO authenticated;
GRANT ALL ON public.project_versions TO service_role;

ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view versions when project is viewable"
  ON public.project_versions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_versions.project_id
      AND (p.visibility = 'public' OR p.owner_id = auth.uid())
  ));

CREATE POLICY "owner inserts versions"
  ON public.project_versions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_versions.project_id AND p.owner_id = auth.uid()
  ));

CREATE POLICY "owner deletes versions"
  ON public.project_versions FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_versions.project_id AND p.owner_id = auth.uid()
  ));
```

### `supabase/migrations/20260716085726_58a85992-1181-473e-8b51-3422ae370b01.sql`

```sql

CREATE TABLE public.chat_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own threads" ON public.chat_threads FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX chat_threads_user_updated ON public.chat_threads(user_id, updated_at DESC);

CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  parts JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.chat_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX chat_messages_thread_created ON public.chat_messages(thread_id, created_at);
```

### `supabase/migrations/20260717025038_6c5263df-6335-4de8-9ef5-ebf00e056f96.sql`

```sql

-- Add structured technical fields to forum_threads
ALTER TABLE public.forum_threads
  ADD COLUMN IF NOT EXISTS thread_type text NOT NULL DEFAULT 'discussion',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS related_entity_type text,
  ADD COLUMN IF NOT EXISTS related_entity_id text,
  ADD COLUMN IF NOT EXISTS accepted_post_id uuid;

-- Constrain enum-like values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forum_threads_thread_type_check') THEN
    ALTER TABLE public.forum_threads
      ADD CONSTRAINT forum_threads_thread_type_check
      CHECK (thread_type IN ('question','discussion','build_log','integration_report','bom_correction','supplier_report','teardown','project_update'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forum_threads_status_check') THEN
    ALTER TABLE public.forum_threads
      ADD CONSTRAINT forum_threads_status_check
      CHECK (status IN ('open','solved','closed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forum_threads_related_entity_type_check') THEN
    ALTER TABLE public.forum_threads
      ADD CONSTRAINT forum_threads_related_entity_type_check
      CHECK (related_entity_type IS NULL OR related_entity_type IN ('project','component','marketplace_listing','build'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forum_threads_related_entity_consistency_check') THEN
    ALTER TABLE public.forum_threads
      ADD CONSTRAINT forum_threads_related_entity_consistency_check
      CHECK ((related_entity_type IS NULL AND related_entity_id IS NULL) OR (related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forum_threads_accepted_post_fk') THEN
    ALTER TABLE public.forum_threads
      ADD CONSTRAINT forum_threads_accepted_post_fk
      FOREIGN KEY (accepted_post_id) REFERENCES public.forum_posts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_threads_type ON public.forum_threads(thread_type, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_status ON public.forum_threads(status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_related ON public.forum_threads(related_entity_type, related_entity_id);
```

### `supabase/migrations/20260718073455_c2071b68-aee5-4847-9b88-a310867cff10.sql`

```sql

ALTER TABLE public.forum_threads
  ADD COLUMN IF NOT EXISTS structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS linked_entity_label text,
  ADD COLUMN IF NOT EXISTS linked_entity_path text;

ALTER TABLE public.forum_threads
  DROP CONSTRAINT IF EXISTS forum_threads_linked_entity_path_check;
ALTER TABLE public.forum_threads
  ADD CONSTRAINT forum_threads_linked_entity_path_check
  CHECK (
    linked_entity_path IS NULL
    OR linked_entity_path ~ '^/[A-Za-z0-9/_%\-\?\=\&\.\#]{0,300}$'
  );

ALTER TABLE public.forum_threads
  DROP CONSTRAINT IF EXISTS forum_threads_thread_type_check;
ALTER TABLE public.forum_threads
  ADD CONSTRAINT forum_threads_thread_type_check
  CHECK (thread_type IN (
    'question','discussion','build_log','integration_report',
    'substitution_report','bom_correction','supplier_report',
    'teardown','project_update','measured_test'
  ));

CREATE OR REPLACE FUNCTION public.set_accepted_answer(_thread_id uuid, _post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _cur_status text;
BEGIN
  SELECT user_id, status INTO _owner, _cur_status
    FROM public.forum_threads WHERE id = _thread_id;
  IF _owner IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  IF auth.uid() IS NULL OR _owner <> auth.uid() THEN
    RAISE EXCEPTION 'only the thread author can change the accepted answer';
  END IF;
  IF _post_id IS NULL THEN
    UPDATE public.forum_threads
       SET accepted_post_id = NULL,
           status = CASE WHEN _cur_status = 'solved' THEN 'open' ELSE _cur_status END
     WHERE id = _thread_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.forum_posts
       WHERE id = _post_id AND thread_id = _thread_id
    ) THEN
      RAISE EXCEPTION 'post does not belong to this thread';
    END IF;
    UPDATE public.forum_threads
       SET accepted_post_id = _post_id, status = 'solved'
     WHERE id = _thread_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_accepted_answer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_accepted_answer(uuid, uuid) TO authenticated;
```

### `supabase/migrations/20260718204255_06b9eee8-1393-405e-b714-1ea31f77a74e.sql`

```sql
-- 1) Tighten linked_entity_path CHECK to reject protocol-relative and unsafe characters.
ALTER TABLE public.forum_threads
  DROP CONSTRAINT IF EXISTS forum_threads_linked_entity_path_check;

ALTER TABLE public.forum_threads
  ADD CONSTRAINT forum_threads_linked_entity_path_check CHECK (
    linked_entity_path IS NULL
    OR (
      length(linked_entity_path) <= 301
      AND left(linked_entity_path, 1) = '/'
      AND left(linked_entity_path, 2) <> '//'
      AND linked_entity_path !~ '[\\\x00-\x1F\x7F]'
      AND linked_entity_path ~ '^/[A-Za-z0-9/_%\-\?\=\&\.\#]{0,300}$'
    )
  );

-- 2) Allow 'supplier' as a related entity type (in addition to existing types).
--    Existing constraint (if any) is dropped and re-added to include supplier.
ALTER TABLE public.forum_threads
  DROP CONSTRAINT IF EXISTS forum_threads_related_entity_type_check;
ALTER TABLE public.forum_threads
  ADD CONSTRAINT forum_threads_related_entity_type_check CHECK (
    related_entity_type IS NULL
    OR related_entity_type IN ('project','component','marketplace_listing','build','supplier')
  );

-- 3) Restrict accepted answers to question threads; keep owner + belongs-to-thread guards.
CREATE OR REPLACE FUNCTION public.set_accepted_answer(_thread_id uuid, _post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _cur_status text;
  _ttype text;
BEGIN
  SELECT user_id, status, thread_type INTO _owner, _cur_status, _ttype
    FROM public.forum_threads WHERE id = _thread_id;
  IF _owner IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  IF auth.uid() IS NULL OR _owner <> auth.uid() THEN
    RAISE EXCEPTION 'only the thread author can change the accepted answer';
  END IF;
  IF _ttype <> 'question' THEN
    RAISE EXCEPTION 'accepted answers are only allowed on question threads';
  END IF;
  IF _post_id IS NULL THEN
    UPDATE public.forum_threads
       SET accepted_post_id = NULL,
           status = CASE WHEN _cur_status = 'solved' THEN 'open' ELSE _cur_status END
     WHERE id = _thread_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.forum_posts
       WHERE id = _post_id AND thread_id = _thread_id
    ) THEN
      RAISE EXCEPTION 'post does not belong to this thread';
    END IF;
    UPDATE public.forum_threads
       SET accepted_post_id = _post_id, status = 'solved'
     WHERE id = _thread_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_accepted_answer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_accepted_answer(uuid, uuid) TO authenticated;

-- 4) When the accepted post is deleted, reopen the thread if it was solved.
--    The FK already SETs accepted_post_id to NULL on delete, but status stays 'solved'.
CREATE OR REPLACE FUNCTION public.forum_reopen_on_accepted_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.forum_threads
     SET status = 'open'
   WHERE id = OLD.thread_id
     AND accepted_post_id IS NULL
     AND status = 'solved';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_forum_reopen_on_accepted_delete ON public.forum_posts;
CREATE TRIGGER trg_forum_reopen_on_accepted_delete
AFTER DELETE ON public.forum_posts
FOR EACH ROW EXECUTE FUNCTION public.forum_reopen_on_accepted_delete();
```

### `supabase/migrations/20260718205105_da94cc17-2e22-4c1c-a9f5-54e5d04d3a35.sql`

```sql
-- Drop and recreate so the parameter default (NULL for _post_id) is reflected
-- in generated Supabase types, letting the client call the RPC without casts.
DROP FUNCTION IF EXISTS public.set_accepted_answer(uuid, uuid);

CREATE OR REPLACE FUNCTION public.set_accepted_answer(_thread_id uuid, _post_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _cur_status text;
  _ttype text;
BEGIN
  SELECT user_id, status, thread_type INTO _owner, _cur_status, _ttype
    FROM public.forum_threads WHERE id = _thread_id;
  IF _owner IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  IF auth.uid() IS NULL OR _owner <> auth.uid() THEN
    RAISE EXCEPTION 'only the thread author can change the accepted answer';
  END IF;
  IF _ttype <> 'question' THEN
    RAISE EXCEPTION 'accepted answers are only allowed on question threads';
  END IF;
  IF _post_id IS NULL THEN
    UPDATE public.forum_threads
       SET accepted_post_id = NULL,
           status = CASE WHEN _cur_status = 'solved' THEN 'open' ELSE _cur_status END
     WHERE id = _thread_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.forum_posts
       WHERE id = _post_id AND thread_id = _thread_id
    ) THEN
      RAISE EXCEPTION 'post does not belong to this thread';
    END IF;
    UPDATE public.forum_threads
       SET accepted_post_id = _post_id, status = 'solved'
     WHERE id = _thread_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_accepted_answer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_accepted_answer(uuid, uuid) TO authenticated;
```

### `supabase/migrations/20260718205904_3b112fd3-7693-4808-9457-c1e5136a4116.sql`

```sql
-- Replace the AFTER DELETE trigger with a BEFORE DELETE trigger that is
-- independent of foreign-key trigger ordering and only touches the thread
-- when the deleted reply is the currently accepted answer.
DROP TRIGGER IF EXISTS trg_forum_reopen_on_accepted_delete ON public.forum_posts;

CREATE OR REPLACE FUNCTION public.forum_reopen_on_accepted_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.forum_threads
     SET accepted_post_id = NULL,
         status = CASE WHEN status = 'solved' THEN 'open' ELSE status END
   WHERE id = OLD.thread_id
     AND accepted_post_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_forum_reopen_on_accepted_delete
BEFORE DELETE ON public.forum_posts
FOR EACH ROW EXECUTE FUNCTION public.forum_reopen_on_accepted_delete();
```

## 9. Source of truth — Edge Function code

### `supabase/functions/_shared/cors.ts`

```ts
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};```

### `supabase/functions/chat/index.ts`

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "npm:ai@5";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@1";
import { z } from "npm:zod@3";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const gateway = createOpenAICompatible({
  name: "lovable",
  baseURL: "https://ai.gateway.lovable.dev/v1",
  headers: { "Lovable-API-Key": LOVABLE_API_KEY },
});

const SYSTEM = `You are the RoboPartPicker Build Assistant.

You help users design, spec, cost, and troubleshoot open-source robotics builds. You are grounded in this app's catalog of parts, suppliers, projects (RPPS), BOMs, and community builds.

Rules:
- Prefer using tools to look up real data instead of guessing. Never invent SKUs, prices, or project details.
- When recommending parts, cite them by name and category from the catalog.
- When discussing projects, use the exact slug so links resolve (/projects/<slug>, /parts/<category>/<slug>).
- Use concise, technical language. Include units (mm, N·m, V, A, W). Prefer markdown tables for BOM comparisons.
- If the user asks about pricing, use search_parts and mention the currency and that pricing comes from listed suppliers.
- If nothing is found, say so plainly and suggest a related search.`;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json();
    const messages: UIMessage[] = body.messages ?? [];
    const threadId: string = body.threadId;
    if (!threadId) return json({ error: "threadId required" }, 400);

    const db = admin();

    // Verify thread ownership
    const { data: thread } = await db.from("chat_threads").select("id,user_id,title").eq("id", threadId).maybeSingle();
    if (!thread || thread.user_id !== userId) return json({ error: "Thread not found" }, 404);

    // Persist the latest user message
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      await db.from("chat_messages").insert({
        thread_id: threadId,
        user_id: userId,
        role: "user",
        parts: lastUser.parts as unknown as object,
      });
      // Auto-title on first user turn
      if (thread.title === "New chat") {
        const text = extractText(lastUser).slice(0, 80);
        if (text) await db.from("chat_threads").update({ title: text, updated_at: new Date().toISOString() }).eq("id", threadId);
      } else {
        await db.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
      }
    }

    const tools = {
      search_parts: tool({
        description: "Search the parts catalog by keyword and optional category slug (e.g. motors, mcu, sensors). Returns up to 10 parts with name, slug, category, manufacturer, and price range.",
        inputSchema: z.object({
          query: z.string().describe("Free-text search across part name and description"),
          category: z.string().optional().describe("Optional category slug filter"),
          limit: z.number().optional().default(10),
        }),
        execute: async ({ query, category, limit }) => {
          let q = db
            .from("parts")
            .select("id,name,slug,description,price_min,price_max,currency,category_id,manufacturer_id,categories(slug,name),manufacturers(name)")
            .limit(Math.min(limit ?? 10, 20));
          if (query) q = q.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
          if (category) {
            const { data: cat } = await db.from("categories").select("id").eq("slug", category).maybeSingle();
            if (cat) q = q.eq("category_id", cat.id);
          }
          const { data, error } = await q;
          if (error) return { error: error.message };
          return { results: (data ?? []).map((p: any) => ({
            slug: p.slug,
            name: p.name,
            category: p.categories?.slug,
            manufacturer: p.manufacturers?.name,
            price: p.price_min && p.price_max ? `${p.price_min}-${p.price_max} ${p.currency ?? "USD"}` : null,
            summary: (p.description ?? "").slice(0, 200),
            url: p.categories?.slug ? `/parts/${p.categories.slug}/${p.slug}` : null,
          })) };
        },
      }),
      get_part: tool({
        description: "Fetch full details for a single part by its slug, including suppliers and tags.",
        inputSchema: z.object({ slug: z.string() }),
        execute: async ({ slug }) => {
          const { data, error } = await db
            .from("parts")
            .select("*,categories(slug,name),manufacturers(name,website),part_suppliers(price,currency,url,in_stock,suppliers(name,slug))")
            .eq("slug", slug)
            .maybeSingle();
          if (error) return { error: error.message };
          if (!data) return { error: "Not found" };
          return data;
        },
      }),
      search_projects: tool({
        description: "Search standardized (RPPS) projects and community builds by title or description.",
        inputSchema: z.object({ query: z.string(), limit: z.number().optional().default(8) }),
        execute: async ({ query, limit }) => {
          const { data, error } = await db
            .from("projects")
            .select("slug,title,summary,status,difficulty,estimated_cost")
            .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)
            .limit(Math.min(limit ?? 8, 20));
          if (error) return { error: error.message };
          return { results: (data ?? []).map((p: any) => ({ ...p, url: `/projects/${p.slug}` })) };
        },
      }),
      get_project: tool({
        description: "Fetch a standardized project with its latest RPPS version (BOM, assembly steps).",
        inputSchema: z.object({ slug: z.string() }),
        execute: async ({ slug }) => {
          const { data: project } = await db.from("projects").select("*").eq("slug", slug).maybeSingle();
          if (!project) return { error: "Not found" };
          const { data: versions } = await db
            .from("project_versions")
            .select("*")
            .eq("project_id", project.id)
            .order("created_at", { ascending: false })
            .limit(1);
          return { project, latestVersion: versions?.[0] ?? null };
        },
      }),
      list_categories: tool({
        description: "List all part categories available in the catalog.",
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await db.from("categories").select("slug,name,description");
          return { categories: data ?? [] };
        },
      }),
      estimate_bom_cost: tool({
        description: "Given a list of {slug, qty} entries, compute an estimated total cost using the median of listed supplier prices per part.",
        inputSchema: z.object({
          items: z.array(z.object({ slug: z.string(), qty: z.number().int().positive() })).min(1),
        }),
        execute: async ({ items }) => {
          const rows: any[] = [];
          let total = 0;
          let currency = "USD";
          for (const it of items) {
            const { data: part } = await db
              .from("parts")
              .select("id,name,slug,price_min,price_max,currency,part_suppliers(price,currency)")
              .eq("slug", it.slug)
              .maybeSingle();
            if (!part) { rows.push({ slug: it.slug, error: "not found" }); continue; }
            const supplierPrices = (part.part_suppliers ?? []).map((s: any) => s.price).filter((n: any) => typeof n === "number");
            const price = median(supplierPrices) ?? part.price_min ?? part.price_max ?? 0;
            currency = part.currency ?? currency;
            const line = price * it.qty;
            total += line;
            rows.push({ slug: it.slug, name: part.name, qty: it.qty, unit_price: price, line_total: line });
          }
          return { currency, total: Math.round(total * 100) / 100, rows };
        },
      }),
    };

    const result = streamText({
      model: gateway.chatModel("google/gemini-2.5-flash"),
      system: SYSTEM,
      messages: convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(50),
    });

    return result.toUIMessageStreamResponse({
      headers: corsHeaders,
      originalMessages: messages,
      onFinish: async ({ responseMessage }) => {
        try {
          await db.from("chat_messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "assistant",
            parts: responseMessage.parts as unknown as object,
          });
          await db.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
        } catch (e) {
          console.error("persist assistant failed", e);
        }
      },
    });
  } catch (e) {
    console.error("chat error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function extractText(m: UIMessage): string {
  return (m.parts ?? [])
    .map((p: any) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
}

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}```

---

## 9. Appendix A — Full backend inventory (all schemas)

This appendix enumerates **every schema, extension, enum, table,
trigger, storage bucket, and secret** present on the live backend, not
just the `public` schema the app owns. It is generated from live
`pg_catalog` and Supabase management APIs.

### 9.1 Schemas

| Schema | Owner | Purpose |
| ------ | ----- | ------- |
| `public` | app | All RoboPartPicker domain tables. Full spec in §3–§4. |
| `auth` | Supabase (GoTrue) | Users, sessions, identities, MFA, SSO, OAuth clients. Never modified by the app; referenced via `auth.users(id)` foreign keys and `auth.uid()` in RLS. |
| `storage` | Supabase | Object storage metadata (`buckets`, `objects`, `s3_multipart_uploads`, analytics/vector buckets). No buckets are currently provisioned by the app. |
| `realtime` | Supabase | Realtime broadcast/presence internals and partitioned `messages` table. Not currently subscribed to by the client. |
| `vault` | Supabase (`supabase_vault` ext) | Encrypted secrets store (`vault.secrets`, view `vault.decrypted_secrets`). |
| `extensions` | Supabase | Namespace for installed extensions (`pgcrypto`, `uuid-ossp`, `pg_stat_statements`). |
| `supabase_migrations` | Supabase | Migration bookkeeping (`schema_migrations`). Written to by the migration tool; do not edit. |

### 9.2 Installed Postgres extensions

| Extension | Version | Schema | Used for |
| --------- | ------- | ------ | -------- |
| `plpgsql` | 1.0 | `pg_catalog` | Trigger and function language. |
| `pgcrypto` | 1.3 | `extensions` | `gen_random_uuid()` for all `id` defaults. |
| `uuid-ossp` | 1.1 | `extensions` | Legacy UUID helpers (available, not currently required). |
| `pg_stat_statements` | 1.11 | `extensions` | Query performance stats (used by Supabase dashboards). |
| `supabase_vault` | 0.3.1 | `vault` | Encrypted secret storage. |

### 9.3 Enum types

**`public` (app-owned):**

- `app_role` = `admin, moderator, user`
- `listing_condition` = `new, like-new, used, for-parts`
- `listing_status` = `active, sold, withdrawn`
- `part_status` = `active, discontinued, preorder`
- `price_type` = `fixed, quote, range`
- `user_role` = `hobbyist, researcher, engineer, manufacturer`

**`auth` (Supabase-managed, listed for completeness):**

- `aal_level` = `aal1, aal2, aal3`
- `code_challenge_method` = `s256, plain`
- `factor_status` = `unverified, verified`
- `factor_type` = `totp, webauthn, phone`
- `oauth_authorization_status` = `pending, approved, denied, expired`
- `oauth_client_type` = `public, confidential`
- `oauth_registration_type` = `dynamic, manual`
- `oauth_response_type` = `code`
- `one_time_token_type` = `confirmation_token, reauthentication_token, recovery_token, email_change_token_new, email_change_token_current, phone_change_token`

**`storage`:** `buckettype` = `STANDARD, ANALYTICS, VECTOR`
**`realtime`:** `action` = `INSERT, UPDATE, DELETE, TRUNCATE, ERROR`; `equality_op` = `eq, neq, lt, lte, gt, gte, in`

### 9.4 `auth` schema (GoTrue) — table inventory

Managed by Supabase. The app reads `auth.users(id, email, raw_user_meta_data)` only via the `handle_new_user` trigger and RLS `auth.uid()` helper. Tables present on the instance:

`audit_log_entries`, `custom_oauth_providers`, `flow_state`, `identities`, `instances`, `mfa_amr_claims`, `mfa_challenges`, `mfa_factors`, `oauth_authorizations`, `oauth_client_states`, `oauth_clients`, `oauth_consents`, `one_time_tokens`, `refresh_tokens`, `saml_providers`, `saml_relay_states`, `schema_migrations`, `sessions`, `sso_domains`, `sso_providers`, `users`, `webauthn_challenges`, `webauthn_credentials`.

**Auth configuration (Lovable Cloud managed):**

- Providers enabled: Email/password, Google OAuth.
- `auto_confirm_email = true` (no email verification round-trip; see §6).
- Anonymous sign-ups: disabled.
- JWT signing keys: rotated via Supabase's signing-keys system; JWKS exposed as `SUPABASE_JWKS` and validated in code by edge functions.
- `supabase/config.toml` contains only `project_id`; all other auth settings live in Lovable Cloud and are re-applied at project restore time.

### 9.5 `storage` schema — buckets and tables

- Tables present: `buckets`, `buckets_analytics`, `buckets_vectors`, `migrations`, `objects`, `s3_multipart_uploads`, `s3_multipart_uploads_parts`, `vector_indexes`.
- **Buckets provisioned: none.** The app does not currently store user files. To add one, use the `supabase--storage_create_bucket` tool — do not `INSERT` into `storage.buckets` directly.

### 9.6 `realtime` schema

- Partitioned table `realtime.messages` with weekly partitions (`messages_2026_06_02` … `messages_2026_06_06`) plus `subscription` and `schema_migrations`.
- **No `public` tables are added to any realtime publication.** The client uses request/response only; add tables to `supabase_realtime` publication if live updates are needed later.

### 9.7 `vault` schema

- `vault.secrets` (encrypted) and `vault.decrypted_secrets` view. Not written to by the app; reserved for future use (e.g. per-tenant API keys). Access is restricted to `service_role`.

### 9.8 `public` — functions (complete list)

| Name | Args | Returns | Language | `SECURITY DEFINER` |
| ---- | ---- | ------- | -------- | ------------------ |
| `build_is_visible` | `_build_id uuid, _viewer uuid` | `boolean` | sql | yes |
| `bump_like_count` | — | `trigger` | plpgsql | no |
| `forum_after_post_change` | — | `trigger` | plpgsql | no |
| `forum_after_reaction_change` | — | `trigger` | plpgsql | no |
| `forum_reopen_on_accepted_delete` | — | `trigger` | plpgsql | no |
| `handle_new_user` | — | `trigger` | plpgsql | yes |
| `has_role` | `_user_id uuid, _role app_role` | `boolean` | sql | yes |
| `set_accepted_answer` | `_thread_id uuid, _post_id uuid` | `void` | plpgsql | yes |
| `set_updated_at` | — | `trigger` | plpgsql | no |

Bodies for every function are inlined verbatim in §7 (Source of truth) via the migration files.

### 9.9 Server-side secrets (complete list)

Set inside Lovable Cloud; never shipped to the browser. The Service Role Key and DB password are **not retrievable** from the Lovable Cloud UI.

| Name | Origin | Consumers |
| ---- | ------ | --------- |
| `SUPABASE_URL` | auto | edge functions |
| `SUPABASE_ANON_KEY` | auto | edge functions (user-scoped calls) |
| `SUPABASE_PUBLISHABLE_KEY` | auto | edge functions |
| `SUPABASE_PUBLISHABLE_KEYS` | auto | key-rotation bundle |
| `SUPABASE_SECRET_KEYS` | auto | key-rotation bundle |
| `SUPABASE_SERVICE_ROLE_KEY` | auto | `chat` function for controlled writes |
| `SUPABASE_JWKS` | auto | JWT verification |
| `SUPABASE_DB_URL` | auto | direct Postgres access (admin/tooling) |
| `LOVABLE_API_KEY` | Lovable | `chat` function → Lovable AI Gateway |

### 9.10 Edge functions (complete list)

- `chat` — streaming AI assistant. Specification in §5. `verify_jwt = false` at the platform edge; JWT validated in code.

No other functions are deployed.

### 9.11 Reproducing the *entire* backend on a fresh Supabase project

1. Create a new Supabase project. `auth`, `storage`, `realtime`, `vault`, `extensions`, and `supabase_migrations` are provisioned automatically — nothing to do.
2. Enable extensions (already listed in §9.2): `pgcrypto`, `uuid-ossp`, `pg_stat_statements`. `supabase_vault` is on by default.
3. Apply every SQL file in `supabase/migrations/` in filename order. This creates all `public` enums, tables, GRANTs, RLS policies, triggers, and functions.
4. Configure auth: enable Email provider with `auto_confirm_email = true`, enable Google OAuth (client id + secret), disable anonymous sign-ups.
5. Set the secrets in §9.9 (`LOVABLE_API_KEY` is the only non-auto secret — obtain from Lovable).
6. Deploy `supabase/functions/chat/` with `verify_jwt = false`.
7. `.env` for the frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.

That reproduces the backend end-to-end, including every schema Supabase manages on our behalf.
