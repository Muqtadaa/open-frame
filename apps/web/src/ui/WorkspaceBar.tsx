import { useState } from 'react'

import type { Workspace } from '../hooks/use-workspaces.js'

/**
 * Which workspace the board list is showing, and the way into a new one.
 *
 * A FILTER, not a place you navigate to. Every board lives in exactly one
 * workspace, so the list is complete by default and narrowing it is the
 * exception — "everything" stays first and stays selected until somebody
 * chooses otherwise. A switcher that made you pick before showing anything
 * would put a decision in front of the thing you came for.
 *
 * The links belong to an admin, and only an admin is offered them: inviting is
 * what `admin` means, and a link everybody can see is a link anybody can widen
 * the workspace with. The database withholds them too — this is the interface
 * agreeing with it, not the interface enforcing it.
 */
interface Props {
  readonly workspaces: readonly Workspace[]
  /** The one being shown, or null for all of them. */
  readonly selected: string | null
  readonly onSelect: (id: string | null) => void
  readonly onCreate: (name: string) => void
  readonly onShare: (id: string) => void
  /** The link to hand somebody, once Share has been pressed. */
  readonly invite: string | null
  readonly busy: boolean
}

export function WorkspaceBar({
  workspaces,
  selected,
  onSelect,
  onCreate,
  onShare,
  invite,
  busy,
}: Props) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  // One workspace and no way to make another is not a choice; it is a label
  // taking up the space the boards should have.
  if (workspaces.length === 0) return null

  const current = workspaces.find((workspace) => workspace.id === selected) ?? null

  return (
    <div className="of-spaces" data-testid="workspace-bar">
      <div className="of-spaces__row">
        <div className="of-spaces__tabs" role="group" aria-label="Workspaces">
        <button
          type="button"
          className={`of-spaces__tab${selected === null ? ' of-spaces__tab--on' : ''}`}
          aria-pressed={selected === null}
          data-testid="workspace-all"
          onClick={() => {
            onSelect(null)
          }}
        >
          everything
        </button>

        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            className={`of-spaces__tab${selected === workspace.id ? ' of-spaces__tab--on' : ''}`}
            aria-pressed={selected === workspace.id}
            data-testid={`workspace-${workspace.id}`}
            onClick={() => {
              onSelect(workspace.id)
            }}
          >
            {workspace.name}
            <span className="of-spaces__count">{workspace.boards}</span>
          </button>
        ))}
        </div>

        <button
          type="button"
          className="of-spaces__new"
          aria-expanded={naming}
          data-testid="workspace-new"
          onClick={() => {
            setNaming((was) => !was)
          }}
        >
          {/* Drawn on the 24x24 grid at 1.6, like every icon in this product. */}
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New workspace
        </button>
      </div>

      {naming && (
        <form
          className="of-spaces__naming"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = name.trim()
            if (trimmed === '' || busy) return
            onCreate(trimmed)
            setName('')
            setNaming(false)
          }}
        >
          <input
            className="of-spaces__name"
            value={name}
            maxLength={80}
            placeholder="What is it for?"
            aria-label="Name for the new workspace"
            data-testid="workspace-name"
            autoFocus
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
          <button type="submit" className="of-button" disabled={busy} data-testid="workspace-create">
            Create
          </button>
        </form>
      )}

      {/*
        * Sharing is offered for the workspace being SHOWN, because a link that
        * did not say which workspace it let somebody into would be the easiest
        * possible thing to send by mistake.
        */}
      {current !== null && current.role === 'admin' && !current.personal && (
        <div className="of-spaces__share">
          <button
            type="button"
            className="of-button of-button--ghost"
            data-testid="workspace-share"
            disabled={busy}
            onClick={() => {
              onShare(current.id)
            }}
          >
            Invite people to {current.name}
          </button>
          {invite !== null && (
            <input
              className="of-spaces__link"
              readOnly
              value={invite}
              aria-label={`Invite link for ${current.name}`}
              data-testid="workspace-invite"
              onFocus={(event) => {
                event.target.select()
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
