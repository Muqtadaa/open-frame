-- Getting into a workspace, the same way as getting into a board.
--
-- Two links: one that lets you edit, one that only lets you look. Redeemed
-- exactly as a board link is, and for the same reason — there is no user
-- directory to pick somebody out of, and adding one would let anybody holding
-- a workspace enumerate every account.
--
-- `admin` is deliberately NOT a link. Being able to invite people and rename
-- the place is something an admin grants a person, not something a URL grants
-- whoever it was forwarded to.

alter table public.workspaces
  add column if not exists editor_key text,
  add column if not exists viewer_key text;

alter table public.workspaces
  drop constraint if exists workspaces_editor_key_check;
alter table public.workspaces
  add constraint workspaces_editor_key_check
  check (editor_key is null or editor_key ~ '^[0-9a-f]{32}$');

alter table public.workspaces
  drop constraint if exists workspaces_viewer_key_check;
alter table public.workspaces
  add constraint workspaces_viewer_key_check
  check (viewer_key is null or viewer_key ~ '^[0-9a-f]{32}$');

/*
 * An attempt to hide the keys that DOES NOT WORK, kept because it is what was
 * run and a migration is a record rather than a draft. The next one repairs
 * it, and says why.
 *
 * The intent is right: a policy decides which ROWS you may read and cannot
 * hide a column inside a row you are allowed to read at all — and every
 * member of a workspace is allowed to read its row.
 */
revoke select (editor_key, viewer_key) on public.workspaces from authenticated, anon;

/** A key: 32 hex characters, minted where nobody can watch. */
create or replace function private.mint_workspace_key()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select encode(extensions.gen_random_bytes(16), 'hex');
$$;

/**
 * How much a role is worth, so that joining can refuse to make it worth less.
 *
 * A link that demoted the person following it would be a trap: an admin who
 * clicks the viewer link somebody forwarded them would lose their workspace.
 */
create or replace function private.workspace_rank(p_role text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_role when 'admin' then 3 when 'editor' then 2 when 'viewer' then 1 else 0 end;
$$;

/**
 * The workspaces you are in, and the links for the ones you run.
 *
 * Keys go only to an admin. An editor holds no link to hand on: inviting is
 * the thing `admin` means, and a link visible to everybody is a link anybody
 * can widen the workspace with.
 */
create or replace function public.my_workspaces()
returns table (
  id uuid,
  name text,
  personal boolean,
  role text,
  editor_key text,
  viewer_key text,
  boards bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    w.id,
    w.name,
    w.personal,
    m.role,
    case when m.role = 'admin' then w.editor_key end as editor_key,
    case when m.role = 'admin' then w.viewer_key end as viewer_key,
    (select count(*) from public.boards b where b.workspace_id = w.id) as boards
  from public.workspaces w
  join public.workspace_members m
    on m.workspace_id = w.id and m.user_id = (select auth.uid())
  order by w.personal desc, w.name;
$$;

revoke all on function public.my_workspaces() from public, anon;
grant execute on function public.my_workspaces() to authenticated;

/**
 * Mints this workspace's links, once.
 *
 * Idempotent: a second call returns the same two keys rather than rotating
 * them, because rotating silently would break every link already sent. A
 * deliberate rotation is a different act and does not exist yet.
 */
create or replace function public.share_workspace(p_id uuid)
returns table (editor_key text, viewer_key text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_workspace_admin(p_id) then
    raise exception 'Only an admin shares a workspace';
  end if;

  update public.workspaces w
  set editor_key = coalesce(w.editor_key, private.mint_workspace_key()),
      viewer_key = coalesce(w.viewer_key, private.mint_workspace_key())
  where w.id = p_id;

  return query
  select w.editor_key, w.viewer_key from public.workspaces w where w.id = p_id;
end;
$$;

revoke all on function public.share_workspace(uuid) from public, anon;
grant execute on function public.share_workspace(uuid) to authenticated;

/**
 * Redeems a workspace link, and never takes anything away.
 *
 * The same shape as `join_board`, including the rule that matters most: if
 * what you already hold is worth more than what the link grants, the link
 * changes nothing. Without it, forwarding the viewer link to an admin is a way
 * to demote them.
 */
create or replace function public.join_workspace(p_id uuid, p_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
  v_held text;
begin
  if v_user is null then
    raise exception 'Joining a workspace is something an account does';
  end if;

  select case
           when w.editor_key is not null and w.editor_key = p_key then 'editor'
           when w.viewer_key is not null and w.viewer_key = p_key then 'viewer'
         end
    into v_role
    from public.workspaces w
   where w.id = p_id;

  -- The same answer for a wrong key and a workspace that is not there. Telling
  -- them apart tells somebody which of the two guesses to keep.
  if v_role is null then
    return null;
  end if;

  insert into public.workspace_members as m (workspace_id, user_id, role)
  values (p_id, v_user, v_role)
  on conflict (workspace_id, user_id) do update
    set role = case
                 when private.workspace_rank(m.role) >= private.workspace_rank(excluded.role)
                   then m.role
                 else excluded.role
               end
  returning m.role into v_held;

  return v_held;
end;
$$;

revoke all on function public.join_workspace(uuid, text) from public, anon;
grant execute on function public.join_workspace(uuid, text) to authenticated;

/** Creates a workspace and puts you in it as its admin, in one act. */
create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v_me is null then
    raise exception 'A workspace is created by the person who owns it';
  end if;

  insert into public.workspaces (name, owner_id, personal)
  values (left(trim(p_name), 80), v_me, false)
  returning id into v_id;

  /*
   * One statement with the insert above, for the reason `post_comment` writes
   * its mentions in the same call: a workspace whose creator is not in it is
   * a workspace nobody can reach, and a client that failed between two calls
   * would leave exactly that.
   */
  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_id, v_me, 'admin');

  return v_id;
end;
$$;

revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
