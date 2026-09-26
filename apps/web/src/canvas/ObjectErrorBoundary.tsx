import { Component, type ErrorInfo, type ReactNode } from 'react'

import { readableTypeName } from '@openframe/core'

interface Props {
  readonly objectId: string
  readonly objectType: string
  readonly children: ReactNode
}

interface State {
  readonly failed: boolean
}

/**
 * Contains a rendering failure to the ONE object that caused it.
 *
 * Without this, a single bad object type — a malformed payload, a bug in a
 * third-party view, a divide-by-zero in some future layout code — unmounts the
 * whole React tree and costs the user access to an entire board. Graceful
 * degradation is worth one small class component.
 */
export class ObjectErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[openframe] object "${this.props.objectId}" (${this.props.objectType}) failed to render`,
      error,
      info.componentStack,
    )
  }

  override render(): ReactNode {
    if (this.state.failed) {
      const name = readableTypeName(this.props.objectType)
      return (
        <div
          className="of-render-error"
          role="group"
          aria-label={`This ${name.toLowerCase()} could not be drawn`}
        >
          <span className="of-render-error__label">{name} could not be drawn</span>
          <span className="of-render-error__type">Reloading the page may help</span>
        </div>
      )
    }
    return this.props.children
  }
}
