-- Follow-up migration: ownership fields required to authorize user-initiated imports.
ALTER TABLE import_jobs ADD COLUMN requested_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE import_jobs ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE import_jobs ADD COLUMN service_actor_id TEXT;

CREATE INDEX import_jobs_requester_created_idx ON import_jobs(requested_by_user_id, created_at DESC);
CREATE INDEX import_jobs_organization_created_idx ON import_jobs(organization_id, created_at DESC);
CREATE INDEX import_jobs_service_created_idx ON import_jobs(service_actor_id, created_at DESC);

-- Upload nonces prevent replay of direct R2 upload initializations.
CREATE TABLE file_upload_intents (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  upload_token_hash TEXT NOT NULL UNIQUE,
  expected_size_bytes INTEGER NOT NULL CHECK (expected_size_bytes >= 0),
  expected_media_type TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX file_upload_intents_owner_expires_idx ON file_upload_intents(owner_user_id, expires_at);
