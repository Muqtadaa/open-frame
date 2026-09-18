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

export function ShapeIcon({ className, kind }: IconProps & { kind: string }) {
  return (
    <svg {...base} className={className}>
      {kind === 'ellipse' && <ellipse cx="12" cy="12" rx="9" ry="7.5" />}
      {kind === 'triangle' && <path d="M12 4l8.5 15.5h-17z" />}
      {kind === 'diamond' && <path d="M12 3.5L20.5 12 12 20.5 3.5 12z" />}
      {kind === 'rectangle' && <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />}
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

export function GridIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  )
}
