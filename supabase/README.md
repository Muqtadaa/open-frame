# Database

Identity, ownership and membership. **Never the board itself** — a board's
contents live in its room's Durable Object
([ADR 0013](../docs/adr/0013-collaboration-transport-durable-objects.md)), which
is why a free project pausing after seven days idle blocks sign-in and the board
list rather than anyone's work.

## Migrations

`migrations/` is the source of truth and is applied in filename order. Every
change is a new file; none is edited once applied, for the same reason document
migrations are not (CLAUDE.md rule 6) — an applied migration has already run
somewhere.

The project these were applied to is on the free tier, in `us-east-2`, on
Postgres 17.

## What holds the rules

**Row-level security, not application code.** Every table has it on, and the
policies are the only place membership is decided — which is what lets the room
Worker authorize a connection by simply asking the database, as the user, and
seeing whether a row comes back. No second copy of the rule, and no service-role
key anywhere near the Worker.

Two things in here are subtle enough to be worth naming:

**The membership helpers live in `private`, not `public`.** A `boards` policy
that reads `board_members` and a `board_members` policy that reads `boards` is a
mutual recursion Postgres cannot resolve, so both go through `SECURITY DEFINER`
functions that read with RLS bypassed. Those functions were reachable at
`/rest/v1/rpc/is_board_member` while they sat in `public` — an endpoint nobody
designed, and the security advisor said so. Revoking `EXECUTE` is not the fix: a
policy expression is evaluated as the querying role, so a role that cannot
execute the function cannot read the table either. They moved to a schema
PostgREST does not serve.

**`boards.visibility` defaults to `link`.** Registering a board gives it an
owner, a title and a place in a board list without taking it away from the
people who already have the link. An account is for ownership, not for getting
into a board.

## Verifying a policy

Enabling RLS and never proving it refuses anything is the same trap as a test
that passes vacuously. The check that matters runs three users against one
board inside a transaction that rolls back:

```sql
begin;
-- ...insert two users, one board, one membership...
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
select count(*) from public.boards;
rollback;
```

Run against this schema it returns 1 for the owner, 1 for the member and **0
for a stranger**. A recursive policy pair creates without complaint and fails
only here, with `infinite recursion detected in policy`.
