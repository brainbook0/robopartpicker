-- Drop and recreate so the parameter default (NULL for _post_id) is reflected
-- in generated Supabase types, letting the client call the RPC without casts.
DROP FUNCTION IF EXISTS public.set_accepted_answer(uuid, uuid);

CREATE OR REPLACE FUNCTION public.set_accepted_answer(_thread_id uuid, _post_id uuid DEFAULT NULL)
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
