# ADR 0010 · TypeScript 6, not 7, for now

**Status:** Accepted (revisit at TS 7.1) · 2026-09-17

## Context

TypeScript 7.0 — the Go-native compiler — reached GA on 2026-07-08 and is roughly
10× faster at typechecking. It is the same language with the same semantics.

However, TS 7.0 ships **without the programmatic compiler API**. Verified on the
npm registry at 2026-09-17: `typescript-eslint@8.70.0` declares
`peerDependencies.typescript: ">=4.8.4 <6.1.0"`. It does not support TypeScript 7
at all. The API is expected in TS 7.1, whose iteration plan targets a beta in
October 2026.

## Decision

Pin **`typescript@6.0.3`** across the workspace and keep type-aware linting.

## Alternatives considered

**TypeScript 7 now, no type-aware lint.** Gains ~2.7 seconds per typecheck on a
codebase of this size. Loses the rules that detect floating promises, misused
promises, unsafe `any` propagation and impossible comparisons — precisely the bug
classes that bite a command layer with async persistence and a migration system.
A bad trade.

**TypeScript 7 plus the `@typescript/typescript6` shim.** Works, and means two
compilers installed and a toolchain that needs explaining to every future
contributor. Not worth it for a speed gain that is currently imperceptible.

**Waiting to adopt lint at all.** Rejected. Boundary enforcement via
`no-restricted-imports` is part of how the architecture holds.

## Consequences

- Typechecks take ~3s instead of ~0.3s. At this codebase size, imperceptible.
- Type-aware linting stays on, including the boundary rules.
- **The upgrade trigger is explicit:** TS 7.1 GA _and_ `typescript-eslint`
  widening its peer range. It is a one-line version bump.
- `strictTypeChecked` was tried and rejected in favour of
  `recommendedTypeChecked` + `stylisticTypeChecked`: the strict preset makes
  every `onClick={() => setTool(x)}` an error, and a lint config people routinely
  disable is worse than one they trust.
