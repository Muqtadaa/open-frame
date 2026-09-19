-- The board's owner gets a key of their own.
--
-- A password on a board's links is set by its OWNER and by nobody else, and
-- the owner is never asked for it on their own board. Neither is expressible
-- with the two keys that existed: everybody invited to change the board holds
-- the edit link, so authorizing against it authorizes every editor.
--
-- The room mints a third key at claim time and this column is where it lives —
-- readable only by the board's owner, exactly as `viewer_key` became. That is
-- what makes it mean "owner": not a verified identity, but a key the owner is
-- the only one ever given. The same trust model the other two keys rest on.
--
-- It is never in a link anybody can be sent. It reaches the room on the socket
-- and on the endpoint that sets the password, and nowhere else.

alter table public.boards add column if not exists owner_key text;

-- Nobody reads a board's keys through the table. Every read goes through
-- `my_boards()`, which is SECURITY DEFINER and decides per row who gets what —
-- the same reason the other two keys are not selectable either.
revoke select (owner_key) on public.boards from authenticated, anon;

drop function if exists public.record_shared_board(text, text, text, text);

create function public.record_shared_board(
  p_id text,
  p_title text,
  p_editor_key text,
  p_viewer_key text,
  p_owner_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'A board is recorded by the person who owns it';
  end if;

  insert into public.boards (id, owner_id, title, editor_key, viewer_key, owner_key)
  values (p_id, (select auth.uid()), p_title, p_editor_key, p_viewer_key, p_owner_key);
end;
$$;

revoke all on function public.record_shared_board(text, text, text, text, text) from public, anon;
grant execute on function public.record_shared_board(text, text, text, text, text) to authenticated;

-- Where a board claimed before owner keys existed records the one it adopted.
--
-- Only its owner may, and only ONCE: `owner_key is null` in the predicate is
-- what stops a second write replacing the key with one somebody else minted,
-- which would hand them the board's password.
create or replace function public.record_owner_key(p_id text, p_owner_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated int;
begin
  update public.boards
  set owner_key = p_owner_key
  where id = p_id
    and owner_id = (select auth.uid())
    and owner_key is null;

  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

revoke all on function public.record_owner_key(text, text) from public, anon;
grant execute on function public.record_owner_key(text, text) to authenticated;

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
    -- The second link, for the owner and nobody else.
    case when b.owner_id = (select auth.uid()) then b.viewer_key end as view_key,
    -- The third key, which is not a link at all.
    case when b.owner_id = (select auth.uid()) then b.owner_key end as owner_key,
    b.updated_at,
    p.pinned_at is not null as pinned,
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
