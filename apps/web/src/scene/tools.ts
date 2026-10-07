/**
 * What a tool on the rail IS, apart from how it is drawn.
 *
 * A type that can be made from the rail declares its tool on its view
 * (`ObjectViewDefinition.tool`), and the rail, the keys, the cursor and the
 * pointer all ask for it. They each used to keep a `tool === 'shape'` of their
 * own, so a new type with a tool meant editing seven files, none of which the
 * registry could see.
 *
 * The half here is plain data and functions, so `interaction/` can read it
 * without reaching into `views/` — the icon and the options picker are the
 * view's half.
 */

import type { MarkAuthor } from '@openframe/core'

/**
 * The modes that are not a type: getting around the board, talking about it,
 * and voting on it. They are the chrome's, and a closed list on purpose.
 *
 * `dot` is armed from a round of dot voting rather than from the rail: it
 * only means something while one is open.
 */
export const CHROME_TOOLS = ['select', 'pan', 'comment', 'dot'] as const
export type ChromeTool = (typeof CHROME_TOOLS)[number]

/**
 * A chrome tool, or the name of a type whose view declares a tool.
 *
 * Open, because the set of types is the registry's to say; a name nothing
 * declares is simply a tool that does nothing, which is what an unknown type
 * would do anyway.
 */
export type Tool = ChromeTool | (string & NonNullable<unknown>)

export const isChromeTool = (tool: Tool): tool is ChromeTool =>
  (CHROME_TOOLS as readonly string[]).includes(tool)

/**
 * A cursor glyph: a filled silhouette plus, optionally, detail knocked back out
 * of it in the halo colour (see `interaction/tool-cursor.ts`).
 */
export interface Mark {
  /** Shapes to fill. One path's `d`, or markup. */
  readonly body: string
  /** Drawn over the body in the halo colour: the lines inside the glyph. */
  readonly detail?: string
}

/**
 * How a press with the tool armed makes something.
 *
 * - `click`: placed at the type's default size where you press, then edited —
 *   a note's size is the type's, and text sizes itself to what is typed;
 * - `draw`: dragged out to a size, the way every graphics tool draws a box,
 *   and a press that does not travel still places the default;
 * - `connect`: drawn from whatever is under the pointer to wherever it lets go.
 */
export type Placement = 'click' | 'draw' | 'connect'

export interface ToolBehaviour<TOptions = unknown> {
  /** Shown in the tip and as the button's name. */
  readonly label: string
  /**
   * The letters that arm it, lower case. The first is the one the tip shows.
   * A key that also walks the options is `cycleKey`, not one of these.
   */
  readonly keys: readonly string[]
  /** Where it sits among the tools that make things. */
  readonly order: number
  readonly place: Placement
  /** What a new tool starts with, before anybody chooses. */
  readonly initial?: TOptions
  /**
   * The data the object is created with, from the options chosen — and who is
   * making it, for a type that keeps its maker (a poll, which only its asker
   * closes).
   */
  readonly data?: (options: TOptions, maker: Maker) => Readonly<Record<string, unknown>>
  /**
   * Places nothing until the maker is known. A poll placed while the account
   * was still loading was kept as asked by nobody, which anyone may close
   * (Codex, on #92); a press in that moment does what the select tool would.
   */
  readonly needsMaker?: boolean
  /**
   * A key that arms the tool on the first press and walks its options on
   * every press after — how one key reaches four shapes.
   */
  readonly cycleKey?: string
  readonly cycle?: (options: TOptions) => TOptions
  /** The pointer's glyph while it is armed, which follows the options. */
  readonly cursor: (options: TOptions) => Mark
}

/** A declared tool with the type it makes, as the callers want it. */
/** Who is placing an object, when anybody is known to be. */
export interface Maker {
  readonly me: MarkAuthor | null
}

const NOBODY: Maker = { me: null }

export interface DeclaredTool {
  readonly type: string
  readonly tool: ToolBehaviour
}

/** The options a tool is using now: what was chosen, or what it starts with. */
export function optionsOf(declared: DeclaredTool, chosen: Readonly<Record<string, unknown>>) {
  return declared.type in chosen ? chosen[declared.type] : declared.tool.initial
}

/**
 * What a press with `tool` armed makes: the type, how it is placed and the
 * data its options give it — or `null` for a chrome mode or a tool nothing
 * declares.
 */
export function makeFor(
  tool: Tool,
  tools: readonly DeclaredTool[],
  chosen: Readonly<Record<string, unknown>>,
  maker: Maker = NOBODY,
): {
  readonly type: string
  readonly place: Placement
  readonly data?: Readonly<Record<string, unknown>>
} | null {
  if (isChromeTool(tool)) return null
  const declared = tools.find((entry) => entry.type === tool)
  if (declared === undefined) return null
  const { place, data, needsMaker } = declared.tool
  if (needsMaker === true && maker.me === null) return null
  return data === undefined
    ? { type: tool, place }
    : { type: tool, place, data: data(optionsOf(declared, chosen), maker) }
}
