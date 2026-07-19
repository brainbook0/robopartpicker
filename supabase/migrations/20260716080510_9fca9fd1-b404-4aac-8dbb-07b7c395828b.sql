
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
