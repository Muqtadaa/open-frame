# Appendix D · Deferred decisions

← [Documentation index](../README.md)

Decisions deliberately **not** made, because there is not yet enough information —
and making them early would cost optionality for no gain.

Knowing what not to decide is part of the architecture. Each row names what would
resolve it.

---

## Infrastructure

| Decision                                            | Why deferred                                                                                                                            | Resolved by                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **CRDT transport**                                  | The ecosystem moved during planning: `partykit` and `@y-sweet/sdk` both went stale. `y-websocket` and `@hocuspocus/server` are current. | Phase 4 kickoff; re-verify maintenance state |
| **Backend framework and host**                      | Depends on whether auth is self-hosted or a provider, and whether MCP is a separate service                                             | First server-side authorization requirement  |
| **Database**                                        | Postgres is likely; plain vs Supabase vs SQLite-at-the-edge depends on collaboration topology                                           | First non-local persistence need             |
| **Auth provider**                                   | Providers change fast. The capability boundary — the part that matters — is already designed                                            | First multi-user requirement                 |
| **Presence topology** (P2P vs server-authoritative) | Follows from transport                                                                                                                  | Phase 4                                      |
| **Asset storage backend**                           | Depends on hosting                                                                                                                      | Phase 2 (images)                             |

## Domain model

| Decision                           | Why deferred                                                                                                                                                | Resolved by                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| ~~**First-class relationship model**~~ | ✅ **Closed** by [ADR 0011](../adr/0011-relations-as-objects.md): a relation is an object. Embedded arrays were rejected on MERGE, not on queries — two concurrent citations are two whole-array writes and one loses | [ADR 0011](../adr/0011-relations-as-objects.md) |
| **Rich text vs plain text**        | A large commitment that interacts with collaborative text                                                                                                   | First user demand for formatting inside a note                                                                    |
| **Section vs frame semantics**     | Not yet clear they are different things                                                                                                                     | Phase 2, once frames are used in anger                                                                            |
| **Collaborative undo semantics**   | Origin-scoped is technically right; whether undo should revert _others'_ changes is a **product** question                                                  | Real users in Phase 4                                                                                             |

## Application

| Decision                                       | Why deferred                                                                                              | Resolved by                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Router**                                     | Phase 1 has one route. `react-router@8.4.0` is current if needed                                          | More than ~3 routes                         |
| **Styling approach** (Tailwind vs CSS Modules) | Genuinely low-stakes and reversible. Plain CSS with tokens for now                                        | Style duplication becoming real             |
| **UI component library**                       | Not enough UI exists to know what is needed. Building one now is the premature-design-system anti-pattern | ~20 distinct components exist               |
| **Spatial index implementation**               | Linear scanning is adequate; the port already exists                                                      | Profiling shows hit testing as a bottleneck |
| **Export formats**                             | PNG/SVG/PDF/Miro-import have very different constraints. `describe()` is the starting seam                | First real export requirement               |
| **TypeScript 7 upgrade**                       | Blocked on `typescript-eslint` support; TS 7.1 beta targeted October 2026                                 | TS 7.1 GA + peer range widened              |

## AI and agents

| Decision                                     | Why deferred                                                                                  | Resolved by |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------- |
| **AI provider and model**                    | Changes monthly. The boundary — validated structured output → commands — is provider-agnostic | Phase 5     |
| **Whether `apps/mcp` is a separate process** | Depends on the backend shape                                                                  | Phase 5     |
| **AI preview UX**                            | Needs real AI output to design against                                                        | Phase 5     |

---

## How to close one

Write an [ADR](../adr/README.md). If the decision turns out to be trivial or
easily reversed, it does not need a record — put it in code and move on.
