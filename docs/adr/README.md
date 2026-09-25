# Architecture decision records

← [Documentation index](../README.md)

Each record captures a decision that was **consequential and hard to reverse**.
Trivial or easily-changed choices are not recorded here; they live in code
comments or in [Appendix A](../appendices/a-technology-decisions.md).

Format: Status · Context · Decision · Alternatives considered · Consequences.

| #                                                 | Decision                                           | Status              |
| ------------------------------------------------- | -------------------------------------------------- | ------------------- |
| [0001](0001-frontend-runtime-vite-react-spa.md)   | Vite + React SPA, not Next.js                      | Accepted            |
| [0002](0002-canvas-engine-custom-dom-svg.md)      | **Build our own DOM/SVG renderer**                 | Accepted            |
| [0003](0003-canonical-document-model.md)          | Flat object map, fractional ordering, token styles | Accepted            |
| [0004](0004-command-mutation-architecture.md)     | One command layer for all mutation                 | Accepted            |
| [0005](0005-state-ownership.md)                   | Three separate state homes, no global store        | Accepted            |
| [0006](0006-persistence-indexeddb-behind-port.md) | IndexedDB behind a patch-aware port                | Accepted            |
| [0007](0007-collaboration-yjs-deferred.md)        | Yjs, designed now, built later                     | Accepted (deferred) |
| [0008](0008-schema-versioning-and-migrations.md)  | Two version axes, pure migrations                  | Accepted            |
| [0009](0009-repository-structure-two-packages.md) | Two packages, not five                             | Accepted            |
| [0010](0010-typescript-6-until-ts71.md)           | TypeScript 6, not 7, for now                       | Accepted (revisit)  |
| [0011](0011-relations-as-objects.md)              | **Relations are objects, not fields**              | Accepted            |
| [0012](0012-rich-text-as-spans.md)                | **Text is a list of spans, not a string**          | Accepted            |
| [0013](0013-collaboration-transport-durable-objects.md) | **Durable Objects, sync loop written here**  | Accepted            |
| [0014](0014-paragraphs-lists-and-labels.md)       | **Lists live on the newline, and labels become text** | Accepted       |

## Writing a new one

Copy the structure of an existing record. Keep it short — an ADR that is not read
has no value. Record what was _rejected_ and why, because that is the part
nobody can reconstruct later.
