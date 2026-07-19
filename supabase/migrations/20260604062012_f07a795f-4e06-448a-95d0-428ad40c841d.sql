REVOKE ALL ON FUNCTION public.forum_increment_view(uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.forum_increment_view(uuid);