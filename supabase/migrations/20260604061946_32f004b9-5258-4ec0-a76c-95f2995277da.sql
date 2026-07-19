GRANT SELECT ON public.forum_categories TO anon, authenticated;
GRANT ALL ON public.forum_categories TO service_role;

GRANT SELECT ON public.forum_threads TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.forum_threads TO authenticated;
GRANT ALL ON public.forum_threads TO service_role;

GRANT SELECT ON public.forum_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.forum_posts TO authenticated;
GRANT ALL ON public.forum_posts TO service_role;

GRANT SELECT ON public.forum_reactions TO anon, authenticated;
GRANT INSERT, DELETE ON public.forum_reactions TO authenticated;
GRANT ALL ON public.forum_reactions TO service_role;

GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

DROP TRIGGER IF EXISTS trg_forum_posts_count ON public.forum_posts;
CREATE TRIGGER trg_forum_posts_count
AFTER INSERT OR DELETE ON public.forum_posts
FOR EACH ROW EXECUTE FUNCTION public.forum_after_post_change();

DROP TRIGGER IF EXISTS trg_forum_reactions_count ON public.forum_reactions;
CREATE TRIGGER trg_forum_reactions_count
AFTER INSERT OR DELETE ON public.forum_reactions
FOR EACH ROW EXECUTE FUNCTION public.forum_after_reaction_change();

DROP TRIGGER IF EXISTS trg_forum_threads_updated ON public.forum_threads;
CREATE TRIGGER trg_forum_threads_updated
BEFORE UPDATE ON public.forum_threads
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.forum_increment_view(_thread_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.forum_threads SET view_count = view_count + 1 WHERE id = _thread_id;
$$;
GRANT EXECUTE ON FUNCTION public.forum_increment_view(uuid) TO anon, authenticated;