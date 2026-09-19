-- Comments on a board, and the mentions that notify people about them.
--
-- NOT canvas objects. A comment is not a thing on the board in the sense the
-- registry means: making it one would put it in the layer tree, in undo, in
-- export, in search and in the object type registry, and deleting the element
-- it was dropped on would delete the discussion about that element.
--
-- NOT in the CRDT either, which is the less obvious half. The room knows who
-- is connected right now and nothing else, and a mention has to reach somebody
-- who is NOT on the board — that is most of what a mention is for. A
-- notification also needs per-person read state, which is a table. The cost is
-- a round trip where canvas edits have none, and a board that was never shared
-- cannot have comments. A comment with nobody to read it is not worth the
-- machinery.

create table if not exists public.board_comments (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.boards(id) on delete cascade,
  /*
   * A reply belongs to a thread; a thread has no parent. One table rather than
   * two, because a reply is the same thing said later — and `on delete
   * cascade` then means removing a thread removes its replies without a second
   * statement that could be forgotten.
   */
  parent_id uuid references public.board_comments(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  /*
   * WHERE IT IS PINNED, in board coordinates. Null on a reply, which is shown
   * under its thread rather than anywhere on the canvas.
   */
  x double precision,
  y double precision,
  /*
   * What it was dropped on, if anything.
   *
   * Deliberately NOT a foreign key: objects live in the board document, not in
   * this database, and there is nothing here to point at. That is also what
   * makes a deleted element harmless — the comment keeps its own coordinates
   * and stays exactly where it was put, and the interface says the thing it
   * was attached to is gone.
   */
  object_id text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A thread is pinned somewhere; a reply never is.
  constraint pinned_threads_only check (
    (parent_id is null and x is not null and y is not null)
    or (parent_id is not null and x is null and y is null and object_id is null)
  )
);

create index if not exists board_comments_board_idx on public.board_comments (board_id, created_at);
create index if not exists board_comments_parent_idx on public.board_comments (parent_id);

alter table public.board_comments enable row level security;

-- Exactly who can see the board. Comments are not more private than the thing
-- they are about, and not less.
create policy "comments are readable by the board's owner and members"
  on public.board_comments for select
  using (private.is_board_owner(board_id) or private.is_board_member(board_id));

create policy "anyone on the board may comment, as themselves"
  on public.board_comments for insert
  with check (
    (select auth.uid()) = author_id
    and (private.is_board_owner(board_id) or private.is_board_member(board_id))
  );

/*
 * Editing is the AUTHOR's; resolving is anyone on the board's.
 *
 * Two different acts wearing one verb. Rewriting what somebody said is theirs
 * alone; marking a discussion finished is the board's business, and a thread
 * only its author could close is one that outlives whoever left.
 */
create policy "an author edits their own comment"
  on public.board_comments for update
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

create policy "an author deletes their own comment"
  on public.board_comments for delete
  using ((select auth.uid()) = author_id or private.is_board_owner(board_id));

/*
 * Who has been told about what.
 *
 * The per-person read state that the CRDT could not hold, and the reason
 * comments live here at all.
 */
create table if not exists public.comment_mentions (
  comment_id uuid not null references public.board_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_mentions_unread_idx
  on public.comment_mentions (user_id, read_at);

alter table public.comment_mentions enable row level security;

-- You see your own mentions. Not who else was mentioned: that is the comment's
-- text, which you can already read if you are on the board.
create policy "your own mentions"
  on public.comment_mentions for select
  using ((select auth.uid()) = user_id);

create policy "you mark your own mentions read"
  on public.comment_mentions for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/*
 * Mentions are written by the author of the comment, for people who are on the
 * board. Both halves matter: without the first anyone could manufacture a
 * notification, and without the second a mention could be used to find out
 * whether a given account exists.
 */
create policy "a comment's author mentions people who are on the board"
  on public.comment_mentions for insert
  with check (
    exists (
      select 1 from public.board_comments c
      where c.id = comment_id
        and c.author_id = (select auth.uid())
        and (private.is_board_owner(c.board_id) or private.is_board_member(c.board_id))
    )
  );
