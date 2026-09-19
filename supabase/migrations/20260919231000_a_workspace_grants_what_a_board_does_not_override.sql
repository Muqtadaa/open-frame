-- Being in a workspace gets you into its boards.
--
-- This is the migration that WIDENS, and it is alone for that reason. The one
-- before it added tables and changed nothing about who could reach what; if
-- this is wrong, it is wrong about access, so it is small enough to read in
-- one sitting and every boundary it moves is probed against the real database.
--
-- Precedence, in one place:
--
--   owner                          -> 'owner'
--   a board_members row            -> that role, whatever the workspace says
--   otherwise a workspace role     -> admin and editor edit, viewer views
--   otherwise                      -> nothing
--
-- The board-level row is an OVERRIDE in both directions: it is how somebody
-- gets edit access to one board without the workspace, and how a single
-- sensitive board is kept read-only for somebody who edits everything else.
--
-- Link keys are untouched and still bypass all of it. That is what a link is.
--
-- Deliberately NOT widened: deleting and renaming a board stay with its owner.
-- A workspace admin can invite people and read everything; destroying somebody
-- else's board is a different power and nobody has asked for it.

/**
 * What this person may do with a board, or null if they may do nothing.
 *
 * The ONE definition of precedence. `my_boards` and `join_board` both ask it
 * rather than restating it — two copies of a rule like this drift, and the
 * drift is a privilege, granted or withheld by accident.
 */
create or replace function private.board_role(target_board text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when b.owner_id = (select auth.uid()) then 'owner'
    when m.role is not null then m.role
    when wm.role in ('admin', 'editor') then 'editor'
    when wm.role = 'viewer' then 'viewer'
  end
  from public.boards b
  left join public.board_members m
    on m.board_id = b.id and m.user_id = (select auth.uid())
  left join public.workspace_members wm
    on wm.workspace_id = b.workspace_id and wm.user_id = (select auth.uid())
  where b.id = target_board;
$$;

/**
 * Anyone who may reach this board without holding a link.
 *
 * Widened here, and this single function is most of the blast radius: it is
 * what the comment policies, the membership policies and the board listing
 * all ask. `is_board_owner` is NOT widened — a workspace admin is not the
 * owner of somebody else's board, and the two are different questions.
 */
create or replace function private.is_board_member(target_board text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.board_role(target_board) is not null;
$$;

/*
 * The board list, which now has to hand out the right KEY as well as the right
 * role.
 *
 * This is where the widening could have gone quietly wrong. The old shape fell
 * through to the editor key whenever there was no `board_members` row — which
 * was safe only because no row meant no access. Once a workspace grants
 * access without a row, that same fall-through hands a workspace VIEWER the
 * editor link, and they can edit every board in the workspace. Reading the
 * role from one function instead is what closes it.
 */
/*
 * Dropped, not replaced: this gains two columns, and a function's OUT
 * parameters are its return type — Postgres refuses to replace one whose type
 * changed. The deployed build reads these by name and ignores the new ones.
 */
drop function if exists public.my_boards();

create function public.my_boards()
returns table (
  id text,
  title text,
  role text,
  access_key text,
  view_key text,
  owner_key text,
  updated_at timestamptz,
  pinned boolean,
  opened_at timestamptz,
  workspace_id uuid,
  workspace_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.title,
    r.role,
    case
      when r.role = 'viewer' then b.viewer_key
      else b.editor_key
    end as access_key,
    case when r.role = 'owner' then b.viewer_key end as view_key,
    case when r.role = 'owner' then b.owner_key end as owner_key,
    b.updated_at,
    p.pinned_at is not null as pinned,
    coalesce(p.opened_at, b.updated_at) as opened_at,
    b.workspace_id,
    w.name as workspace_name
  from public.boards b
  join public.workspaces w on w.id = b.workspace_id
  cross join lateral (select private.board_role(b.id) as role) r
  left join public.board_prefs p
    on p.board_id = b.id and p.user_id = (select auth.uid())
  where r.role is not null
  order by p.pinned_at is not null desc, coalesce(p.opened_at, b.updated_at) desc;
$$;

revoke all on function public.my_boards() from public, anon;
grant execute on function public.my_boards() to authenticated;

/**
 * Redeeming a link, which must never take access away.
 *
 * A `board_members` row overrides the workspace, so writing one for a view
 * link would PIN somebody who edits the whole workspace down to read-only on
 * this board — by following a link somebody sent them. The row is therefore
 * only ever written when it raises what they hold.
 */
create or replace function public.join_board(p_id text, p_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_owner uuid;
  v_role text;
  v_held text;
  v_current text;
begin
  if v_user is null then
    raise exception 'Joining a board is something an account does';
  end if;

  select b.owner_id,
         case
           when b.editor_key is not null and b.editor_key = p_key then 'editor'
           when b.viewer_key is not null and b.viewer_key = p_key then 'viewer'
         end
    into v_owner, v_role
    from public.boards b
   where b.id = p_id;

  if v_role is null then
    return null;
  end if;

  if v_owner = v_user then
    return 'owner';
  end if;

  v_current := private.board_role(p_id);

  -- Already at least this, by whatever route. Writing a row would at best
  -- change nothing and at worst demote them.
  if v_current = 'editor' then
    return 'editor';
  end if;
  if v_current = 'viewer' and v_role = 'viewer' then
    return 'viewer';
  end if;

  insert into public.board_members as m (board_id, user_id, role)
  values (p_id, v_user, v_role)
  on conflict (board_id, user_id) do update
    set role = case when m.role = 'editor' then 'editor' else excluded.role end
  returning m.role into v_held;

  -- What you hold, not what the link was worth. They differ exactly when an
  -- editor opens a view link, which is the case the upsert exists for.
  return v_held;
end;
$$;

revoke all on function public.join_board(text, text) from public, anon;
grant execute on function public.join_board(text, text) to authenticated;
