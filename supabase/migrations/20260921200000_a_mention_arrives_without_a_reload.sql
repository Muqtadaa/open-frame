/*
 * A mention that needs a page reload to appear is not a notification.
 *
 * `comment_mentions` joins the realtime publication so the browser is told
 * when a row for it is written, rather than finding out on its next visit to
 * the dashboard. Only this table: publishing `board_comments` as well would
 * push the TEXT of every remark on every board to every listening client and
 * make row-level security the only thing standing between them, for no gain —
 * a board's own comments already arrive over the room socket.
 *
 * What travels is a nudge. The client re-reads `my_mentions()`, which is
 * `security definer` and does the joins the row cannot carry, so the database
 * stays the one answer to what was said and by whom.
 *
 * Row-level security still applies to a realtime subscriber, and the existing
 * "your own mentions" select policy is what makes this safe to publish: a
 * client is only ever sent rows whose `user_id` is its own.
 *
 * The primary key is (comment_id, user_id), so the default replica identity
 * already carries `user_id` — which is what the client filters on. Without
 * that, the filter would need `replica identity full` and every update would
 * ship the whole row.
 */
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comment_mentions'
  ) then
    alter publication supabase_realtime add table public.comment_mentions;
  end if;
end
$$;
