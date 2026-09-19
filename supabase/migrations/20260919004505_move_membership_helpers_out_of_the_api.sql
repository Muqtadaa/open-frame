-- The membership helpers were reachable as `/rest/v1/rpc/is_board_member`.
--
-- They exist only to be called from inside a policy, where they break the
-- mutual recursion between `boards` and `board_members`. Exposed on the API
-- they are an endpoint nobody designed, and the security advisor was right to
-- say so.
--
-- Revoking EXECUTE is NOT the fix: a policy expression is evaluated as the
-- querying role, so a role that cannot execute the function cannot read the
-- table either. The fix is a schema PostgREST does not serve.

create schema if not exists private;

-- No default access. `authenticated` is granted exactly the two functions
-- below and nothing else that ever lands here.
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_board_member(target_board text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.board_members m
    where m.board_id = target_board
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_board_owner(target_board text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.boards b
    where b.id = target_board
      and b.owner_id = (select auth.uid())
  );
$$;

revoke all on function private.is_board_member(text) from public;
revoke all on function private.is_board_owner(text) from public;
grant execute on function private.is_board_member(text) to authenticated;
grant execute on function private.is_board_owner(text) to authenticated;

drop policy "boards are readable by their owner and members" on public.boards;
create policy "boards are readable by their owner and members"
  on public.boards for select to authenticated
  using ((select auth.uid()) = owner_id or private.is_board_member(id));

drop policy "membership is visible to the board's owner and its members" on public.board_members;
create policy "membership is visible to the board's owner and its members"
  on public.board_members for select to authenticated
  using (private.is_board_owner(board_id) or private.is_board_member(board_id));

drop policy "only a board's owner adds members" on public.board_members;
create policy "only a board's owner adds members"
  on public.board_members for insert to authenticated
  with check (private.is_board_owner(board_id));

drop policy "a board's owner removes anyone, and anyone may remove themselves" on public.board_members;
create policy "a board's owner removes anyone, and anyone may remove themselves"
  on public.board_members for delete to authenticated
  using (private.is_board_owner(board_id) or (select auth.uid()) = user_id);

drop function public.is_board_member(text);
drop function public.is_board_owner(text);
