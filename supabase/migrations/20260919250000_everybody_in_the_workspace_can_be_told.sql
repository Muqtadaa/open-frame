-- Everybody in the workspace can be mentioned, not just the people already on
-- the board.
--
-- This is the pool the feature always wanted. Until now the composer could
-- only offer the board's own members, which is why it has to fall back to
-- offering a share link — and a workspace is exactly the group of people you
-- would want to pull into a discussion.
--
-- Still NOT a user directory. The set is scoped to one board's workspace, and
-- you have to be on that board to ask, so it cannot be used to enumerate
-- accounts. That was the reason a name search was refused, and it still holds.

/**
 * Who may be addressed on a board: the owner, anybody added to the board
 * itself, and everybody in the workspace it lives in.
 *
 * ONE definition, because there are two gates and they must not disagree.
 * `board_people` decides who the composer offers; `post_comment` decides whose
 * mention is actually written. If the second is narrower than the first, the
 * interface offers a name, accepts it, and the notification silently goes
 * nowhere — which looks exactly like one that was delivered.
 */
create or replace function private.board_audience(p_board_id text)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select b.owner_id from public.boards b where b.id = p_board_id
  union
  select m.user_id from public.board_members m where m.board_id = p_board_id
  union
  select wm.user_id
  from public.boards b
  join public.workspace_members wm on wm.workspace_id = b.workspace_id
  where b.id = p_board_id;
$$;

/** The people a composer may offer, with the names it shows them under. */
create or replace function public.board_people(p_board_id text)
returns table (user_id uuid, display_name text, hue smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.hue
  from public.profiles p
  where (
    -- Asking is itself gated: this reads profiles, and only somebody already
    -- on the board has any business learning who else is.
    select private.is_board_owner(p_board_id) or private.is_board_member(p_board_id)
  )
  and p.id in (select a.user_id from private.board_audience(p_board_id) a);
$$;

revoke all on function public.board_people(text) from public, anon;
grant execute on function public.board_people(text) to authenticated;

/*
 * And the writer, which is the half that fails silently.
 *
 * Mentions are still FILTERED rather than rejected: a name that has since left
 * is a stale autocomplete, not a reason to throw away what somebody just
 * wrote. The filter is now the same set the composer offered from.
 */
create or replace function public.post_comment(
  p_board_id text,
  p_body text,
  p_parent_id uuid default null,
  p_x double precision default null,
  p_y double precision default null,
  p_object_id text default null,
  p_mentions uuid[] default '{}',
  p_fx double precision default null,
  p_fy double precision default null
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

  insert into public.board_comments (
    board_id, parent_id, author_id, body, x, y, object_id, fx, fy
  )
  values (p_board_id, p_parent_id, v_me, p_body, p_x, p_y, p_object_id, p_fx, p_fy)
  returning id into v_id;

  insert into public.comment_mentions (comment_id, user_id)
  select v_id, m.user_id
  from unnest(p_mentions) as m(user_id)
  where m.user_id <> v_me
    and m.user_id in (select a.user_id from private.board_audience(p_board_id) a)
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.post_comment(
  text, text, uuid, double precision, double precision, text, uuid[],
  double precision, double precision
) from public, anon;

grant execute on function public.post_comment(
  text, text, uuid, double precision, double precision, text, uuid[],
  double precision, double precision
) to authenticated;
