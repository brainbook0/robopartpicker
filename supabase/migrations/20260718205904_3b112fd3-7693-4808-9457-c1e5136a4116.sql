-- Replace the AFTER DELETE trigger with a BEFORE DELETE trigger that is
-- independent of foreign-key trigger ordering and only touches the thread
-- when the deleted reply is the currently accepted answer.
DROP TRIGGER IF EXISTS trg_forum_reopen_on_accepted_delete ON public.forum_posts;

CREATE OR REPLACE FUNCTION public.forum_reopen_on_accepted_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.forum_threads
     SET accepted_post_id = NULL,
         status = CASE WHEN status = 'solved' THEN 'open' ELSE status END
   WHERE id = OLD.thread_id
     AND accepted_post_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_forum_reopen_on_accepted_delete
BEFORE DELETE ON public.forum_posts
FOR EACH ROW EXECUTE FUNCTION public.forum_reopen_on_accepted_delete();
