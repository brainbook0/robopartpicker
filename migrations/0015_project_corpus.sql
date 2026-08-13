-- IU-PROJECT-CORPUS: project provenance, canonical upstream identity and
-- publishability gating. Projects and staging rows record where they came from,
-- when they were ingested/last checked, and whether they are publishable.
ALTER TABLE projects ADD COLUMN upstream_url TEXT;
ALTER TABLE projects ADD COLUMN upstream_identity TEXT;
ALTER TABLE projects ADD COLUMN maintainer TEXT;
ALTER TABLE projects ADD COLUMN revision TEXT;
ALTER TABLE projects ADD COLUMN ingested_at TEXT;
ALTER TABLE projects ADD COLUMN last_checked_at TEXT;
ALTER TABLE projects ADD COLUMN publishability TEXT NOT NULL DEFAULT 'review';

CREATE UNIQUE INDEX projects_upstream_identity_idx ON projects(upstream_identity) WHERE upstream_identity IS NOT NULL;

ALTER TABLE staging_projects ADD COLUMN upstream_url TEXT;
ALTER TABLE staging_projects ADD COLUMN revision TEXT;
ALTER TABLE staging_projects ADD COLUMN maintainer TEXT;
ALTER TABLE staging_projects ADD COLUMN ingested_at TEXT;
ALTER TABLE staging_projects ADD COLUMN last_checked_at TEXT;
ALTER TABLE staging_projects ADD COLUMN publishability TEXT NOT NULL DEFAULT 'review';
