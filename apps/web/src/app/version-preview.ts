import {
  CommandDispatcher,
  createDocumentStore,
  readOnlyCapabilities,
  readVersionObjects,
  systemClock,
} from '@openframe/core'

import type { OpenFrameRuntime } from '../runtime/context.js'

/**
 * An earlier version of the board, shown on the canvas in place of the board
 * as it is now (ADR 0019) — and never written anywhere.
 *
 * A runtime of its own rather than a mode of the live one, so the guarantee is
 * structural: its store is a different store, its dispatcher holds read-only
 * capabilities (so every edit, undo and tool is refused the way a viewer's
 * are), and nothing autosaves it, keeps its history or sends it to a room.
 * The live board keeps running underneath — other people's edits still arrive
 * — and "Back" simply stops showing this one.
 *
 * It shares the live runtime's registry, ids and ASSETS: a board's images are
 * kept until the board is deleted, so an old version's pictures still resolve.
 */
export interface Previewed {
  readonly id: string
  readonly at: number
  readonly runtime: OpenFrameRuntime
  /** What a restore dispatches: the version as stored, which the command reads again. */
  readonly objects: readonly unknown[]
  readonly title: string | null
}

/**
 * The preview runtime for a version's stored objects, or `null` when any of
 * them cannot be read — the same test `RestoreBoard` applies, so the canvas
 * never shows a version the restore would refuse.
 */
export function previewRuntime(
  live: OpenFrameRuntime,
  version: { readonly objects: readonly unknown[]; readonly title: string | null },
): OpenFrameRuntime | null {
  const objects = readVersionObjects(version.objects, live.registry)
  if (objects === null) return null
  const current = live.store.getDocument()
  const { store, writer } = createDocumentStore({
    ...current,
    objects,
    meta: { ...current.meta, title: version.title ?? current.meta.title },
  })
  const dispatcher = new CommandDispatcher({
    store,
    writer,
    registry: live.registry,
    clock: systemClock,
    ids: live.ids,
    capabilities: readOnlyCapabilities(),
  })
  return {
    ...live,
    store,
    dispatcher,
    notices: [],
    readOnly: true,
    quarantine: null,
    flush: () => Promise.resolve(),
    saveStatus: { get: () => 'read-only', subscribe: () => () => undefined },
    dispose: () => undefined,
  }
}

/**
 * Which version is on the canvas, if any — one value the shell renders from
 * and the panel sets. Outside React state so the shell, the panel and the bar
 * share it without passing it down through everything between them.
 */
let previewed: Previewed | null = null
const listeners = new Set<() => void>()

export const versionPreview = {
  get: (): Previewed | null => previewed,
  show: (next: Previewed | null): void => {
    if (next === previewed) return
    previewed = next
    for (const listener of [...listeners]) listener()
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
