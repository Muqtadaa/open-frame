/**
 * Injected by Vite's `define` as a literal boolean, so guards on it are
 * statically foldable and the bundler can drop benchmark tooling from
 * production builds. See `apps/web/vite.config.ts`.
 */
declare const __OPENFRAME_BENCH__: boolean

/**
 * The room server for this build, from `VITE_COLLAB_URL` at build time.
 *
 * Declared rather than read off Vite's own `ImportMetaEnv`, whose index
 * signature is `any` — which would make every use of it an unchecked value and
 * defeat the point of the surrounding types.
 *
 * Optional on purpose: a build without one does not collaborate, which is
 * different from one that tries and fails.
 */
interface ImportMetaEnv {
  readonly VITE_COLLAB_URL?: string
}
