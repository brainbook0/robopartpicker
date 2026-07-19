-- 1) Tighten linked_entity_path CHECK to reject protocol-relative and unsafe characters.
ALTER TABLE public.forum_threads
  DROP CONSTRAINT IF EXISTS forum_threads_linked_entity_path_check;

ALTER TABLE public.forum_threads
  ADD CONSTRAINT forum_threads_linked_entity_path_check CHECK (
    linked_entity_path IS NULL
    OR (
      length(linked_entity_path) <= 301
      AND left(linked_entity_path, 1) = '/'
      AND left(linked_entity_path, 2) <> '//'
      AND linked_entity_path !~ '[\\\x00-\x1F\x7F]'
      AND linked_entity_path ~ '^/[A-Za-z0-9/_%\-\?\=\&\.\#]{0,300}$'
    )
  );

-- 2) Allow 'supplier' as a related entity type (in addition to existing types).
--    Existing constraint (if any) is dropped and re-added to include supplier.
ALTER TABLE public.forum_threads
  DROP CONSTRAINT IF EXISTS forum_threads_related_entity_type_check;
ALTER TABLE public.forum_threads
  ADD CONSTRAINT forum_threads_related_entity_type_check CHECK (
    related_entity_type IS NULL
    OR related_entity_type IN ('project','component','marketplace_listing','build','supplier')
  );

-- 3) Restrict accepted answers to question threads; keep owner + belongs-to-thread guards.
CREATE OR REPLACE FUNCTION public.set_accepted_answer(_thread_id uuid, _post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _cur_status text;
  _ttype text;
BEGIN
  SELECT user_id, status, thread_type INTO _owner, _cur_status, _ttype
    FROM public.forum_threads WHERE id = _thread_id;
  IF _owner IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  IF auth.uid() IS NULL OR _owner <> auth.uid() THEN
    RAISE EXCEPTION 'only the thread author can change the accepted answer';
  END IF;
  IF _ttype <> 'question' THEN
    RAISE EXCEPTION 'accepted answers are only allowed on question threads';
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

-- 4) When the accepted post is deleted, reopen the thread if it was solved.
--    The FK already SETs accepted_post_id to NULL on delete, but status stays 'solved'.
CREATE OR REPLACE FUNCTION public.forum_reopen_on_accepted_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.forum_threads
     SET status = 'open'
   WHERE id = OLD.thread_id
     AND accepted_post_id IS NULL
     AND status = 'solved';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_forum_reopen_on_accepted_delete ON public.forum_posts;
CREATE TRIGGER trg_forum_reopen_on_accepted_delete
AFTER DELETE ON public.forum_posts
FOR EACH ROW EXECUTE FUNCTION public.forum_reopen_on_accepted_delete();
