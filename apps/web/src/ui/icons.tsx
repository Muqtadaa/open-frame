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

/** Replaces a `\u25b8` text glyph: icons are drawn, at one stroke weight. */
export function DisclosureIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 7l5 5-5 5" />
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

export function GridIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  )
}
