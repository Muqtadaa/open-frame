/**
 * Whether benchmark tooling is present in this build.
 *
 * True in development, and in an explicit benchmark build
 * (`pnpm build:bench`) — which exists so the renderer question can be assessed
 * on real hardware from a deployed URL, not only on a machine with the repo
 * checked out.
 *
 * Both operands are compile-time literals, so a production build folds this to
 * `false` and removes every guarded branch.
 */
export const BENCH_TOOLS_ENABLED: boolean = import.meta.env.DEV || __OPENFRAME_BENCH__
