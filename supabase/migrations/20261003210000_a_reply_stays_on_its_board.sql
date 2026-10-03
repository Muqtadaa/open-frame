-- A reply stays on its board.
--
-- `parent_id` was checked only by its foreign key, which asks whether the
-- parent EXISTS, not where. So anybody on board A could hang a comment from a
-- thread on board B by naming that thread's id: through `post_comment`, by
-- inserting into the table directly (the insert policy checks the comment's
-- own board, not its parent's), or by moving one of their own replies with an
-- update. Each was tried against these migrations before this one, and each
-- went through.
--
-- A trigger rather than a check in `post_comment`, because the function is
-- only one of the three doors. The rule belongs to the row, so it holds
-- however the row is written.

create or replace function private.a_reply_stays_on_its_board()
returns trigger
language plpgsql
-- Definer, so the parent is found whoever is asking. Under the inserter's own
-- row-level security a thread on a board they cannot see would simply be
-- missing, which happens to refuse too, but for a reason nobody chose.
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Nothing moves a comment once it is posted: an edit changes its words,
    -- resolving changes its state. A board or a parent that changes is a
    -- comment being carried somewhere else.
    if new.board_id is distinct from old.board_id
      or new.parent_id is distinct from old.parent_id then
      raise exception 'A comment stays where it was posted'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.parent_id is not null and not exists (
    select 1
    from public.board_comments p
    where p.id = new.parent_id
      and p.board_id = new.board_id
  ) then
    raise exception 'That thread is not on this board'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function private.a_reply_stays_on_its_board() from public, anon, authenticated;

drop trigger if exists a_reply_stays_on_its_board on public.board_comments;

create trigger a_reply_stays_on_its_board
  before insert or update of board_id, parent_id on public.board_comments
  for each row
  execute function private.a_reply_stays_on_its_board();
