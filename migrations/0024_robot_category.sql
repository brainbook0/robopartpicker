-- IU-ROBOT-CATEGORY: primary robot form-factor taxonomy for browse filters.
-- One nullable label per project; secondary aspects stay in rpps tags.
-- The vocabulary is maintained in src/shared/robotCategory.ts (no DB CHECK so
-- the taxonomy can grow without a migration).

ALTER TABLE projects ADD COLUMN robot_category TEXT;

CREATE INDEX projects_robot_category_kind_idx
  ON projects(robot_category, project_kind, visibility, status)
  WHERE robot_category IS NOT NULL;
