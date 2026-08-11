-- Popularity metric for the robotics projects catalog (GitHub stars).
-- Lets the Discover page list real open-source robotics projects sorted by popularity.
ALTER TABLE projects ADD COLUMN github_stars INTEGER;