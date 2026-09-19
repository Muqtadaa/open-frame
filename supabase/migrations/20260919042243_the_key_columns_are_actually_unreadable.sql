-- The previous migration's `revoke select (editor_key, viewer_key)` reported
-- success and changed nothing.
--
-- A column-level REVOKE cannot subtract from a TABLE-level grant: Postgres
-- holds one blanket SELECT that covers every column, present and future, and a
-- column revoke only removes column-level grants. Supabase grants that blanket
-- to anon and authenticated on every table in `public`, so the keys stayed
-- readable by anyone the row policy admitted — which for a board's own owner is
-- every row of theirs, including the viewer key a viewer should be getting
-- instead of the editor one.
--
-- Found by reading `information_schema.column_privileges` back afterwards
-- rather than by trusting that the statement had done what it said. Both
-- columns then probed as `authenticated`: REFUSED, with `title` still
-- READABLE.
--
-- The only way is to drop the blanket and name what may be read.

revoke select on public.boards from anon, authenticated;

grant select (id, owner_id, title, visibility, created_at, updated_at)
  on public.boards to anon, authenticated;
