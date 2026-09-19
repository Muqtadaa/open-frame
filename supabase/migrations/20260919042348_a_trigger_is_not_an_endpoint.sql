-- `create_profile_for_new_user` is a trigger on `auth.users`, and PostgREST was
-- publishing it at `/rest/v1/rpc/create_profile_for_new_user` for anyone at
-- all, signed in or not. Reported by Supabase's own linter.
--
-- Calling it that way fails on the missing `NEW` record, so this is not a hole
-- anybody could have walked through. It is still an endpoint that was never
-- meant to exist, on a `SECURITY DEFINER` function — the combination worth
-- never being casual about. A trigger runs as the table's owner whatever the
-- grants say, so removing EXECUTE costs the trigger nothing.

revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;
