import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

import { IndexedDbBoardRepository } from './adapters/indexeddb/indexeddb-board-repository.js'
import { createRuntime } from './app/composition-root.js'
import { createServices } from './app/services.js'
import type { BoardConnection } from '@openframe/collab'

import { OpenFrameContext, type OpenFrameRuntime } from './runtime/context.js'
import { ServicesContext, type Services } from './runtime/services.js'
import { createDefaultViewRegistry } from './views/index.js'

/**
 * A component mounted on a real board, for a test of what it DOES.
 *
 * The chrome's unit tests used to stop at `renderToStaticMarkup`, which can say
 * what a control looks like and nothing about what happens when somebody uses
 * it — so a menu's arrow keys, a field's Escape and a row's rename were checked
 * only in a browser. This mounts with React's own `act`, on the runtime the app
 * builds (over fake-indexeddb, with autosave immediate), so a test drives the
 * component with real DOM events and reads the board it changed.
 */

// Tells React that `act` is in use, so it flushes effects inside it rather than
// warning that an update was not wrapped.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export interface Mounted {
  readonly runtime: OpenFrameRuntime
  readonly container: HTMLElement
  /** Runs `step` inside `act`, so every update and effect it causes has landed. */
  readonly act: (step: () => void) => void
  /** Lets pending promises — a service's answer — land, and their updates with them. */
  readonly settle: () => Promise<void>
  /** Presses a key on an element, the way a keyboard does: bubbling, cancelable. */
  readonly press: (target: Element, key: string, init?: KeyboardEventInit) => KeyboardEvent
  /** Types into a controlled field, through the setter React listens to. */
  readonly type: (field: HTMLInputElement | HTMLTextAreaElement, text: string) => void
  readonly unmount: () => void
}

export async function mountOnBoard(
  ui: ReactNode,
  options: {
    /** Changes what the built services do — to record a call, or to make one fail. */
    readonly services?: (built: Services) => Services
    /** A room for the component to be in; a local board has none. */
    readonly collaboration?: BoardConnection
  } = {},
): Promise<Mounted> {
  const repository = new IndexedDbBoardRepository()
  const runtime = await createRuntime({ repository, autosaveDelayMs: 0 })
  // The services the app builds, with a network that answers nobody: a test
  // of a control must never reach a real room server or account.
  const built = createServices({
    repository,
    fetch: () => Promise.reject(new Error('no network in a component test')),
  })
  const services = options.services?.(built) ?? built
  const container = document.createElement('div')
  // Where anchored surfaces portal to, as the canvas provides it in the app;
  // without it a menu or a popover renders nothing at all.
  const layer = document.createElement('div')
  layer.dataset.chromeLayer = ''
  document.body.append(container, layer)
  const root = createRoot(container)

  act(() => {
    root.render(
      <ServicesContext.Provider value={services}>
        <OpenFrameContext.Provider
          value={{
            runtime,
            views: createDefaultViewRegistry(),
            collaboration: options.collaboration ?? null,
          }}
        >
          {ui}
        </OpenFrameContext.Provider>
      </ServicesContext.Provider>,
    )
  })

  const step = (fn: () => void): void => {
    act(fn)
  }

  return {
    runtime,
    container,
    act: step,
    settle: async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    },
    press: (target, key, init = {}) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
      step(() => {
        target.dispatchEvent(event)
      })
      return event
    },
    type: (field, text) => {
      const prototype = Object.getPrototypeOf(field) as object
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
      step(() => {
        setter?.call(field, text)
        field.dispatchEvent(new Event('input', { bubbles: true }))
      })
    },
    unmount: () => {
      step(() => {
        root.unmount()
      })
      container.remove()
      layer.remove()
      runtime.dispose()
    },
  }
}
