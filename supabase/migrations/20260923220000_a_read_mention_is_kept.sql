/*
 * Read and gone are two different states, and the list conflated them.
 *
 * `my_mentions()` filtered on `read_at is null`, so following a notification
 * was the last time you could ever find it: the thing somebody wanted you to
 * see disappeared at the moment you looked at it, with no way back to the
 * board and remark it named.
 *
 * It now returns the recent ones either way and says which are unread. The
 * bell counts the unread; the list keeps the rest, quietened. Nothing about
 * who may read what changes — the same `security definer` body, the same
 * `m.user_id = auth.uid()`.
 *
 * Fifty, newest first. A notification list is a recent-past thing rather than
 * an archive: the board is where a discussion lives, and a list that grows
 * without limit is one nobody scrolls to the bottom of anyway.
 */
/*
 * Dropped rather than replaced: Postgres will not change the return type of
 * an existing function, and this one grows a column. Same transaction, so
 * there is no window in which the function does not exist.
 */
drop function if exists public.my_mentions();

create function public.my_mentions()
returns table (
  comment_id uuid,
  board_id text,
  board_title text,
  author_name text,
  body text,
  created_at timestamptz,
  read_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    c.id,
    c.board_id,
    b.title,
    coalesce(p.display_name, 'Someone'),
    c.body,
    c.created_at,
    m.read_at
  from public.comment_mentions m
  join public.board_comments c on c.id = m.comment_id
  join public.boards b on b.id = c.board_id
  left join public.profiles p on p.id = c.author_id
  where m.user_id = (select auth.uid())
  order by c.created_at desc
  limit 50;
$$;

revoke all on function public.my_mentions() from public, anon;
grant execute on function public.my_mentions() to authenticated;

/*
 * The old index was built for the filter this function no longer applies.
 * The ordering it serves now is by the comment's age within one user's rows,
 * which the primary key cannot answer.
 */
create index if not exists comment_mentions_user_idx
  on public.comment_mentions (user_id, created_at desc);
