ALTER TABLE projects ADD COLUMN project_kind TEXT NOT NULL DEFAULT 'unknown'
  CHECK (project_kind IN ('physical_design', 'robotics_software', 'commercial_showcase', 'unknown'));

CREATE INDEX projects_kind_visibility_status_popularity_idx
  ON projects(project_kind, visibility, status, github_stars DESC, updated_at DESC);
