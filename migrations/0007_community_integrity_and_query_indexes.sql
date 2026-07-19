CREATE UNIQUE INDEX forum_threads_slug_unique ON forum_threads(slug COLLATE NOCASE);

CREATE INDEX forum_threads_category_pinned_activity_idx ON forum_threads(category_id, pinned DESC, last_activity_at DESC);
CREATE INDEX forum_reactions_thread_idx ON forum_reactions(thread_id, emoji);
CREATE INDEX forum_reactions_post_idx ON forum_reactions(post_id, emoji);
