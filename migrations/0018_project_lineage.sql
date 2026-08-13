-- IU-PROJECT-GRAPH: clone/fork lineage on projects.
ALTER TABLE projects ADD COLUMN upstream_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN upstream_revision TEXT;
ALTER TABLE projects ADD COLUMN clone_created_at TEXT;
ALTER TABLE projects ADD COLUMN change_summary TEXT;

CREATE INDEX projects_upstream_project_idx ON projects(upstream_project_id);
