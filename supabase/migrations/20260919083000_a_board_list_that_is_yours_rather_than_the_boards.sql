-- The list was the BOARDS' order, not yours.
--
-- `my_boards()` ordered by `updated_at`, which is when a board last CHANGED.
-- On a shared board that is somebody else's typing, so a collaborator editing
-- at midnight reordered your list while you slept. Recency is a fact about a
-- READER, and there was nowhere to keep one.
--
-- So: two facts per person per board — whether you pinned it, and when you
-- last opened it — and the list becomes pinned first, then your own order,
-- with "edited 4 minutes ago" demoted to what it always was, information.

create table public.board_prefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  board_id text not null references public.boards (id) on delete cascade,
  pinned_at timestamptz,
  opened_at timestamptz not null default now(),
  primary key (user_id, board_id)
);

-- The list is read by user, every time the front door opens.
create index board_prefs_user_idx on public.board_prefs (user_id);

comment on column public.board_prefs.pinned_at is
  'Null means not pinned. A timestamp rather than a boolean so pinned boards can later be ordered by when they were pinned.';

alter table public.board_prefs enable row level security;

-- Yours alone, in every direction. Nothing about how you order your own list
-- is anybody else's business, including the board's owner.
create policy "your own board preferences"
  on public.board_prefs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/*
 * Pin or unpin, without needing to know whether a row exists yet.
 *
 * A definer function for the same reason the others are: it refuses a board
 * you cannot see, rather than letting an insert fail against a foreign key
 * and reporting that as a bug.
 */
create or replace function public.set_board_pinned(p_id text, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Pinning a board is something an account does';
  end if;

  -- Silently does nothing for a board you cannot see. Raising here would
  -- confirm that a board id exists, which is the same leak join_board avoids.
  if not exists (
    select 1 from public.boards b
     left join public.board_members m on m.board_id = b.id and m.user_id = v_user
     where b.id = p_id and (b.owner_id = v_user or m.user_id is not null)
  ) then
    return;
  end if;

  insert into public.board_prefs (user_id, board_id, pinned_at)
  values (v_user, p_id, case when p_pinned then now() end)
  on conflict (user_id, board_id) do update
    set pinned_at = case when p_pinned then now() end;
end;
$$;

revoke all on function public.set_board_pinned(text, boolean) from public, anon;
grant execute on function public.set_board_pinned(text, boolean) to authenticated;

/*
 * Records that you opened a board, which is what the list is ordered by.
 *
 * Deliberately not `updated_at`: opening is not editing, and a list ordered by
 * what OTHER people changed is a list that rearranges itself while you are
 * looking away.
 */
create or replace function public.touch_board_opened(p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    return;
  end if;

  if not exists (
    select 1 from public.boards b
     left join public.board_members m on m.board_id = b.id and m.user_id = v_user
     where b.id = p_id and (b.owner_id = v_user or m.user_id is not null)
  ) then
    return;
  end if;

  insert into public.board_prefs (user_id, board_id, opened_at)
  values (v_user, p_id, now())
  on conflict (user_id, board_id) do update set opened_at = now();
end;
$$;

revoke all on function public.touch_board_opened(text) from public, anon;
grant execute on function public.touch_board_opened(text) to authenticated;

/*
 * Deleting a board, which only its owner may do.
 *
 * A member leaving is a DIFFERENT verb with a different function, because the
 * two look alike in an interface and must not be alike here: one removes a
 * board from everybody, the other removes you from a board.
 *
 * The room's own storage is destroyed separately, by the client, against the
 * Worker — that credential is the editor key and this database is not where it
 * gets spent. Returning false rather than raising lets the caller tell "not
 * yours" from "the network fell over" without parsing an error string.
 */
create or replace function public.delete_board(p_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_deleted int;
begin
  if v_user is null then
    return false;
  end if;

  delete from public.boards where id = p_id and owner_id = v_user;
  get diagnostics v_deleted = row_count;
  -- board_members and board_prefs go with it: both cascade on board_id.
  return v_deleted > 0;
end;
$$;

revoke all on function public.delete_board(text) from public, anon;
grant execute on function public.delete_board(text) to authenticated;

/*
 * Removing yourself from somebody else's board.
 *
 * An owner cannot use this — there would be nobody left to own it, and the
 * board would be unreachable rather than deleted. They delete instead.
 */
create or replace function public.leave_board(p_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_left int;
begin
  if v_user is null then
    return false;
  end if;

  delete from public.board_members where board_id = p_id and user_id = v_user;
  get diagnostics v_left = row_count;

  -- Your own ordering of a board you are no longer on is not worth keeping.
  delete from public.board_prefs where board_id = p_id and user_id = v_user;

  return v_left > 0;
end;
$$;

revoke all on function public.leave_board(text) from public, anon;
grant execute on function public.leave_board(text) to authenticated;

/*
 * The list, now carrying what it takes to order itself.
 *
 * Dropped and recreated rather than replaced: the return TABLE gains columns,
 * and `create or replace` cannot change a function's result type.
 */
drop function if exists public.my_boards();

create function public.my_boards()
returns table (
  id text,
  title text,
  role text,
  access_key text,
  updated_at timestamptz,
  pinned boolean,
  opened_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    b.id,
    b.title,
    case when b.owner_id = (select auth.uid()) then 'owner' else m.role end as role,
    case
      when b.owner_id = (select auth.uid()) then b.editor_key
      when m.role = 'viewer' then b.viewer_key
      else b.editor_key
    end as access_key,
    b.updated_at,
    p.pinned_at is not null as pinned,
    -- A board you have never opened on this account falls back to when it
    -- last changed, so a freshly shared board does not sink to the bottom of
    -- the list the moment somebody hands it to you.
    coalesce(p.opened_at, b.updated_at) as opened_at
  from public.boards b
  left join public.board_members m
    on m.board_id = b.id and m.user_id = (select auth.uid())
  left join public.board_prefs p
    on p.board_id = b.id and p.user_id = (select auth.uid())
  where b.owner_id = (select auth.uid()) or m.user_id is not null
  order by p.pinned_at is not null desc, coalesce(p.opened_at, b.updated_at) desc;
$$;

revoke all on function public.my_boards() from public, anon;
grant execute on function public.my_boards() to authenticated;
