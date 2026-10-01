-- A remark is its author's to change.
--
-- A comment was final the moment it was posted: a typo stayed for good, and a
-- remark left on the wrong element could only be RESOLVED, which says
-- "agreed" about something nobody agreed to. The table's policies always said
-- editing and deleting were the author's; nothing exposed either.
--
-- Through functions, like every other read and write here, so the rules live
-- in one place the client cannot route around.

/*
 * WHEN it was edited, separately from `updated_at`, which resolving bumps
 * too. "Edited" is a claim about the words; a thread somebody else closed was
 * not edited by them.
 */
alter table public.board_comments add column if not exists edited_at timestamptz;

/*
 * The list gains `edited_at`, on the END of the row: a client reads these by
 * name, and a reordered row is a silent change of meaning for anything that
 * does not. Dropped first because a function's result shape cannot be
 * replaced in place.
 */
drop function if exists public.board_comments_for(text);

create function public.board_comments_for(p_board_id text)
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
  created_at timestamptz,
  fx double precision,
  fy double precision,
  edited_at timestamptz
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
    c.created_at,
    c.fx,
    c.fy,
    c.edited_at
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
 * Rewrites a remark. Its author's alone, and only its words: where it is
 * pinned and what it is about stay what they were.
 *
 * Mentions are NOT re-sent. Somebody named in the first version has been told
 * already, and an edit that added a name should not be a way to notify people
 * out of order with the discussion.
 */
create or replace function public.edit_comment(p_id uuid, p_body text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null or p_body is null or length(p_body) not between 1 and 4000 then
    return false;
  end if;

  update public.board_comments
  set body = p_body,
      edited_at = now(),
      updated_at = now()
  where id = p_id
    and author_id = v_me
    and (private.is_board_owner(board_id) or private.is_board_member(board_id));

  return found;
end;
$$;

revoke all on function public.edit_comment(uuid, text) from public, anon;
grant execute on function public.edit_comment(uuid, text) to authenticated;

/**
 * Deletes a remark. Its author's alone.
 *
 * A thread takes its replies with it (`on delete cascade`), and those may be
 * somebody else's words — so a thread with a reply from anyone else is
 * refused. Its author can still edit it; what other people said under it
 * stays theirs.
 */
create or replace function public.delete_comment(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    return false;
  end if;
  if exists (
    select 1 from public.board_comments r
    where r.parent_id = p_id and r.author_id <> v_me
  ) then
    return false;
  end if;

  delete from public.board_comments
  where id = p_id
    and author_id = v_me
    and (private.is_board_owner(board_id) or private.is_board_member(board_id));

  return found;
end;
$$;

revoke all on function public.delete_comment(uuid) from public, anon;
grant execute on function public.delete_comment(uuid) to authenticated;
