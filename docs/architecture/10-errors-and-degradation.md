# 10 · Errors and degradation

← [Documentation index](../README.md)

The governing principle: **one bad object must never cost a user access to a
board, and a board that cannot be read must never be overwritten.**

---

## Failure table

| Failure                                  | Behaviour                                                                                               | Where                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| Unparseable JSON                         | Board opens **read-only**, raw payload retained, **nothing written back**                               | `deserializeBoardJson`   |
| Invalid envelope                         | Same                                                                                                    | `deserializeBoard`       |
| `schemaVersion` newer than this build    | Read-only + "update OpenFrame" notice                                                                   | `deserializeBoard`       |
| Document migration throws                | Quarantine; original preserved; migration named                                                         | `migrateDocumentPayload` |
| Migration chain has a gap                | Throws rather than silently skipping                                                                    | `migrateDocumentPayload` |
| **Unknown object type**                  | Becomes `UnknownObject`; renders as a placeholder; movable and deletable; **round-trips byte-for-byte** | `deserializeBoard`       |
| Object `data` fails its schema           | Same as above, reason `invalid-data`                                                                    | `deserializeBoard`       |
| Object type registered but no React view | `FallbackView` — labelled box, board unaffected                                                         | `ObjectView`             |
| **A view throws while rendering**        | `ObjectErrorBoundary` — that object shows an error tile, the board keeps working                        | `ObjectErrorBoundary`    |
| Parent cycle                             | Broken deterministically, lowest id detaches to root, repair logged                                     | `repairDocument`         |
| Dangling `parentId`                      | Detached to root, repair logged                                                                         | `repairDocument`         |
| Non-finite frame values                  | Offending components reset, repair logged                                                               | `repairDocument`         |
| Command fails validation                 | `CommandError` returned; **document guaranteed untouched**                                              | `CommandDispatcher`      |
| Command unauthorized                     | `CommandError('unauthorized')`, nothing applied                                                         | `CommandDispatcher`      |
| Autosave rejects                         | Logged; the in-memory document is unaffected                                                            | `subscribeAutosave`      |
| Anything else in React                   | `AppErrorBoundary` — "your board data has not been modified"                                            | `AppErrorBoundary`       |

---

## Why quarantine is read-only

> **Never write back a document you could not fully read.**

A partial save over a board that failed to parse destroys the user's work
permanently. Quarantine therefore does two things: it opens the board so the user
can see what is there, and it **never attaches autosave**.

Tested in
[`adapters.test.ts`](../../apps/web/src/adapters/adapters.test.ts) —
"opens an unreadable board read-only and never writes back".

---

## Why `UnknownObject` exists from day one

Forward compatibility that is not exercised from the start does not work.

A board saved by a newer build, or containing a type behind a flag, still opens.
The unrecognised objects keep their position, size and style, are visibly marked
as unsupported, can be moved or deleted — and their original payload is written
back **unchanged**.

That last part is asserted directly:

```ts
it('writes the original type, version and payload back unchanged', …)
```

Without that test, the guarantee silently regresses the first time someone tidies
the serializer.

---

## Degradation is reported, not hidden

The composition root collects notices and the UI shows them:

- _"N object(s) could not be read by this version and are shown as placeholders."_
- _"Repaired N structural problem(s) while opening the board."_
- _"This board could not be opened (reason). It is read-only to protect your data."_

Quietly continuing is how data gets lost.

---

## Next

- [11 · Security](11-security.md)
- [06 · Schema and migrations](06-schema-and-migrations.md) — the load pipeline
