ALTER TABLE projects ADD COLUMN project_kind TEXT NOT NULL DEFAULT 'unknown'
  CHECK (project_kind IN ('physical_design', 'robotics_software', 'commercial_showcase', 'unknown'));

UPDATE projects
SET project_kind = CASE
  WHEN current_version_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM project_versions pv
    WHERE pv.id = projects.current_version_id
      AND (
        json_array_length(COALESCE(json_extract(pv.rpps_json, '$.bom'), json('[]'))) > 0
        OR json_array_length(COALESCE(json_extract(pv.rpps_json, '$.assembly'), json('[]'))) > 0
        OR json_type(json_extract(pv.rpps_json, '$.hardware')) = 'object'
      )
  ) THEN 'physical_design'
  WHEN current_version_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM project_versions pv
    WHERE pv.id = projects.current_version_id
      AND json_type(json_extract(pv.rpps_json, '$.software')) = 'object'
      AND (
        COALESCE(json_extract(pv.rpps_json, '$.software.ros_support'), 'none') <> 'none'
        OR json_extract(pv.rpps_json, '$.software.middleware') IS NOT NULL
      )
  ) THEN 'robotics_software'
  WHEN repository_url IS NULL AND license_spdx IS NULL THEN 'commercial_showcase'
  ELSE 'unknown'
END
WHERE project_kind = 'unknown';

CREATE INDEX projects_kind_visibility_status_popularity_idx
  ON projects(project_kind, visibility, status, github_stars DESC, updated_at DESC);
