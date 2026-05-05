import React, { useRef, useEffect } from 'react'
import MonacoEditor from '@monaco-editor/react'
import useThemeStore from '../store/themeStore.js'
import useTimelineStore from '../store/timelineStore.js'

// Inject line-highlight CSS once
let styleInjected = false
function injectHighlightStyle() {
  if (styleInjected) return
  styleInjected = true
  const el = document.createElement('style')
  el.textContent = [
    '.current-line-highlight { background: rgba(255,200,0,0.18) !important; border-left: 3px solid #f59e0b !important; }',
    '.current-line-glyph::before { content: "▶"; color: #f59e0b; font-size: 10px; margin-left: 2px; }',
  ].join('\n')
  document.head.appendChild(el)
}

export default function CodeEditor({ code, onChange }) {
  const { theme } = useThemeStore()
  const { timeline, currentStep } = useTimelineStore()
  const editorRef = useRef(null)
  const decorationsRef = useRef([])
  const spaceKeyDisposableRef = useRef(null)

  useEffect(() => {
    return () => {
      spaceKeyDisposableRef.current?.dispose()
      spaceKeyDisposableRef.current = null
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
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden rounded-2xl mx-3 mb-3">
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
    </div>
  )
}
