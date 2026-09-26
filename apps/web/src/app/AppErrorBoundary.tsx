import { Component, type ErrorInfo, type ReactNode } from 'react'

import { StartFailed } from '../ui/StartFailed.js'

interface State {
  readonly error: Error | null
}

/** Last line of defence. Per-object failures are caught far below this. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[openframe] fatal error', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      // The same panel as a board that would not open: one voice for "this
      // stopped", and never the raw message, which was written for a console.
      return <StartFailed heading="OpenFrame stopped" error={this.state.error} />
    }
    return this.props.children
  }
}
