-- The upsert already refused to demote an editor who opens a view link. What
-- it RETURNED was the key's role rather than the role now held, so the caller
-- was told 'viewer' about somebody the database had correctly left an editor.
--
-- Found by probing the function against the real database rather than reading
-- it: a transaction that joined with the view key, then the edit key, then the
-- view key again, and printed both the answer and the stored row each time.
-- Nothing downstream had acted on the answer yet, which is when to fix it.

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

  -- A board that does not exist and a key that does not open one answer
  -- identically. Anything else turns this into a way of asking which board
  -- ids are real, one guess at a time.
  if v_role is null then
    return null;
  end if;

  -- An owner is not a member of their own board; the row would be a second,
  -- weaker answer to a question `boards.owner_id` already settles.
  if v_owner = v_user then
    return 'owner';
  end if;

  insert into public.board_members as m (board_id, user_id, role)
  values (p_id, v_user, v_role)
  on conflict (board_id, user_id) do update
    -- An edit link upgrades a viewer. A view link never demotes an editor:
    -- being handed the weaker link is not a revocation, and treating it as one
    -- would let somebody downgrade themselves by opening the wrong message.
    set role = case when m.role = 'editor' then 'editor' else excluded.role end
  returning m.role into v_held;

  -- What you hold, not what the link was worth. They differ exactly when an
  -- editor opens a view link, which is the case the upsert exists for.
  return v_held;
end;
$$;
