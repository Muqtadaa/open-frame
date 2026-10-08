---
version: 1
slug: "apps-web-src-ui-agentchanges-tsx"
primary_target: "apps/web/src/ui/AgentChanges.tsx"
related_targets: ["apps/web/src/ui/Inbox.tsx"]
---

THESIS: An agent is another writer on the board, and the person must always be
able to see what it did and take it back. The Inbox lists what is waiting; a
change is understood by being shown on the board, not by being described.

MODE: Operate. Opened occasionally, when something arrived, by a person who
needs to judge a change quickly and undo it if it is wrong.

PLACEMENT: one Inbox on the navigation bar's people zone — a single count of
unread mentions plus agent changes not yet shown in this browser, in the
accent's wash while there is any. Its sheet has a section each. A new agent
change also arrives as a toast with Revert.

A CHANGE: its label from the command, in real plurals and type names (never
"object(s)"), whose agent ran it, how long ago, how many objects when the label
does not already count them, and two actions. Show selects and frames what
it touched and puts the sheet away. Revert takes back all of it that is still
the agent's; what a person changed since stays, and the row says so ("2 objects
kept, changed since"). Once reverted the row reads "Taken back by <name>". A
viewer sees the rows without Revert. Closing the Inbox reads what was in it;
read rows lose their accent edge but stay listed until they leave the log.

KEYBOARD: the sheet takes the keyboard at its first mention, or at the sheet
itself — never at a Revert, where Enter twice took a change back. Tab stays
inside, and Escape hands it back. A revert is announced, and focus never drops to the
page when the pressed control goes.

NOT: a revert that overwrites a person's later edit; old changes announced as
news to somebody opening the board later; a count that stays up for as long as
the change is on the board.

FINISH: `e2e-rooms/agent-revert.spec.ts` holds the toast's Revert, reverting
from the panel, what a person wrote since being kept, undo after revert, the
agent reverting its own change, old changes not being news, seen changes
staying seen and Show; `e2e-rooms/mcp-peer.spec.ts` holds the agent as a real
peer; `navigation-bar.spec.ts` holds the Inbox on the bar.
Critique 2026-10-07: 21/40. DESIGN.md: Inbox. The log is
`packages/collab/src/change-log.ts`.
