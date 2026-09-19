-- A board's two links, and the list that hands you the right one.
--
-- The keys live here as well as in the Durable Object, and that is a real
-- cost stated plainly: the credential exists in two places, so a database
-- breach is board access. Row-level security is what stands in the way, which
-- is why the columns are revoked outright below rather than merely policed —
-- a policy decides which ROWS you see, and every row of your own board is one
-- you are allowed to see.
--
-- The alternative was the Worker resolving identity against Supabase on every
-- socket, which is the right end state and more machinery than this stage
-- needs. Chosen by the owner on 2026-09-19.

alter table public.boards
  add column if not exists editor_key text
    check (editor_key is null or editor_key ~ '^[0-9a-f]{32}$'),
  add column if not exists viewer_key text
    check (viewer_key is null or viewer_key ~ '^[0-9a-f]{32}$');

-- Nullable on purpose: a board shared before links had roles has no keys, and
-- the room still admits its link. Refusing those rows here would describe a
-- world the Worker does not live in.
comment on column public.boards.editor_key is
  'Opens the room with write access. Never selectable by a client; read through public.my_boards().';
comment on column public.boards.viewer_key is
  'Opens the room read-only. Never selectable by a client; read through public.my_boards().';

-- The whole point. Without this, "select * from boards" hands an editor key to
-- anyone the row policy lets through, which for a viewer is the wrong one.
revoke select (editor_key, viewer_key) on public.boards from anon, authenticated;

-- Insert needs naming, because a bare grant does not cover columns that select
-- cannot see.
grant insert (id, owner_id, title, editor_key, viewer_key) on public.boards to authenticated;

/*
 * Your boards, each with the ONE key your role entitles you to.
 *
 * `security definer` because the caller cannot read the key columns at all —
 * that is the point of the revoke above. The function is the only door, and
 * it opens onto exactly the rows `auth.uid()` already owns or belongs to.
 */
create or replace function public.my_boards()
returns table (
  id text,
  title text,
  role text,
  access_key text,
  updated_at timestamptz
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
    b.updated_at
  from public.boards b
  left join public.board_members m
    on m.board_id = b.id and m.user_id = (select auth.uid())
  where b.owner_id = (select auth.uid()) or m.user_id is not null
  order by b.updated_at desc;
$$;

revoke all on function public.my_boards() from public, anon;
grant execute on function public.my_boards() to authenticated;

/*
 * Records a board somebody has just shared, with the keys the room minted.
 *
 * A function rather than an insert through PostgREST, so the keys are written
 * by something that names them once — and so a guest, who has no `auth.uid()`,
 * is refused here rather than by a policy error that reads like a bug.
 */
create or replace function public.record_shared_board(
  p_id text,
  p_title text,
  p_editor_key text,
  p_viewer_key text
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

  insert into public.boards (id, owner_id, title, editor_key, viewer_key)
  values (p_id, (select auth.uid()), p_title, p_editor_key, p_viewer_key);
end;
$$;

revoke all on function public.record_shared_board(text, text, text, text) from public, anon;
grant execute on function public.record_shared_board(text, text, text, text) to authenticated;

/*
 * Keeps the listed name in step with the board's own.
 *
 * The title a person reads in their list is a COPY: the real one lives in the
 * document, which only the room and the browser holding it can see. So a
 * rename has to say so here too, and only the owner may — which is not a
 * limitation today, because nothing yet adds anybody else as a member.
 */
create or replace function public.rename_board(p_id text, p_title text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.boards
     set title = p_title, updated_at = now()
   where id = p_id and owner_id = (select auth.uid());
$$;

revoke all on function public.rename_board(text, text) from public, anon;
grant execute on function public.rename_board(text, text) to authenticated;
