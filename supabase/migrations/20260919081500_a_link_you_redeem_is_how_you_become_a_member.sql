-- "Shared with me" was structurally impossible, and had been since the schema
-- was written.
--
-- `board_members` has had its policies from the start, and the insert one says
-- ONLY A BOARD'S OWNER ADDS MEMBERS. Nothing in the application has ever
-- inserted a row, and nothing could have: a person arriving on a link is
-- refused by that policy, so opening somebody's board made you a guest in the
-- ROOM and nothing at all in the DATABASE. The board therefore never reached
-- your list, however many times you opened it.
--
-- The fix is not to loosen the policy. It is to notice that the LINK is the
-- invitation: whoever holds a board's key has already been given the access
-- the membership would record. Redeeming it is what this function does, and
-- it grants nothing the holder did not already have — it only writes down
-- that they have it, so the board can be listed.

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
    set role = case when m.role = 'editor' then 'editor' else excluded.role end;

  return v_role;
end;
$$;

revoke all on function public.join_board(text, text) from public, anon;
grant execute on function public.join_board(text, text) to authenticated;

comment on function public.join_board(text, text) is
  'Redeems a board link for membership. Returns the role held, or null when the key does not open that board.';
