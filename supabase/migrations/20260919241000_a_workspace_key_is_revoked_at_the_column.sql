-- `revoke select (column)` does NOTHING while a table-level SELECT grant
-- exists.
--
-- The table-level grant already covers every column — including ones added
-- later — and a column-level revoke cannot carve a hole in it. The previous
-- migration used exactly that no-op, and a workspace VIEWER could read the
-- EDITOR key straight off the table: the entire difference between the two
-- links, undone, by a statement that succeeded and reported nothing wrong.
--
-- Found by probing, not by reading. `revoke select (editor_key, viewer_key)`
-- looks exactly like what it is meant to do, the statement returns success,
-- and the permission it claims to remove is still there. The only way to see
-- it is to become a viewer and ask for the key.
--
-- The repair is what `boards` has always done: no table-level SELECT at all,
-- and the readable columns named one at a time. A column added to this table
-- in future is unreadable until somebody names it here, which is the right way
-- round for a table that holds keys.

revoke select on public.workspaces from authenticated, anon;

grant select (id, name, owner_id, personal, created_at)
  on public.workspaces to authenticated;
