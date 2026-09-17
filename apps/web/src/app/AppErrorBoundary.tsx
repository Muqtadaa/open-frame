import { Component, type ErrorInfo, type ReactNode } from 'react'

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
      return (
        <div className="of-fatal" role="alert">
          <h1>OpenFrame could not start</h1>
          <p>{this.state.error.message}</p>
          <p className="of-fatal__hint">Your board data has not been modified.</p>
        </div>
      )
    }
    return this.props.children
  }
}
