# ADR 0009 · Two packages, not five

**Status:** Accepted · 2026-09-17

## Context

The architecture depends on a claim: the domain does not know about React, the
renderer, the database or the network. Something has to enforce that. The obvious
approach is a package per layer — `domain`, `commands`, `canvas`, `ui`,
`collaboration`. The draft plan proposed exactly that.

## Decision

**Two workspace packages:**

```
packages/core     pure TypeScript — domain, commands, schema, ports, store
apps/web          React — canvas, interaction, UI, adapters
```

Intra-package layering is enforced by `dependency-cruiser` rules over folders.

## Alternatives considered

**Four or five packages** (the original draft). Reviewed and cut. Of the four
boundaries proposed, three were decoration: they would not have prevented a
mistake anyone was likely to make, while adding four `package.json` files, four
`tsconfig.json` files, cross-package version churn and build ordering.

**One package.** Simplest, and the React-in-core rule becomes a lint rule only.
Under pnpm, a separate package makes it a _resolution failure_ — the import
cannot even be resolved, because core's dependency list does not contain React.
That is enforcement by physics rather than by discipline, and it is the one
boundary worth paying for.

## Consequences

- One boundary is impossible to cross by accident; the rest are lint rules.
- `pnpm dev` behaves like a single project — Vite reads core's TypeScript source
  directly, so there is no build-core-then-build-web step.
- Splitting further later is mechanical.

### Triggers for a third package

Creating one before its trigger fires is premature.

| Package           | Trigger                                             |
| ----------------- | --------------------------------------------------- |
| `apps/api`        | First server-side authorization requirement         |
| `apps/mcp`        | MCP work begins — depends on `core`, never on `web` |
| `packages/collab` | Collaboration adopted, to quarantine Yjs            |
| `packages/ui`     | A _second_ consumer of components exists            |
| `packages/canvas` | A _second_ renderer exists                          |

### Enforcement, verified

All three mechanisms were tested against deliberate violations:

- ESLint `no-restricted-imports` — editor feedback
- `architecture.test.ts` — fails `pnpm test`
- `.dependency-cruiser.cjs` — fails `pnpm depcruise`

The dependency-cruiser rule initially passed **vacuously**: because pnpm makes
React unresolvable from core, matching only `node_modules/react` never fired on
the exact mistake it existed to catch. It now matches the unresolved specifier
too, and a `no-unresolvable` rule was added. A rule that passes vacuously is
worse than no rule, because it is trusted.
