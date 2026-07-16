import React, { useRef, useEffect, useState } from 'react'
import MonacoEditor from '@monaco-editor/react'
import useSelectionStore from '../store/selectionStore.js'
import useThemeStore from '../store/themeStore.js'
import useTimelineStore from '../store/timelineStore.js'
import { prepareCodeForVisualization } from '../utils/codePrep.js'

// Inject line-highlight CSS once
let styleInjected = false
function injectHighlightStyle() {
  if (styleInjected) return
  styleInjected = true
  const el = document.createElement('style')
  el.textContent = [
    '.current-line-highlight { background: rgba(255,200,0,0.18) !important; border-left: 3px solid #f59e0b !important; }',
    '.current-line-glyph::before { content: "▶"; color: #f59e0b; font-size: 10px; margin-left: 2px; }',
    '.selected-variable-highlight { background: rgba(59,130,246,0.22) !important; border-bottom: 2px solid rgba(59,130,246,0.9); border-radius: 3px; }',
  ].join('\n')
  document.head.appendChild(el)
}

export default function CodeEditor({ code, onChange }) {
  const { theme } = useThemeStore()
  const { timeline, currentStep } = useTimelineStore()
  const selectedVariable = useSelectionStore(s => s.selectedVariable)
  const setSelectedVariable = useSelectionStore(s => s.setSelectedVariable)
  const editorRef = useRef(null)
  const decorationsRef = useRef([])
  const variableDecorationsRef = useRef([])
  const spaceKeyDisposableRef = useRef(null)
  const mouseDownDisposableRef = useRef(null)
  const toastTimerRef = useRef(null)
  const [prepMessages, setPrepMessages] = useState([])
  const [prepIncomplete, setPrepIncomplete] = useState(false)

  useEffect(() => {
    return () => {
      spaceKeyDisposableRef.current?.dispose()
      spaceKeyDisposableRef.current = null
      mouseDownDisposableRef.current?.dispose()
      mouseDownDisposableRef.current = null
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  // Sync highlight whenever step changes
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const snap = timeline[currentStep]
    const line = snap?.line

    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      line != null
        ? [{
            range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
            options: {
              isWholeLine: true,
              className: 'current-line-highlight',
              glyphMarginClassName: 'current-line-glyph',
            },
          }]
        : []
    )
  }, [currentStep, timeline])

  useEffect(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!editor || !model || !selectedVariable) {
      if (editor) {
        variableDecorationsRef.current = editor.deltaDecorations(variableDecorationsRef.current, [])
      }
      return
    }

    const matches = model.findMatches(
      `\\b${escapeRegExp(selectedVariable)}\\b`,
      false,
      true,
      true,
      null,
      false
    )

    variableDecorationsRef.current = editor.deltaDecorations(
      variableDecorationsRef.current,
      matches.map(match => ({
        range: match.range,
        options: { inlineClassName: 'selected-variable-highlight' },
      }))
    )
  }, [selectedVariable, code])

  function handleMount(editor) {
    editorRef.current = editor
    injectHighlightStyle()

    spaceKeyDisposableRef.current?.dispose()
    spaceKeyDisposableRef.current = editor.onKeyDown(e => {
      const ev = e.browserEvent
      const isPlainSpace =
        ev.code === 'Space' &&
        !ev.ctrlKey &&
        !ev.metaKey &&
        !ev.altKey

      if (!isPlainSpace) return

      e.preventDefault()
      editor.trigger('keyboard', 'type', { text: ' ' })
    })

    mouseDownDisposableRef.current?.dispose()
    mouseDownDisposableRef.current = editor.onMouseDown(e => {
      const position = e.target.position
      const model = editor.getModel()
      if (!position || !model) return

      const word = model.getWordAtPosition(position)
      if (!word?.word || !isIdentifier(word.word)) return
      setSelectedVariable(word.word)
    })
  }

  function handlePrepareCode() {
    const result = prepareCodeForVisualization(code)
    onChange(result.code)
    setPrepMessages(result.messages)
    setPrepIncomplete(Boolean(result.incomplete))

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setPrepMessages([])
      setPrepIncomplete(false)
      toastTimerRef.current = null
    }, result.incomplete ? 9000 : 5200)

    requestAnimationFrame(() => {
      editorRef.current?.focus()
    })
  }

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden rounded-2xl mx-3 mb-3">
      <MonacoEditor
        height="100%"
        language="javascript"
        theme={theme.monacoTheme}
        value={code}
        onChange={val => onChange(val ?? '')}
        onMount={handleMount}
        options={{
          fontSize: 14,
          fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
          fontLigatures: true,
          lineNumbers: 'on',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          roundedSelection: true,
          padding: { top: 14, bottom: 14 },
          tabSize: 2,
          insertSpaces: true,
          autoIndent: 'full',
          formatOnPaste: true,
          wordWrap: 'on',
          renderLineHighlight: 'none',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          glyphMargin: true,
        }}
      />

      {prepMessages.length > 0 && (
        <div className={`
          absolute right-3 bottom-14 z-20 max-w-[420px]
          rounded-2xl px-3 py-2 text-xs shadow-lg backdrop-blur-xl
          ${prepIncomplete
            ? 'border border-amber-400/40 bg-amber-500/15 text-amber-50'
            : `${theme.panelBg} ${theme.text}`}
        `}>
          <div className={`font-semibold mb-1 ${prepIncomplete ? 'text-amber-200' : ''}`}>
            {prepIncomplete ? '请补充完整代码' : '已适配为可视化脚本'}
          </div>
          <ul className={`space-y-1 whitespace-pre-wrap ${prepIncomplete ? 'text-amber-100/90' : theme.subText}`}>
            {prepMessages.slice(0, 4).map((msg, i) => (
              <li key={i}>- {msg}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={handlePrepareCode}
        className={`
          absolute right-3 bottom-3 z-20
          rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg
          transition-all duration-150 active:scale-95
          ${theme.btnActive}
        `}
        title="将当前代码整理为更适合执行沙盒和可视化的脚本"
      >
        适配可视化
      </button>
    </div>
  )
}

function isIdentifier(value) {
  const keywords = new Set([
    'var', 'let', 'const', 'function', 'return', 'for', 'while', 'if', 'else',
    'true', 'false', 'null', 'undefined', 'new', 'Array', 'from',
  ])
  return /^[A-Za-z_$][\w$]*$/.test(value) && !keywords.has(value)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
