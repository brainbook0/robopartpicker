CREATE TABLE builds (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  owner_user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  source_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  source_project_version_id TEXT REFERENCES project_versions(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'organization', 'unlisted', 'public')),
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'sourcing', 'building', 'testing', 'complete', 'paused', 'archived')),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
  current_version_id TEXT,
  forked_from_build_id TEXT REFERENCES builds(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (owner_user_id IS NOT NULL OR organization_id IS NOT NULL),
  UNIQUE (owner_user_id, slug)
);

CREATE TABLE build_members (
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (build_id, user_id)
);

CREATE TABLE build_versions (
  id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  summary TEXT,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (build_id, version_number)
);

CREATE TABLE build_items (
  id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  component_id TEXT REFERENCES components(id) ON DELETE SET NULL,
  source_bom_item_id TEXT REFERENCES bom_items(id) ON DELETE SET NULL,
  selected_supplier_offer_id TEXT REFERENCES supplier_offers(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'each',
  unit_cost_minor INTEGER CHECK (unit_cost_minor IS NULL OR unit_cost_minor >= 0),
  status TEXT NOT NULL DEFAULT 'needed' CHECK (status IN ('needed', 'selected', 'ordered', 'purchased', 'fabricated', 'installed', 'replaced', 'skipped')),
  substituted_for_item_id TEXT REFERENCES build_items(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE build_steps (
  id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  source_project_step_id TEXT REFERENCES project_steps(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'blocked', 'in_progress', 'complete', 'skipped')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE build_step_dependencies (
  build_step_id TEXT NOT NULL REFERENCES build_steps(id) ON DELETE CASCADE,
  depends_on_step_id TEXT NOT NULL REFERENCES build_steps(id) ON DELETE CASCADE,
  PRIMARY KEY (build_step_id, depends_on_step_id),
  CHECK (build_step_id <> depends_on_step_id)
);

CREATE TABLE build_files (
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  build_step_id TEXT REFERENCES build_steps(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (build_id, file_id)
);

CREATE TABLE build_configurations (
  id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  format TEXT NOT NULL,
  content_text TEXT,
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (content_text IS NOT NULL OR file_id IS NOT NULL)
);

CREATE TABLE build_firmware (
  id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  repository_url TEXT,
  revision TEXT,
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  license_spdx TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE build_calibrations (
  id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  procedure_text TEXT,
  result_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(result_json)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'superseded')),
  performed_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  performed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE build_tests (
  id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  method_text TEXT NOT NULL,
  expected_text TEXT,
  observed_text TEXT,
  result TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'passed', 'failed', 'inconclusive')),
  evidence_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  performed_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  performed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE build_problems (
  id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  reported_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE build_resolutions (
  id TEXT PRIMARY KEY,
  build_problem_id TEXT NOT NULL REFERENCES build_problems(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  root_cause TEXT,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  resolved_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE build_decisions (
  id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  context TEXT,
  decision TEXT NOT NULL,
  consequences TEXT,
  decided_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  decided_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE build_activity (
  id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  summary TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL
);

CREATE TABLE forum_categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#eab308',
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE forum_threads (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES forum_categories(id) ON DELETE RESTRICT,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  body TEXT NOT NULL,
  thread_type TEXT NOT NULL CHECK (thread_type IN ('question', 'discussion', 'build_log', 'integration_report', 'substitution_report', 'bom_correction', 'supplier_report', 'teardown', 'project_update', 'measured_test')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'solved', 'closed')),
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
  structured_data_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(structured_data_json)),
  related_entity_type TEXT CHECK (related_entity_type IS NULL OR related_entity_type IN ('project', 'component', 'marketplace_listing', 'build', 'supplier')),
  related_entity_id TEXT,
  linked_entity_label TEXT,
  linked_entity_path TEXT,
  accepted_post_id TEXT REFERENCES forum_posts(id) ON DELETE SET NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  reply_count INTEGER NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
  reaction_count INTEGER NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
  last_activity_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE forum_posts (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES forum_posts(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  reaction_count INTEGER NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
  created_at TEXT NOT NULL,
  edited_at TEXT,
  deleted_at TEXT
);

CREATE TABLE forum_reactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  thread_id TEXT REFERENCES forum_threads(id) ON DELETE CASCADE,
  post_id TEXT REFERENCES forum_posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  CHECK ((thread_id IS NOT NULL AND post_id IS NULL) OR (thread_id IS NULL AND post_id IS NOT NULL))
);

CREATE TABLE forum_bookmarks (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, thread_id)
);

CREATE TABLE forum_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  thread_id TEXT REFERENCES forum_threads(id) ON DELETE CASCADE,
  post_id TEXT REFERENCES forum_posts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  structured_data_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(structured_data_json)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK (thread_id IS NOT NULL OR post_id IS NOT NULL)
);

CREATE TABLE forum_moderation_actions (
  id TEXT PRIMARY KEY,
  moderator_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  report_id TEXT REFERENCES forum_reports(id) ON DELETE SET NULL,
  thread_id TEXT REFERENCES forum_threads(id) ON DELETE SET NULL,
  post_id TEXT REFERENCES forum_posts(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL
);

CREATE TRIGGER forum_validate_accepted_answer
BEFORE UPDATE OF accepted_post_id ON forum_threads
WHEN NEW.accepted_post_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NEW.thread_type <> 'question'
    THEN RAISE(ABORT, 'accepted answers are only valid for question threads') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM forum_posts p WHERE p.id = NEW.accepted_post_id AND p.thread_id = NEW.id AND p.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'accepted post must belong to the thread') END;
END;

CREATE TRIGGER forum_reopen_before_accepted_post_delete
BEFORE DELETE ON forum_posts
BEGIN
  UPDATE forum_threads
  SET accepted_post_id = NULL,
      status = CASE WHEN thread_type = 'question' THEN 'open' ELSE status END,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE accepted_post_id = OLD.id;
END;

CREATE TRIGGER forum_post_insert_count
AFTER INSERT ON forum_posts
BEGIN
  UPDATE forum_threads
  SET reply_count = reply_count + 1,
      last_activity_at = NEW.created_at,
      updated_at = NEW.created_at
  WHERE id = NEW.thread_id;
END;

CREATE TRIGGER forum_post_delete_count
AFTER DELETE ON forum_posts
BEGIN
  UPDATE forum_threads
  SET reply_count = MAX(reply_count - 1, 0),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.thread_id;
END;

CREATE TRIGGER forum_reaction_post_insert_count
AFTER INSERT ON forum_reactions WHEN NEW.post_id IS NOT NULL
BEGIN
  UPDATE forum_posts SET reaction_count = reaction_count + 1 WHERE id = NEW.post_id;
END;

CREATE TRIGGER forum_reaction_post_delete_count
AFTER DELETE ON forum_reactions WHEN OLD.post_id IS NOT NULL
BEGIN
  UPDATE forum_posts SET reaction_count = MAX(reaction_count - 1, 0) WHERE id = OLD.post_id;
END;

CREATE TRIGGER forum_reaction_thread_insert_count
AFTER INSERT ON forum_reactions WHEN NEW.thread_id IS NOT NULL
BEGIN
  UPDATE forum_threads SET reaction_count = reaction_count + 1 WHERE id = NEW.thread_id;
END;

CREATE TRIGGER forum_reaction_thread_delete_count
AFTER DELETE ON forum_reactions WHEN OLD.thread_id IS NOT NULL
BEGIN
  UPDATE forum_threads SET reaction_count = MAX(reaction_count - 1, 0) WHERE id = OLD.thread_id;
END;

CREATE TABLE marketplace_listings (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  seller_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  listing_type TEXT NOT NULL DEFAULT 'sell' CHECK (listing_type IN ('sell', 'wanted', 'service')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  condition_grade TEXT CHECK (condition_grade IS NULL OR condition_grade IN ('A', 'B', 'C', 'untested', 'for_parts', 'not_applicable')),
  currency TEXT CHECK (currency IS NULL OR length(currency) = 3),
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
  region_code TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'reserved', 'sold', 'fulfilled', 'expired', 'withdrawn', 'removed')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('private', 'organization', 'unlisted', 'public')),
  source_build_id TEXT REFERENCES builds(id) ON DELETE SET NULL,
  source_component_id TEXT REFERENCES components(id) ON DELETE SET NULL,
  expires_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  deleted_at TEXT,
  CHECK (seller_user_id IS NOT NULL OR organization_id IS NOT NULL OR is_demo = 1)
);

CREATE TABLE marketplace_listing_images (
  listing_id TEXT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, file_id)
);

CREATE TABLE marketplace_listing_items (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  component_id TEXT REFERENCES components(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  notes TEXT
);

CREATE TABLE marketplace_saves (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE marketplace_inquiries (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  buyer_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  seller_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'blocked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE marketplace_offers (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL REFERENCES marketplace_inquiries(id) ON DELETE CASCADE,
  offered_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'accepted', 'declined', 'withdrawn', 'expired')),
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE marketplace_messages (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL REFERENCES marketplace_inquiries(id) ON DELETE CASCADE,
  sender_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  attachment_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE marketplace_reports (
  id TEXT PRIMARY KEY,
  listing_id TEXT REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  inquiry_id TEXT REFERENCES marketplace_inquiries(id) ON DELETE SET NULL,
  reporter_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK (listing_id IS NOT NULL OR inquiry_id IS NOT NULL)
);

CREATE TABLE marketplace_moderation_actions (
  id TEXT PRIMARY KEY,
  moderator_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  report_id TEXT REFERENCES marketplace_reports(id) ON DELETE SET NULL,
  listing_id TEXT REFERENCES marketplace_listings(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE marketplace_transactions (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES marketplace_listings(id) ON DELETE RESTRICT,
  marketplace_offer_id TEXT REFERENCES marketplace_offers(id) ON DELETE SET NULL,
  seller_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  buyer_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  quantity REAL NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'cancelled', 'completed')),
  external_provider TEXT,
  external_reference TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX builds_owner_updated_idx ON builds(owner_user_id, updated_at DESC);
CREATE INDEX builds_org_updated_idx ON builds(organization_id, updated_at DESC);
CREATE INDEX builds_visibility_status_idx ON builds(visibility, status, updated_at DESC);
CREATE INDEX build_items_build_status_idx ON build_items(build_id, status);
CREATE INDEX build_steps_build_sort_idx ON build_steps(build_id, sort_order);
CREATE INDEX build_activity_build_created_idx ON build_activity(build_id, created_at DESC);
CREATE INDEX forum_threads_category_activity_idx ON forum_threads(category_id, last_activity_at DESC);
CREATE INDEX forum_threads_type_status_idx ON forum_threads(thread_type, status, last_activity_at DESC);
CREATE INDEX forum_threads_related_idx ON forum_threads(related_entity_type, related_entity_id);
CREATE INDEX forum_posts_thread_created_idx ON forum_posts(thread_id, created_at);
CREATE UNIQUE INDEX forum_reactions_thread_unique_idx ON forum_reactions(user_id, thread_id, emoji) WHERE thread_id IS NOT NULL;
CREATE UNIQUE INDEX forum_reactions_post_unique_idx ON forum_reactions(user_id, post_id, emoji) WHERE post_id IS NOT NULL;
CREATE INDEX marketplace_listings_status_category_idx ON marketplace_listings(status, category, updated_at DESC);
CREATE INDEX marketplace_listings_seller_status_idx ON marketplace_listings(seller_user_id, status, updated_at DESC);
CREATE INDEX marketplace_inquiries_listing_idx ON marketplace_inquiries(listing_id, updated_at DESC);
CREATE INDEX marketplace_messages_inquiry_created_idx ON marketplace_messages(inquiry_id, created_at);
