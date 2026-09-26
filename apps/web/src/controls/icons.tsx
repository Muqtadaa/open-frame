import type { ShapeKind } from '@openframe/core'

import { ELLIPSE, shapePath } from '../scene/shape-geometry.js'

/**
 * Inline SVG icons.
 *
 * No icon library: the set is small, and a dependency here would ship hundreds
 * of glyphs to render six. All are drawn on a 24×24 grid and inherit
 * `currentColor`, so active and hover states are pure CSS.
 */
interface IconProps {
  readonly className?: string
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

export function CursorIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 3l6.5 16 2.2-6.3L20 10.5 5 3z" />
    </svg>
  )
}

export function HandIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 11V5.5a1.5 1.5 0 013 0V11m0-1.5V4.8a1.5 1.5 0 013 0V11m0-1.2a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1a6 6 0 01-6-6v-3a1.5 1.5 0 013 0" />
    </svg>
  )
}

export function StickyIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 4h16v10l-6 6H4z" />
      <path d="M20 14h-6v6" />
    </svg>
  )
}

export function TextIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 6V4.5h14V6M12 4.5V20M9 20h6" />
    </svg>
  )
}

/**
 * Drawn from the SAME geometry the canvas uses, in its 0–100 box rather than
 * the 24×24 grid of the other icons.
 *
 * The alternative — a hand-drawn glyph per kind — is a second definition of
 * every shape that has to be kept in step with the first, and it was already
 * one kind out of date. Adding a polygon now costs nothing here.
 */
export function ShapeIcon({ className, kind }: IconProps & { kind: ShapeKind }) {
  const path = shapePath(kind)
  return (
    <svg {...base} viewBox="0 0 100 100" strokeWidth={7} className={className}>
      {path === null ? (
        <ellipse cx={ELLIPSE.cx} cy={ELLIPSE.cy} rx={ELLIPSE.rx} ry={ELLIPSE.ry} />
      ) : (
        <path d={path} />
      )}
    </svg>
  )
}

export function UndoIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 9h11a5 5 0 010 10h-4M4 9l4-4M4 9l4 4" />
    </svg>
  )
}

export function RedoIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 9H9a5 5 0 000 10h4M20 9l-4-4M20 9l-4 4" />
    </svg>
  )
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7h16M10 7V4.5h4V7M6 7l1 13h10l1-13M10 11v5M14 11v5" />
    </svg>
  )
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function FitIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  )
}

export function MouseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="7" y="3" width="10" height="18" rx="5" />
      <path d="M12 7v3" />
    </svg>
  )
}

export function FrameIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7 3v18M17 3v18M3 7h18M3 17h18" />
    </svg>
  )
}

export function ConnectorIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <path d="M7.6 16.4 16.4 7.6" />
    </svg>
  )
}

export function TableIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      {/* The header rule is heavier in meaning than the rest: it is what
          makes a grid a table rather than graph paper. */}
      <path d="M3 9.5h18" />
      <path d="M3 14.5h18" />
      <path d="M9.5 9.5v10" />
      <path d="M15.5 9.5v10" />
    </svg>
  )
}

export function CodeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m8.5 8.5-4 3.5 4 3.5" />
      <path d="m15.5 8.5 4 3.5-4 3.5" />
      <path d="M13.5 5.5 10.5 18.5" />
    </svg>
  )
}

export function ImageIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.75" />
      <path d="m3 17 5-5 4 4 3-3 6 6" />
    </svg>
  )
}

/**
 * Fill, stroke and align icons show the VALUE rather than naming it: a control
 * whose options read "none / tint / solid" makes you translate words into a
 * result you can already picture.
 */
export function FillIcon({ className, variant }: IconProps & { variant: string }) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      {variant === 'tint' && <rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor" opacity="0.25" stroke="none" />}
      {variant === 'solid' && <rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor" stroke="none" />}
      {variant === 'none' && <path d="M5.5 18.5 18.5 5.5" />}
    </svg>
  )
}

export function StrokeIcon({ className, variant }: IconProps & { variant: string }) {
  const weight = { none: 0, thin: 1, medium: 2.4, thick: 4.4 }[variant] ?? 2
  return (
    <svg {...base} className={className}>
      {variant === 'none' ? (
        <>
          <path d="M4 12h16" strokeDasharray="2 3" opacity="0.5" />
          <path d="M6 18 18 6" />
        </>
      ) : (
        <path d="M4 12h16" strokeWidth={weight} />
      )}
    </svg>
  )
}

/**
 * The pattern, drawn at one weight.
 *
 * Deliberately not also varying the line's thickness: weight has its own
 * control beside this one, and an icon that changed two things at once would
 * suggest the two properties were the same choice.
 */
export function DashIcon({ className, variant }: IconProps & { variant: string }) {
  const pattern = { dashed: '6 4', dotted: '0 4.5' }[variant]
  return (
    <svg {...base} className={className}>
      <path
        d="M4 12h16"
        strokeWidth={2.4}
        strokeLinecap="round"
        {...(pattern === undefined ? {} : { strokeDasharray: pattern })}
      />
    </svg>
  )
}

/**
 * A square whose corners show the radius, so the choice is read off the shape
 * rather than off the word. The values track `RADIUS_PX` loosely — this is a
 * 24px icon standing for a shape of any size, so it shows the PROGRESSION
 * rather than the exact measurement.
 */
export function RadiusIcon({ className, variant }: IconProps & { variant: string }) {
  const corner = { none: 0, small: 2, medium: 5, large: 9 }[variant] ?? 0
  return (
    <svg {...base} className={className}>
      <rect x={5} y={5} width={14} height={14} rx={corner} ry={corner} />
    </svg>
  )
}

export function AlignIcon({ className, variant }: IconProps & { variant: string }) {
  // Short lines sit where the text would: ragged edge away from the alignment.
  const rows =
    variant === 'center'
      ? ['M6 8h12', 'M8 12h8', 'M5 16h14']
      : variant === 'end'
        ? ['M6 8h12', 'M10 12h8', 'M4 16h14']
        : ['M6 8h12', 'M6 12h8', 'M6 16h14']
  return (
    <svg {...base} className={className}>
      {rows.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

/**
 * The same three lines turned through a right angle.
 *
 * Deliberately a rotation of `AlignIcon` rather than a new drawing: the two
 * controls ask the same question about different axes, and a reader who has
 * understood one should not have to learn the other.
 */
export function VAlignIcon({ className, variant }: IconProps & { variant: string }) {
  const columns =
    variant === 'middle'
      ? ['M8 6v12', 'M12 8v8', 'M16 5v14']
      : variant === 'bottom'
        ? ['M8 6v12', 'M12 10v8', 'M16 4v14']
        : ['M8 6v12', 'M12 6v8', 'M16 6v14']
  return (
    <svg {...base} className={className}>
      {columns.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

/** Replaces a `\u25b8` text glyph: icons are drawn, at one stroke weight. */
export function DisclosureIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 7l5 5-5 5" />
    </svg>
  )
}

/** The eyedropper: pick a colour from anywhere on the screen. */
export function DropperIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M17.5 3.5a2.6 2.6 0 0 1 3 3l-2.4 2.4 1 1-2 2-1-1-6.6 6.6-3.4.9.9-3.4 6.6-6.6-1-1 2-2 1 1Z" />
    </svg>
  )
}

/** Replaces a `\u00d7` text glyph, for the same reason. */
export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  )
}

/**
 * The setting sun with its banded horizon — the artwork's own motif, and the
 * one glyph that says "after hours" without reaching for the stock crescent
 * moon every theme toggle in the category already uses.
 */
export function AfterHoursIcon({ className }: IconProps) {
  /*
   * A crescent: the evening the world is named for. The sun going down behind
   * a horizon read, at 16 pixels, as a hat or a lamp.
   */
  return (
    <svg {...base} className={className}>
      <path d="M19.5 14.2A7.6 7.6 0 1 1 9.8 4.5a6.1 6.1 0 0 0 9.7 9.7z" />
    </svg>
  )
}

/** Two figures: the room, and the fact that somebody else is in it. */
export function PeopleIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0111 0" />
      <path d="M16 5.6a3.2 3.2 0 010 4.8M18.2 19.5a5.6 5.6 0 00-2.4-4.6" />
    </svg>
  )
}

/**
 * Back to the board list.
 *
 * An arrow rather than a house: this world has no home, it has an index, and
 * an arrow says "the way you came" without claiming the front door is a
 * dwelling. Drawn on the same 24x24 grid as everything else here.
 */
export function BackIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M19 12H5m0 0l6-6m-6 6l6 6" />
    </svg>
  )
}

/**
 * A pin, as a drawing pin seen from the side.
 *
 * Filled when pressed rather than swapped for a second glyph: a toggle that
 * changes shape makes the person compare two pictures to read one state.
 */
export function PinIcon({ className, pressed }: IconProps & { pressed?: boolean }) {
  return (
    <svg {...base} className={className} fill={pressed === true ? 'currentColor' : 'none'}>
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
      <path d="M12 14v7" fill="none" />
    </svg>
  )
}

/** Renaming: a pencil over a line, the same gesture as editing a label. */
export function RenameIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17v3z" />
      <path d="M14 6l4 4" />
    </svg>
  )
}

/** Leaving somebody else's board: a door with an arrow out of it. */
export function LeaveIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </svg>
  )
}

/** A speech bubble with a tail, for a comment left on the board. */
export function CommentIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 12a7 7 0 0 1-7 7H9l-4 3v-4.2A7 7 0 0 1 4 12a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7Z" />
    </svg>
  )
}

/** A key, for the password that a board's links ask for. */
export function KeyIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2 20 3" />
      <path d="M17 6l2.5 2.5" />
    </svg>
  )
}

/** A link, for the one that lets people watch without changing anything. */
export function LinkIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 13a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7L11.5 5.8" />
      <path d="M14 11a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.4-1.4" />
    </svg>
  )
}

/**
 * Snapping: a square set down on the points of a grid.
 *
 * Points, not lines. The grid drawn as lines was nearly the Frame tool's own
 * glyph, 700 pixels away on the rail — and what a snap does is land corners
 * on points, which is what this shows.
 */
export function SnapIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      {[5, 12, 19].flatMap((x) =>
        [5, 12, 19].map((y) => (
          <circle key={`${String(x)}.${String(y)}`} cx={x} cy={y} r={1.1} fill="currentColor" stroke="none" />
        )),
      )}
      <rect x="5" y="5" width="7" height="7" rx="1" />
    </svg>
  )
}

/**
 * The rotate grip on the selection box.
 *
 * A GLYPH rather than the dot it used to be. A plain circle above the top edge
 * was the same visual vocabulary as `.of-connect-point` — panel fill, accent
 * ring, perfectly round — sitting a few pixels from it, so the two read as the
 * same control and the only way to tell them apart was to drag one and find
 * out. An arrow that curves says what this one does.
 */
export function RotateIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      {/* Open at the top right, where the head goes: a closed ring would be a
          dot again at the size this renders. */}
      <path d="M19.4 9.2A8 8 0 1 0 20 13" />
      <path d="M14.3 9.2h5.1V4.1" />
    </svg>
  )
}

/**
 * Aligning and distributing a selection.
 *
 * Each one is a RULE plus the bars that have landed on it, because that is the
 * thing being described: not "left" as a direction but "these edges, on this
 * line". Two bars of different lengths, so the icon for centring cannot be
 * mistaken for the icon for aligning left — the shape that tells them apart is
 * the same shape that tells the operations apart.
 */
function alignIcon(
  rule: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number },
  bars: readonly { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[],
) {
  return function Icon({ className }: IconProps) {
    return (
      <svg {...base} className={className}>
        {/* Vertical when the rule's two x values agree, horizontal otherwise. */}
        <path
          d={
            rule.x1 === rule.x2
              ? `M${String(rule.x1)} ${String(rule.y1)}V${String(rule.y2)}`
              : `M${String(rule.x1)} ${String(rule.y1)}H${String(rule.x2)}`
          }
        />
        {bars.map((bar) => (
          <rect
            key={`${String(bar.x)}-${String(bar.y)}`}
            x={bar.x}
            y={bar.y}
            width={bar.w}
            height={bar.h}
            rx={1.5}
          />
        ))}
      </svg>
    )
  }
}

export const AlignLeftIcon = alignIcon({ x1: 4, y1: 4, x2: 4, y2: 20 }, [
  { x: 4, y: 6.5, w: 15, h: 4 },
  { x: 4, y: 13.5, w: 9, h: 4 },
])
export const AlignCenterXIcon = alignIcon({ x1: 12, y1: 4, x2: 12, y2: 20 }, [
  { x: 4.5, y: 6.5, w: 15, h: 4 },
  { x: 7.5, y: 13.5, w: 9, h: 4 },
])
export const AlignRightIcon = alignIcon({ x1: 20, y1: 4, x2: 20, y2: 20 }, [
  { x: 5, y: 6.5, w: 15, h: 4 },
  { x: 11, y: 13.5, w: 9, h: 4 },
])
export const AlignTopIcon = alignIcon({ x1: 4, y1: 4, x2: 20, y2: 4 }, [
  { x: 6.5, y: 4, w: 4, h: 15 },
  { x: 13.5, y: 4, w: 4, h: 9 },
])
export const AlignMiddleYIcon = alignIcon({ x1: 4, y1: 12, x2: 20, y2: 12 }, [
  { x: 6.5, y: 4.5, w: 4, h: 15 },
  { x: 13.5, y: 7.5, w: 4, h: 9 },
])
export const AlignBottomIcon = alignIcon({ x1: 4, y1: 20, x2: 20, y2: 20 }, [
  { x: 6.5, y: 5, w: 4, h: 15 },
  { x: 13.5, y: 11, w: 4, h: 9 },
])

/**
 * Distribution: three bars with the GAPS between them shown equal, which is
 * what the operation equalises. An icon showing three evenly spaced centres
 * would describe the other answer.
 */
export function DistributeXIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x={3} y={5} width={4} height={14} rx={1.5} />
      <rect x={10} y={5} width={4} height={14} rx={1.5} />
      <rect x={17} y={5} width={4} height={14} rx={1.5} />
    </svg>
  )
}

export function DistributeYIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x={5} y={3} width={14} height={4} rx={1.5} />
      <rect x={5} y={10} width={14} height={4} rx={1.5} />
      <rect x={5} y={17} width={14} height={4} rx={1.5} />
    </svg>
  )
}

/**
 * A locked object's badge.
 *
 * Drawn rather than typed, like the rest of the set: an emoji padlock renders
 * differently on every platform and carries a colour nothing here chose.
 */
export function LockIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x={5} y={10.5} width={14} height={9.5} rx={2} />
      <path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" />
    </svg>
  )
}

/** Three items, each with a dot: a bulleted list. */
export function BulletListIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <circle cx="5" cy="6" r="1" fill="currentColor" />
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="5" cy="18" r="1" fill="currentColor" />
    </svg>
  )
}

/** Three items, counted: a numbered list. Drawn, not typed, like every glyph here. */
export function NumberListIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M4 4.5l1.2-.8V8" />
      <path d="M3.6 10.6a1.2 1.2 0 0 1 2.2.6c0 .9-2.2 1.9-2.2 2.8h2.4" />
      <path d="M3.6 16.2h2.2l-1.2 1.5a1.1 1.1 0 1 1-1 1.7" />
    </svg>
  )
}

/**
 * A borders choice, drawn as the edges it reaches.
 *
 * A two-by-two block whose every line is shown faint and whose chosen lines
 * are drawn solid — the picture every spreadsheet uses, because the name of a
 * preset ("inner vertical") is much slower to read than which lines light up.
 * `none` crosses the block out and `reset` draws it all dashed: the table's
 * own lines, whatever they are.
 */
export function BorderPresetIcon({ className, preset }: IconProps & { preset: string }) {
  const lines: Record<string, string> = {
    top: 'M4 4h16',
    bottom: 'M4 20h16',
    left: 'M4 4v16',
    right: 'M20 4v16',
    horizontal: 'M4 12h16',
    vertical: 'M12 4v16',
  }
  const lit: Record<string, readonly string[]> = {
    all: ['top', 'bottom', 'left', 'right', 'horizontal', 'vertical'],
    outer: ['top', 'bottom', 'left', 'right'],
    inner: ['horizontal', 'vertical'],
    horizontal: ['horizontal'],
    vertical: ['vertical'],
    top: ['top'],
    bottom: ['bottom'],
    left: ['left'],
    right: ['right'],
    none: [],
    reset: [],
  }
  const on = lit[preset] ?? []
  return (
    <svg {...base} className={className}>
      {Object.entries(lines).map(([name, d]) =>
        on.includes(name) ? null : (
          <path
            key={name}
            d={d}
            opacity={0.35}
            strokeWidth={1}
            strokeDasharray={preset === 'reset' ? undefined : '1 2.5'}
          />
        ),
      )}
      {on.map((name) => (
        <path key={name} d={lines[name]} strokeWidth={2.2} />
      ))}
      {preset === 'none' && <path d="M6 18 18 6" />}
    </svg>
  )
}
