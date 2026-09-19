-- Every board now has to have a workspace, so the one thing that creates a
-- board has to give it one.
--
-- The previous migration made `boards.workspace_id` NOT NULL without touching
-- this function, and every board creation from the deployed build began failing
-- immediately. Found by probing the deployed call shape against the real
-- database rather than by reading: nothing in the repository mentions
-- `workspace_id`, so nothing looked wrong.
--
-- The lesson is narrower than "run the tests". A NOT NULL column added to a
-- table is a change to every writer of that table, and the writers are in the
-- database, where the type checker cannot see them.
--
-- The old five-argument function is dropped EXPLICITLY. Postgres overloads on
-- signature, so `create or replace` with an added defaulted parameter makes a
-- second function rather than replacing the first, and a five-argument call
-- then matches both and is refused as ambiguous. That is the same trap the
-- comment migration documented, and it was walked into again anyway — this
-- time caught because the probe asked for the DEPLOYED call shape, not the new
-- one.

drop function if exists public.record_shared_board(text, text, text, text, text);

create or replace function public.record_shared_board(
  p_id text,
  p_title text,
  p_editor_key text,
  p_viewer_key text,
  p_owner_key text default null,
  p_workspace_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_workspace uuid;
begin
  if v_me is null then
    raise exception 'A board is recorded by the person who owns it';
  end if;

  /*
   * No workspace named means the person's own, which is what the deployed
   * build asks for by saying nothing. Keeping that the default is what lets
   * this ship before the interface knows workspaces exist.
   */
  if p_workspace_id is null then
    select w.id into v_workspace
    from public.workspaces w
    where w.owner_id = v_me and w.personal;
  else
    /*
     * A named workspace is CHECKED, not trusted. This function is security
     * definer, so an unchecked id here would let anybody file a board into
     * somebody else's workspace — visible to every member of it, and owned by
     * a stranger.
     */
    select w.id into v_workspace
    from public.workspaces w
    where w.id = p_workspace_id
      and (w.owner_id = v_me or private.is_workspace_member(w.id));
  end if;

  if v_workspace is null then
    raise exception 'That workspace is not one you can put a board in';
  end if;

  insert into public.boards (id, owner_id, title, editor_key, viewer_key, owner_key, workspace_id)
  values (p_id, v_me, p_title, p_editor_key, p_viewer_key, p_owner_key, v_workspace);
end;
$$;

revoke all on function public.record_shared_board(text, text, text, text, text, uuid)
  from public, anon;
grant execute on function public.record_shared_board(text, text, text, text, text, uuid)
  to authenticated;
