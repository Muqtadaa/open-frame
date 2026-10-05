# ADR 0018 · AI clustering runs on the room server, and proposes copies

**Status:** Proposed · 2026-10-05 · built in PR E. Waiting on the owner to
accept it, to set the key, and to accept that note text is sent to Anthropic.
Cites ADR 0016.

## Context

A facilitator ends an ideation round with a wall of sticky notes and wants
them sorted into themes. A model does that well. Doing it at all means
deciding four things this project had deferred ("AI provider and model", "AI
preview UX" in the deferred decisions):

- **Where the key lives.** A Claude API key in the browser is a key anybody
  can lift from the page and spend.
- **Who may spend it, and how much.** A run costs money, and the board is
  open to anybody with an edit link.
- **What the model may do to a board.** ADR 0016 names "server-side AI" as a
  reason to revisit how far the room trusts what it relays.
- **What the person sees before anything changes.**

## Decision

1. **The room server calls the model; the browser never holds the key.**
   `POST /ai/cluster` on the rooms Worker holds `ANTHROPIC_API_KEY` as a
   Worker secret. The browser sends the notes' text and a bearer token. The
   official `@anthropic-ai/sdk` is the client, and a dependency-cruiser rule
   (`anthropic-sdk-lives-only-in-rooms`) keeps it in `apps/rooms/src/ai/`.
2. **Signed-in people only, counted per day.** The bearer token is checked
   with Supabase (`GET /auth/v1/user` with the publishable key), so signing
   out is honoured and no JWT library is needed. One Durable Object,
   `AiQuotaObject`, reserves a run before the model is asked: 20 per person
   and 1,000 for everybody per UTC day by default (`AI_DAILY_LIMIT`,
   `AI_GLOBAL_DAILY_LIMIT`). A Durable Object rather than KV, because a
   reservation must not be raced. A run that produces nothing usable (a
   refusal, a failure, an answer about notes it was not sent) is given back.
3. **The route never reads a room.** It sees only the text the browser sends
   for the selected notes, under refs (`n1`, `n2`, …), never object ids. So
   ADR 0016's trigger does not fire: the room still relays what editors write
   and reads none of it.
4. **The model's answer is held to a contract three times.** The API's
   structured output follows `ClusterAnswerSchema`. The Worker then checks it
   with `validateClusterProposal`: unknown or repeated refs are refused, and a
   forgotten note goes to "Other". The browser checks it again on arrival,
   because it is about to become objects (rule 8). The contract lives in
   `@openframe/core/ai`, read by both sides like the upload policy.
5. **A proposal makes COPIES; the originals are never touched.** The browser
   lays the themes out beside the notes: one frame holding a frame per theme,
   copies of the notes inside, and a `copiedFrom` relation from each copy to
   its note. It is one `CreateObjects`, dispatched with `origin: 'ai'`. That
   makes it one undo step, and on a shared board a change in the change log
   that anybody can revert.
6. **Nothing is written until the person applies it.** The panel first states
   that the notes' text goes to Anthropic. Then it shows the proposal with
   editable title and theme labels, and Apply or Discard.
7. **Model:** `claude-opus-5-5` at `effort: medium`, configurable through
   `AI_MODEL` and `AI_EFFORT`. Server-side fallbacks are on. The stop reason
   is read before the text is parsed. Until the secret and the Supabase
   variables exist, the route answers 503 "AI is not set up", and the panel
   says so.

## Consequences

- **Note text leaves for Anthropic.** That is stated in the panel before
  anything is sent, and it is the owner's to accept as part of this ADR.
- **Prompt injection is bounded, not prevented.** The notes are escaped and
  fenced as data in the prompt. The worst a hostile note can do is make the
  proposal bad. The answer can only name refs it was sent, and it becomes
  copies that a person looks over first and can undo after.
- **Cost is capped per day, not per month.** A determined signed-in user
  spends at most their 20. Everybody together spends at most the global cap.
- **A local board can be clustered too.** The route is not under `/room`, but
  it needs a room server and an account.

## When to revisit

- The AI writes to a board without a person applying it.
- The route starts reading a room's document (ADR 0016).
- A second AI feature arrives, and the quota should be shared or per feature.
