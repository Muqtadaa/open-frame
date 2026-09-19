-- Where a pin sits when the thing it is about moves.
--
-- A comment dropped on an element stored only absolute board coordinates, so
-- moving the element left the pin behind and the remark ended up pointing at
-- empty canvas. A fraction of the element's box rides both a move and a
-- resize, and keeps the pin on the PART of the thing it was about — the corner
-- somebody was objecting to stays the corner.
--
-- Added BESIDE x and y rather than replacing them, which is the whole design.
-- A purely fractional anchor has no position at all once its element is gone,
-- and a comment outliving its element is a promise this product already made:
-- the discussion survives, and the interface says the thing it referred to
-- does not. So x and y keep holding where the pin was dropped and become the
-- fallback, while fx and fy carry the anchor.
--
-- Rows written before this migration have both null and go on behaving exactly
-- as they did. Nothing is rewritten: their coordinates are already correct,
-- and converting them would mean reading element bounds this database has
-- never had and asserting the board has not changed since.

alter table public.board_comments
  add column if not exists fx double precision,
  add column if not exists fy double precision;

/*
 * Outside 0..1 is not a point on the element, and a pin drawn from one lands
 * somewhere off it. Checked here rather than only in the client because the
 * client is not the only thing that will ever write a comment.
 *
 * Null passes: that is a comment anchored the old way, or one not on an
 * element at all.
 */
alter table public.board_comments
  drop constraint if exists board_comments_fraction_is_on_the_element;

alter table public.board_comments
  add constraint board_comments_fraction_is_on_the_element check (
    (fx is null or (fx >= 0 and fx <= 1)) and (fy is null or (fy >= 0 and fy <= 1))
  );

/*
 * And a fraction OF NOTHING is not a position. Both halves together, or
 * neither, and never without the element they are a fraction of.
 */
alter table public.board_comments
  drop constraint if exists board_comments_fraction_needs_an_element;

alter table public.board_comments
  add constraint board_comments_fraction_needs_an_element check (
    (fx is null and fy is null) or (fx is not null and fy is not null and object_id is not null)
  );

/*
 * The reader carries the anchor out.
 *
 * DROPPED first, not replaced. A function's OUT parameters are its return row
 * type, and Postgres refuses `create or replace` outright when that changes —
 * so a migration that only replaced would fail on a database that already had
 * the old one, which is every database this will ever run against.
 *
 * The two columns go on the END of the row for the same reason: a client reads
 * these by name, and a reordered row is a silent change of meaning for
 * anything that does not.
 */
drop function if exists public.board_comments_for(text);

create function public.board_comments_for(p_board_id text)
returns table (
  id uuid,
  parent_id uuid,
  author_id uuid,
  author_name text,
  author_hue smallint,
  body text,
  x double precision,
  y double precision,
  object_id text,
  resolved_at timestamptz,
  created_at timestamptz,
  fx double precision,
  fy double precision
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    c.id,
    c.parent_id,
    c.author_id,
    coalesce(p.display_name, 'Someone'),
    coalesce(p.hue, 0::smallint),
    c.body,
    c.x,
    c.y,
    c.object_id,
    c.resolved_at,
    c.created_at,
    c.fx,
    c.fy
  from public.board_comments c
  left join public.profiles p on p.id = c.author_id
  where c.board_id = p_board_id
    and (
      select private.is_board_owner(p_board_id) or private.is_board_member(p_board_id)
    )
  order by c.created_at;
$$;

revoke all on function public.board_comments_for(text) from public, anon;
grant execute on function public.board_comments_for(text) to authenticated;

/*
 * And the writer takes one. Defaulted, so a comment that is not on an element
 * — most of them — is posted exactly as before.
 *
 * The old seven-argument function is dropped explicitly. Postgres overloads on
 * signature, so adding parameters creates a SECOND function rather than
 * replacing the first, and the stale one would keep its grant and go on
 * writing comments that can never ride anything.
 */
drop function if exists public.post_comment(
  text, text, uuid, double precision, double precision, text, uuid[]
);

create or replace function public.post_comment(
  p_board_id text,
  p_body text,
  p_parent_id uuid default null,
  p_x double precision default null,
  p_y double precision default null,
  p_object_id text default null,
  p_mentions uuid[] default '{}',
  p_fx double precision default null,
  p_fy double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'A comment is written by somebody';
  end if;
  if not (private.is_board_owner(p_board_id) or private.is_board_member(p_board_id)) then
    raise exception 'That board is not yours to comment on';
  end if;

  insert into public.board_comments (
    board_id, parent_id, author_id, body, x, y, object_id, fx, fy
  )
  values (p_board_id, p_parent_id, v_me, p_body, p_x, p_y, p_object_id, p_fx, p_fy)
  returning id into v_id;

  insert into public.comment_mentions (comment_id, user_id)
  select v_id, m.user_id
  from unnest(p_mentions) as m(user_id)
  where m.user_id <> v_me
    and (
      m.user_id = (select b.owner_id from public.boards b where b.id = p_board_id)
      or m.user_id in (select bm.user_id from public.board_members bm where bm.board_id = p_board_id)
    )
  on conflict do nothing;

  return v_id;
end;
$$;

revoke all on function public.post_comment(
  text, text, uuid, double precision, double precision, text, uuid[],
  double precision, double precision
) from public, anon;

grant execute on function public.post_comment(
  text, text, uuid, double precision, double precision, text, uuid[],
  double precision, double precision
) to authenticated;
