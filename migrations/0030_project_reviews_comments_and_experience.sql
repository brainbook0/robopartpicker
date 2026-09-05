-- Authenticated project reviews, local discussion, moderation reports, and private experience evidence.

CREATE TABLE project_reviews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  overall_rating INTEGER NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  reliability_rating INTEGER CHECK (reliability_rating IS NULL OR reliability_rating BETWEEN 1 AND 5),
  usability_rating INTEGER CHECK (usability_rating IS NULL OR usability_rating BETWEEN 1 AND 5),
  value_rating INTEGER CHECK (value_rating IS NULL OR value_rating BETWEEN 1 AND 5),
  support_rating INTEGER CHECK (support_rating IS NULL OR support_rating BETWEEN 1 AND 5),
  relationship TEXT NOT NULL CHECK (relationship IN ('owner', 'operator', 'evaluator', 'observer')),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 5 AND 200),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 50 AND 5000),
  moderation_status TEXT NOT NULL DEFAULT 'published' CHECK (moderation_status IN ('published', 'under_review', 'removed')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  edit_count INTEGER NOT NULL DEFAULT 0 CHECK (edit_count >= 0),
  last_moderated_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  last_moderated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  edited_at TEXT,
  removed_at TEXT,
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_reviews_published
  ON project_reviews(project_id, moderation_status, updated_at DESC);
CREATE INDEX idx_project_reviews_user
  ON project_reviews(user_id, updated_at DESC);

CREATE TABLE project_review_revisions (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES project_reviews(id) ON DELETE CASCADE,
  editor_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  review_version INTEGER NOT NULL CHECK (review_version > 0),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_at TEXT NOT NULL,
  UNIQUE (review_id, review_version)
);

CREATE TABLE project_comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES project_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 2 AND 4000),
  moderation_status TEXT NOT NULL DEFAULT 'published' CHECK (moderation_status IN ('published', 'under_review', 'removed')),
  helpful_count INTEGER NOT NULL DEFAULT 0 CHECK (helpful_count >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  edited_at TEXT,
  deleted_at TEXT
);

CREATE INDEX idx_project_comments_project_status_created
  ON project_comments(project_id, moderation_status, created_at);
CREATE INDEX idx_project_comments_parent
  ON project_comments(parent_id, created_at) WHERE parent_id IS NOT NULL;

CREATE TRIGGER project_comments_one_level_insert
BEFORE INSERT ON project_comments
WHEN NEW.parent_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM project_comments parent
  WHERE parent.id = NEW.parent_id AND (parent.parent_id IS NOT NULL OR parent.project_id <> NEW.project_id)
)
BEGIN
  SELECT RAISE(ABORT, 'project comments support one reply level within the same project');
END;

CREATE TRIGGER project_comments_one_level_update
BEFORE UPDATE OF parent_id, project_id ON project_comments
WHEN NEW.parent_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM project_comments parent
  WHERE parent.id = NEW.parent_id AND (parent.parent_id IS NOT NULL OR parent.project_id <> NEW.project_id)
)
BEGIN
  SELECT RAISE(ABORT, 'project comments support one reply level within the same project');
END;

CREATE TABLE project_comment_reactions (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES project_comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  helpful INTEGER NOT NULL DEFAULT 1 CHECK (helpful = 1),
  created_at TEXT NOT NULL,
  UNIQUE (comment_id, user_id)
);

CREATE TRIGGER project_comment_reactions_count_insert
AFTER INSERT ON project_comment_reactions
BEGIN
  UPDATE project_comments SET helpful_count = helpful_count + 1 WHERE id = NEW.comment_id;
END;

CREATE TRIGGER project_comment_reactions_count_delete
AFTER DELETE ON project_comment_reactions
BEGIN
  UPDATE project_comments SET helpful_count = MAX(0, helpful_count - 1) WHERE id = OLD.comment_id;
END;

CREATE TABLE project_experience_claims (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  claim_type TEXT NOT NULL CHECK (claim_type IN ('owner', 'operator', 'manufacturer_representative')),
  evidence_file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  evidence_reference TEXT CHECK (evidence_reference IS NULL OR length(evidence_reference) <= 2000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'revoked')),
  reviewer_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  private_moderator_notes TEXT CHECK (private_moderator_notes IS NULL OR length(private_moderator_notes) <= 4000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  verified_at TEXT,
  revoked_at TEXT,
  UNIQUE (project_id, user_id, claim_type),
  CHECK (
    (status = 'pending' AND reviewer_user_id IS NULL AND reviewed_at IS NULL AND verified_at IS NULL AND revoked_at IS NULL)
    OR (status = 'verified' AND reviewer_user_id IS NOT NULL AND reviewed_at IS NOT NULL AND verified_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'rejected' AND reviewer_user_id IS NOT NULL AND reviewed_at IS NOT NULL AND verified_at IS NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND reviewer_user_id IS NOT NULL AND reviewed_at IS NOT NULL AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX idx_project_experience_claims_public
  ON project_experience_claims(project_id, status, verified_at)
  WHERE status = 'verified';
CREATE INDEX idx_project_experience_claims_review
  ON project_experience_claims(status, created_at)
  WHERE status = 'pending';

CREATE TABLE project_content_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('review', 'comment')),
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'misinformation', 'conflict_of_interest', 'other')),
  details TEXT CHECK (details IS NULL OR length(details) <= 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  reviewer_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  resolution_note TEXT CHECK (resolution_note IS NULL OR length(resolution_note) <= 4000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  UNIQUE (reporter_user_id, entity_type, entity_id)
);

CREATE INDEX idx_project_content_reports_queue
  ON project_content_reports(status, created_at) WHERE status = 'open';
