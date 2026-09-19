-- A workspace: the thing a board belongs to, and the group of people who work
-- in it.
--
-- EVERY board lives in exactly one, including the ones that existed before
-- this ran. The alternative — a workspace as an optional container — means a
-- second case in every access check, every listing and every share path, kept
-- alive forever by boards nobody ever moved. That branch is the one that rots,
-- so this migration removes the possibility of it rather than the instances.
--
-- Additive on purpose. Nothing here changes who can already reach what: the
-- board policies, the comment policies and the access helpers are untouched.
-- Widening them is the next migration, alone, because that is the one that can
-- be wrong in a way that matters.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete cascade,
  /*
   * Set on the workspace every account is given, and on nothing else.
   *
   * It is not a permission — a personal workspace grants exactly what any
   * other does. It exists so the interface can say "your boards" rather than
   * naming a container nobody chose, and so this migration is repeatable:
   * without it, a second run would give everybody a second personal
   * workspace and no way to tell which was which.
   */
  personal boolean not null default false,
  created_at timestamptz not null default now()
);

/* One personal workspace per person, enforced rather than intended. */
create unique index if not exists workspaces_one_personal_each
  on public.workspaces (owner_id)
  where personal;

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  /*
   * What this person may do with the workspace's boards, unless a board says
   * otherwise. `admin` is `editor` plus the right to invite.
   */
  role text not null check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_by_user
  on public.workspace_members (user_id);

/*
 * RESTRICT, not cascade. A workspace holding boards is not something to delete
 * by accident, and a cascade here would take every board in it — and with them
 * every comment, every membership and every room — on one statement. Emptying
 * it first is the deliberate act that deleting a workspace ought to be.
 */
alter table public.boards
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

/*
 * Everybody gets a personal workspace, whether or not they own a board: a
 * person who signs up and then makes their first board needs somewhere to put
 * it, and finding out at that moment is how a create fails.
 *
 * Named after the person, because the interface shows this name and "Personal"
 * beside somebody else's shared workspace says nothing about whose it is.
 */
insert into public.workspaces (name, owner_id, personal)
select
  left(coalesce(nullif(trim(p.display_name), ''), 'Someone'), 80),
  p.id,
  true
from public.profiles p
where not exists (
  select 1 from public.workspaces w where w.owner_id = p.id and w.personal
);

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.owner_id, 'admin'
from public.workspaces w
where w.personal
on conflict (workspace_id, user_id) do nothing;

/*
 * Every existing board joins its OWNER's personal workspace. Not the workspace
 * of whoever else is on it: the owner is the one relationship every board
 * already has, and a board that moved to somebody else's workspace would be a
 * transfer of control this migration has no business performing.
 */
update public.boards b
set workspace_id = w.id
from public.workspaces w
where w.owner_id = b.owner_id
  and w.personal
  and b.workspace_id is null;

alter table public.boards
  alter column workspace_id set not null;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

/*
 * These read `workspace_members`, and a policy ON `workspace_members` calls
 * them — which is a loop unless the read is exempt from that policy. SECURITY
 * DEFINER is what makes it exempt: the function runs as its owner, who owns
 * the table, and row-level security does not apply to a table's owner. The
 * same reason `is_board_member` has always been written this way.
 */
create or replace function private.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = target_workspace
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_workspace_admin(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = target_workspace
      and m.user_id = (select auth.uid())
      and m.role = 'admin'
  );
$$;

/** What this person may do in a workspace, or null if they are not in it. */
create or replace function private.workspace_role(target_workspace uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.workspace_members m
  where m.workspace_id = target_workspace
    and m.user_id = (select auth.uid());
$$;

/* Dropped first: `create policy` has no IF NOT EXISTS, and a migration
 * that cannot be run twice is one that cannot be recovered halfway. */
drop policy if exists "a workspace is visible to the people in it" on public.workspaces;
drop policy if exists "a workspace is created by the person who owns it" on public.workspaces;
drop policy if exists "a workspace is renamed by its owner" on public.workspaces;
drop policy if exists "a workspace is deleted by its owner, unless it is their own" on public.workspaces;
drop policy if exists "membership is visible to the workspace" on public.workspace_members;
drop policy if exists "an admin invites people" on public.workspace_members;
drop policy if exists "an admin changes what somebody may do" on public.workspace_members;
drop policy if exists "an admin removes anybody, and anybody may leave" on public.workspace_members;

create policy "a workspace is visible to the people in it"
  on public.workspaces for select
  using ((select auth.uid()) = owner_id or private.is_workspace_member(id));

create policy "a workspace is created by the person who owns it"
  on public.workspaces for insert
  with check ((select auth.uid()) = owner_id);

create policy "a workspace is renamed by its owner"
  on public.workspaces for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

/*
 * A personal workspace is not deletable. It is where a person's own boards
 * live, and an account without one cannot create a board at all.
 */
create policy "a workspace is deleted by its owner, unless it is their own"
  on public.workspaces for delete
  using ((select auth.uid()) = owner_id and not personal);

create policy "membership is visible to the workspace"
  on public.workspace_members for select
  using (private.is_workspace_member(workspace_id));

create policy "an admin invites people"
  on public.workspace_members for insert
  with check (private.is_workspace_admin(workspace_id));

create policy "an admin changes what somebody may do"
  on public.workspace_members for update
  using (private.is_workspace_admin(workspace_id))
  with check (private.is_workspace_admin(workspace_id));

create policy "an admin removes anybody, and anybody may leave"
  on public.workspace_members for delete
  using (private.is_workspace_admin(workspace_id) or (select auth.uid()) = user_id);

/*
 * And a new account gets its workspace on the way in, for the same reason the
 * backfill gave one to every existing account.
 */
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_workspace uuid;
begin
  -- Whatever the person offered, then the local part of their email, then a
  -- last resort. A profile with no name is a cursor with no label.
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Someone'
  );

  insert into public.profiles (id, display_name, hue)
  values (
    new.id,
    v_name,
    -- An index into the presence palette. Random so that two people who sign up
    -- together are not the same colour on the board.
    floor(random() * 6)::smallint
  )
  on conflict (id) do nothing;

  insert into public.workspaces (name, owner_id, personal)
  values (left(v_name, 80), new.id, true)
  on conflict do nothing;

  /*
   * Looked up rather than returned from the insert. `on conflict do nothing`
   * returns no row when it does nothing, so a `returning` would leave this
   * null exactly when the workspace already exists — and the membership that
   * makes the workspace usable would be skipped on the one path where it
   * might be missing.
   */
  select w.id into v_workspace
  from public.workspaces w
  where w.owner_id = new.id and w.personal;

  if v_workspace is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace, new.id, 'admin')
    on conflict (workspace_id, user_id) do nothing;
  end if;

  return new;
end;
$$;
