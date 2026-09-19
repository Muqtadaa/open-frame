-- Reading and writing comments, through functions rather than through tables.
--
-- `profiles` is readable only by its owner, which is right and is also why a
-- comment cannot simply be selected with a join: the client has no way to turn
-- an `author_id` into a name. Loosening that table would make every display
-- name in the system readable by every account, to solve a problem that only
-- exists between people who already share a board.
--
-- So these are SECURITY DEFINER, and each one re-checks authorization itself.
-- A definer function bypasses row-level security by definition, so the policy
-- has to be restated in the body — which is why each of them starts with the
-- same membership test the tables use.

/**
 * The people on a board: its owner and its members, with their names.
 *
 * For choosing somebody to mention, and for putting a name on a comment.
 * Returns nothing to anybody who cannot see the board, so it cannot be used to
 * ask whether a board exists or who is on it.
 */
create or replace function public.board_people(p_board_id text)
returns table (user_id uuid, display_name text, hue smallint)
language sql
security definer
stable
set search_path = ''
as $$
  select p.id, p.display_name, p.hue
  from public.profiles p
  where (
    select private.is_board_owner(p_board_id) or private.is_board_member(p_board_id)
  )
  and (
    p.id = (select b.owner_id from public.boards b where b.id = p_board_id)
    or p.id in (select m.user_id from public.board_members m where m.board_id = p_board_id)
  );
$$;

revoke all on function public.board_people(text) from public, anon;
grant execute on function public.board_people(text) to authenticated;

/** Every comment on a board, with its author's name. Threads and replies. */
create or replace function public.board_comments_for(p_board_id text)
returns table (
  id uuid,
  parent_id uuid,
  author_id uuid,
  author_name text,
  author_hue smallint,
  body text,
  x double precision,
  y double precision,
  object_id text,
  resolved_at timestamptz,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    c.id,
    c.parent_id,
    c.author_id,
    coalesce(p.display_name, 'Someone'),
    coalesce(p.hue, 0::smallint),
    c.body,
    c.x,
    c.y,
    c.object_id,
    c.resolved_at,
    c.created_at
  from public.board_comments c
  left join public.profiles p on p.id = c.author_id
  where c.board_id = p_board_id
    and (
      select private.is_board_owner(p_board_id) or private.is_board_member(p_board_id)
    )
  order by c.created_at;
$$;

revoke all on function public.board_comments_for(text) from public, anon;
grant execute on function public.board_comments_for(text) to authenticated;

/**
 * Posts a comment and its mentions together.
 *
 * ONE statement, because they are one act. A comment written without its
 * mentions notifies nobody, and a client that crashed between two calls would
 * leave exactly that — a mention that silently never happened, which is worse
 * than a failure because nothing looks wrong.
 *
 * Mentions are filtered to people who are actually on the board rather than
 * rejected: a name that has since left is a stale autocomplete, not an error
 * worth throwing away what somebody just wrote.
 */
create or replace function public.post_comment(
  p_board_id text,
  p_body text,
  p_parent_id uuid default null,
  p_x double precision default null,
  p_y double precision default null,
  p_object_id text default null,
  p_mentions uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'A comment is written by somebody';
  end if;
  if not (private.is_board_owner(p_board_id) or private.is_board_member(p_board_id)) then
    raise exception 'That board is not yours to comment on';
  end if;

  insert into public.board_comments (board_id, parent_id, author_id, body, x, y, object_id)
  values (p_board_id, p_parent_id, v_me, p_body, p_x, p_y, p_object_id)
  returning id into v_id;

  insert into public.comment_mentions (comment_id, user_id)
  select v_id, m.user_id
  from unnest(p_mentions) as m(user_id)
  where m.user_id <> v_me
    and (
      m.user_id = (select b.owner_id from public.boards b where b.id = p_board_id)
      or m.user_id in (select bm.user_id from public.board_members bm where bm.board_id = p_board_id)
    )
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.post_comment(text, text, uuid, double precision, double precision, text, uuid[]) from public, anon;
grant execute on function public.post_comment(text, text, uuid, double precision, double precision, text, uuid[]) to authenticated;

/**
 * Marks a thread resolved, or opens it again.
 *
 * Anybody on the board, not only the author: a thread only its author could
 * close is one that outlives whoever left the project.
 */
create or replace function public.resolve_comment(p_id uuid, p_resolved boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board text;
  v_me uuid := (select auth.uid());
begin
  select board_id into v_board from public.board_comments where id = p_id and parent_id is null;
  if v_board is null then
    return false;
  end if;
  if not (private.is_board_owner(v_board) or private.is_board_member(v_board)) then
    return false;
  end if;

  update public.board_comments
  set resolved_at = case when p_resolved then now() else null end,
      resolved_by = case when p_resolved then v_me else null end,
      updated_at = now()
  where id = p_id;

  return true;
end;
$$;

revoke all on function public.resolve_comment(uuid, boolean) from public, anon;
grant execute on function public.resolve_comment(uuid, boolean) to authenticated;

/** What you have been told about and not yet read. */
create or replace function public.my_mentions()
returns table (
  comment_id uuid,
  board_id text,
  board_title text,
  author_name text,
  body text,
  created_at timestamptz
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
    c.created_at
  from public.comment_mentions m
  join public.board_comments c on c.id = m.comment_id
  join public.boards b on b.id = c.board_id
  left join public.profiles p on p.id = c.author_id
  where m.user_id = (select auth.uid())
    and m.read_at is null
  order by c.created_at desc
  limit 50;
$$;

revoke all on function public.my_mentions() from public, anon;
grant execute on function public.my_mentions() to authenticated;
