import { useEffect, useRef, useState } from 'react'

import { CODE_LANGUAGES, MAX_CODE, type CodeData } from '@openframe/core'

import { inkColor } from '../scene/style-tokens.js'
import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { highlight } from './code-highlight.js'

/**
 * A block of code, with its shape intact.
 *
 * Whitespace is the content here, so the element preserves it and never wraps
 * on a space. Long lines scroll rather than reflow: a wrapped line of code is
 * a line whose indentation lies about its depth.
 */
function CodeRenderer({ object }: ObjectViewProps<CodeData>) {
  const { code, language } = object.data
  /*
   * Highlighted markup, or null for "show it plain".
   *
   * Starts null on every change so the code is READABLE immediately and gains
   * colour when the highlighter lands. A view cannot await, and the honest
   * shape of that is plain text now rather than an empty box until a download
   * finishes — the same reasoning rule 20 applies to an asset URL.
   */
  const [marked, setMarked] = useState<{ of: string; html: string | null }>({
    of: '',
    html: null,
  })

  /*
   * What the stored markup was produced FROM, so a stale result is discarded
   * during render rather than cleared by an effect. Clearing it in the effect
   * would be a setState in an effect body — a cascading render, which React
   * now warns about — and this says the same thing without one.
   */
  const source = `${language}\u0000${code}`

  useEffect(() => {
    let live = true
    highlight(code, language)
      .then((html) => {
        if (live) setMarked({ of: `${language}\u0000${code}`, html })
      })
      .catch(() => {
        // Colour is the only thing a failure costs.
      })
    return () => {
      live = false
    }
  }, [code, language])

  return (
    <div
      className="of-code"
      style={{ borderColor: inkColor(object.style.strokeColor), opacity: object.style.opacity ?? 1 }}
      role="group"
      aria-label={`Code block, ${language}`}
    >
      <span className="of-code__language" aria-hidden="true">
        {language}
      </span>
      <pre className="of-code__pre" data-testid="code-block">
        {marked.of !== source || marked.html === null ? (
          <code className="of-code__code">{code}</code>
        ) : (
          /*
           * The one place this component writes markup rather than text, and
           * it is reached only when highlight.js produced it — which escapes
           * the input as part of producing it. Every other path, including
           * every failure, renders `code` as a React child and is escaped by
           * React.
           */
          <code className="of-code__code" dangerouslySetInnerHTML={{ __html: marked.html }} />
        )}
      </pre>
    </div>
  )
}

/**
 * Editing: a plain textarea, because code is plain text.
 *
 * Tab inserts a tab rather than leaving the field. In a code block the key
 * means indentation, and a browser's default would make the one character
 * that matters most impossible to type.
 */
function CodeEditor({ object, Chrome, onCommit, onCancel }: ObjectEditorProps<CodeData>) {
  const [code, setCode] = useState(object.data.code)
  const [language, setLanguage] = useState(object.data.language)
  const area = useRef<HTMLTextAreaElement>(null)

  return (
    <div
      className="of-code of-code--editing of-editor-chrome"
      data-testid="code-editor"
      onBlur={(event) => {
        /*
         * Committed only when focus leaves the WHOLE editor.
         *
         * The textarea used to commit on any blur at all, so reaching for the
         * language menu beside it ended the edit and unmounted the editor —
         * and the press then landed on nothing. Moving between the field and
         * its own controls is still one edit.
         */
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return
        }
        // The menu is PORTALED out of this element, so `contains` says a press
        // on it left the editor. The layer is the editor, for focus.
        if (
          event.relatedTarget instanceof Element &&
          event.relatedTarget.closest('[data-chrome-layer]') !== null
        ) {
          return
        }
        onCommit({ code, language })
      }}
    >
      {/*
        * The language menu is APPARATUS, so it goes where all of it goes: a
        * screen-space layer that places and clamps it. Inside the editor it
        * was in world space, which made it grow with the zoom and put it
        * off-window on a code block bigger than the viewport.
        */}
      <Chrome anchor={{ x: 0, y: 0, width: 1, height: 0 }} prefer={['above', 'below']}>
      <select
        className="of-code__picker of-surface"
        value={CODE_LANGUAGES.includes(language as (typeof CODE_LANGUAGES)[number]) ? language : 'plain'}
        aria-label="Language"
        data-testid="code-language"
        onChange={(event) => {
          setLanguage(event.target.value)
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
        }}
      >
        {CODE_LANGUAGES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      </Chrome>

      <textarea
        ref={area}
        className="of-code__input"
        value={code}
        maxLength={MAX_CODE}
        spellCheck={false}
        autoFocus
        aria-label="Code"
        data-testid="code-input"
        onChange={(event) => {
          setCode(event.target.value)
        }}
        onKeyDown={(event) => {
          // The board's own shortcuts must not fire while typing code.
          event.stopPropagation()
          if (event.key === 'Escape') {
            onCancel()
            return
          }
          if (event.key === 'Tab') {
            event.preventDefault()
            const field = event.currentTarget
            const { selectionStart: from, selectionEnd: to } = field
            setCode(`${code.slice(0, from)}\t${code.slice(to)}`)
            // Restored after React has written the new value, or the caret
            // jumps to the end of the block on every indent.
            requestAnimationFrame(() => {
              field.selectionStart = from + 1
              field.selectionEnd = from + 1
            })
          }
        }}
      />
    </div>
  )
}

export const codeView = defineObjectView<CodeData>({
  type: 'code',
  Renderer: CodeRenderer,
  InlineEditor: CodeEditor,
})
