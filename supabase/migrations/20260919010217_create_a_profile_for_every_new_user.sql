-- A profile is created by the database, not by the client.
--
-- The alternative — the app inserting its own profile after signing in — has a
-- window where a signed-in user has no profile, and it depends on a code path
-- that only runs when sign-up succeeds AND the tab stays open. A trigger has
-- neither problem, and it keeps working unchanged when a second sign-in method
-- arrives, because every method ends at a row in `auth.users`.
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, hue)
  values (
    new.id,
    -- Whatever the person offered, then the local part of their email, then a
    -- last resort. A profile with no name is a cursor with no label.
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Someone'
    ),
    -- An index into the presence palette. Random so that two people who sign up
    -- together are not the same colour on the board.
    floor(random() * 6)::smallint
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();
