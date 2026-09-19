-- The view-only link could not be recovered after the moment of sharing.
--
-- `my_boards()` hands back ONE key, the one your role entitles you to, and an
-- owner's is the editor key. So the two links were shown once, in the panel
-- that appears when a board is shared, and after that the weaker one was
-- unreachable — you could only ever send the link that lets people change the
-- board. That is half of the feature.
--
-- Returning both to an OWNER leaks nothing: they already hold the editor key,
-- which is strictly the more powerful of the two. A member still gets exactly
-- one, and it is still the one their role is worth — an editor has no business
-- handing out view-only links to somebody else's board, and a viewer has no
-- business holding the editor key at all.
--
-- Probed against the real database in a rolled-back transaction: owner gets
-- both, an editor member gets the editor key and a null second key, a viewer
-- member gets the viewer key, a null second key, and never the editor one.

drop function if exists public.my_boards();

create function public.my_boards()
returns table (
  id text,
  title text,
  role text,
  access_key text,
  view_key text,
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
