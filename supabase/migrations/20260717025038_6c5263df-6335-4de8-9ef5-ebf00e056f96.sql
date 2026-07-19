
-- Add structured technical fields to forum_threads
ALTER TABLE public.forum_threads
  ADD COLUMN IF NOT EXISTS thread_type text NOT NULL DEFAULT 'discussion',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS related_entity_type text,
  ADD COLUMN IF NOT EXISTS related_entity_id text,
  ADD COLUMN IF NOT EXISTS accepted_post_id uuid;

-- Constrain enum-like values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forum_threads_thread_type_check') THEN
    ALTER TABLE public.forum_threads
      ADD CONSTRAINT forum_threads_thread_type_check
      CHECK (thread_type IN ('question','discussion','build_log','integration_report','bom_correction','supplier_report','teardown','project_update'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forum_threads_status_check') THEN
    ALTER TABLE public.forum_threads
      ADD CONSTRAINT forum_threads_status_check
      CHECK (status IN ('open','solved','closed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forum_threads_related_entity_type_check') THEN
    ALTER TABLE public.forum_threads
      ADD CONSTRAINT forum_threads_related_entity_type_check
      CHECK (related_entity_type IS NULL OR related_entity_type IN ('project','component','marketplace_listing','build'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forum_threads_related_entity_consistency_check') THEN
    ALTER TABLE public.forum_threads
      ADD CONSTRAINT forum_threads_related_entity_consistency_check
      CHECK ((related_entity_type IS NULL AND related_entity_id IS NULL) OR (related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'forum_threads_accepted_post_fk') THEN
    ALTER TABLE public.forum_threads
      ADD CONSTRAINT forum_threads_accepted_post_fk
      FOREIGN KEY (accepted_post_id) REFERENCES public.forum_posts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_threads_type ON public.forum_threads(thread_type, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_status ON public.forum_threads(status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_related ON public.forum_threads(related_entity_type, related_entity_id);
