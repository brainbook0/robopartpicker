
ALTER TABLE public.forum_threads
  ADD COLUMN IF NOT EXISTS structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS linked_entity_label text,
  ADD COLUMN IF NOT EXISTS linked_entity_path text;

ALTER TABLE public.forum_threads
  DROP CONSTRAINT IF EXISTS forum_threads_linked_entity_path_check;
ALTER TABLE public.forum_threads
  ADD CONSTRAINT forum_threads_linked_entity_path_check
  CHECK (
    linked_entity_path IS NULL
    OR linked_entity_path ~ '^/[A-Za-z0-9/_%\-\?\=\&\.\#]{0,300}$'
  );

ALTER TABLE public.forum_threads
  DROP CONSTRAINT IF EXISTS forum_threads_thread_type_check;
ALTER TABLE public.forum_threads
  ADD CONSTRAINT forum_threads_thread_type_check
  CHECK (thread_type IN (
    'question','discussion','build_log','integration_report',
    'substitution_report','bom_correction','supplier_report',
    'teardown','project_update','measured_test'
  ));

CREATE OR REPLACE FUNCTION public.set_accepted_answer(_thread_id uuid, _post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _cur_status text;
BEGIN
  SELECT user_id, status INTO _owner, _cur_status
    FROM public.forum_threads WHERE id = _thread_id;
  IF _owner IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  IF auth.uid() IS NULL OR _owner <> auth.uid() THEN
    RAISE EXCEPTION 'only the thread author can change the accepted answer';
  END IF;
  IF _post_id IS NULL THEN
    UPDATE public.forum_threads
       SET accepted_post_id = NULL,
           status = CASE WHEN _cur_status = 'solved' THEN 'open' ELSE _cur_status END
     WHERE id = _thread_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.forum_posts
       WHERE id = _post_id AND thread_id = _thread_id
    ) THEN
      RAISE EXCEPTION 'post does not belong to this thread';
    END IF;
    UPDATE public.forum_threads
       SET accepted_post_id = _post_id, status = 'solved'
     WHERE id = _thread_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_accepted_answer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_accepted_answer(uuid, uuid) TO authenticated;
