-- OpenFrame identity, Phase 4 Stage 3.
--
-- An account is for OWNERSHIP and board lists, not for getting into a board.
-- That decision shapes this whole schema: `boards.visibility` defaults to
-- 'link', so registering a board gives it an owner and a title without taking
-- it away from the people who already have the link.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  -- An index into the presence palette, never a colour value. The palette is
  -- defined in styles.css and differs between themes; storing #hex here would
  -- be a second source of truth that cannot follow a restyle.
  hue smallint not null default 0 check (hue between 0 and 5),
  created_at timestamptz not null default now()
);

create table public.boards (
  -- Our own id, not a uuid: this string is the Durable Object's NAME and the
  -- thing in the URL, so the constraint is the room's, not Postgres's taste.
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Untitled board' check (char_length(title) <= 200),
  -- 'link'    anyone holding the link may open it, which is how every board
  --           works today and must keep working.
  -- 'members' only people on board_members.
  visibility text not null default 'link' check (visibility in ('link', 'members')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index boards_owner_id_idx on public.boards (owner_id);

create table public.board_members (
  board_id text not null references public.boards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create index board_members_user_id_idx on public.board_members (user_id);

-- Membership, answered WITHOUT row-level security.
--
-- These exist to break a mutual recursion rather than for convenience: a
-- `boards` policy that reads `board_members` and a `board_members` policy that
-- reads `boards` is a loop Postgres cannot resolve. A definer function reads
-- the table with RLS bypassed, so the cycle never forms.
--
-- `set search_path = ''` is not decoration. A security definer function with a
-- mutable search path can be made to call somebody else's `board_members`.
create or replace function public.is_board_member(target_board text)
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

create or replace function public.is_board_owner(target_board text)
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

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.board_members enable row level security;

-- PROFILES. Your own, and only your own.
--
-- Deliberately not readable by collaborators: a name reaches other people over
-- the presence channel, published by its owner, so there is nothing here anyone
-- else needs. The moment a board list wants to show who else is on a board,
-- that is a policy to add with its own reasoning, not one to have left open.
create policy "profiles are readable by their owner"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles are created by their owner"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles are updated by their owner"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- BOARDS.
create policy "boards are readable by their owner and members"
  on public.boards for select to authenticated
  using ((select auth.uid()) = owner_id or public.is_board_member(id));

create policy "a board is created by the person who owns it"
  on public.boards for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "boards are updated by their owner"
  on public.boards for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "boards are deleted by their owner"
  on public.boards for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- BOARD MEMBERS.
create policy "membership is visible to the board's owner and its members"
  on public.board_members for select to authenticated
  using (public.is_board_owner(board_id) or public.is_board_member(board_id));

create policy "only a board's owner adds members"
  on public.board_members for insert to authenticated
  with check (public.is_board_owner(board_id));

create policy "a board's owner removes anyone, and anyone may remove themselves"
  on public.board_members for delete to authenticated
  using (public.is_board_owner(board_id) or (select auth.uid()) = user_id);

-- `updated_at` is maintained by the database rather than by whoever remembers.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger boards_touch_updated_at
  before update on public.boards
  for each row execute function public.touch_updated_at();
