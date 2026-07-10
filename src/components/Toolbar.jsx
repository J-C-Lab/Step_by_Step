import React, { useState } from 'react'
import useThemeStore from '../store/themeStore.js'
import useTimelineStore from '../store/timelineStore.js'
import useHistoryStore from '../store/historyStore.js'
import HistoryPanel from './HistoryPanel.jsx'
import * as Controller from '../core/InterpreterController.js'

// ─── Icons ────────────────────────────────────────────────────────────────

const IconRun = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 2.5l9 4.5-9 4.5V2.5z" fill="currentColor"/>
  </svg>
)
const IconPause = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="3" y="2" width="3" height="10" rx="1" fill="currentColor"/>
    <rect x="8" y="2" width="3" height="10" rx="1" fill="currentColor"/>
  </svg>
)
const IconStep = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 2.5l7 4.5-7 4.5V2.5z" fill="currentColor"/>
    <rect x="10" y="2" width="2" height="10" rx="1" fill="currentColor"/>
  </svg>
)
const IconOver = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 3.5l5 3.5-5 3.5V3.5z" fill="currentColor"/>
    <path d="M10 2c1.5.8 2 2.2 2 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <rect x="10" y="7" width="2" height="5" rx="1" fill="currentColor"/>
  </svg>
)
const IconOut = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M5 11L9 7 5 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="10" y="3" width="2" height="8" rx="1" fill="currentColor"/>
  </svg>
)
const IconReset = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2 7a5 5 0 1 0 1-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M2 2v3h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IconEnd = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 2.5l7 4.5-7 4.5V2.5z" fill="currentColor"/>
    <rect x="11" y="2" width="2" height="10" rx="1" fill="currentColor"/>
  </svg>
)
const IconStop = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor"/>
  </svg>
)
const IconHistory = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M7 4.5V7l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

// ─── Toolbar ──────────────────────────────────────────────────────────────

export default function Toolbar({ code, onLoadCode, compactMode = false }) {
  const { theme }                        = useThemeStore()
  const { status, setStatus, hardReset } = useTimelineStore()
  const addRecord                        = useHistoryStore(s => s.addRecord)
  const [showHistory, setShowHistory]    = useState(false)

  const isIdle     = status === 'idle'
  const isRunning  = status === 'running'
  const isPaused   = status === 'paused'
  const isFinished = status === 'finished'

  function handleRun() {
    if (isIdle) {
      addRecord(code)
      Controller.init(code)
      setStatus('running')
      Controller.runAll()
    } else if (isRunning) {
      Controller.pause()
      setStatus('paused')
    } else if (isPaused) {
      setStatus('running')
      Controller.runAll()
    } else if (isFinished) {
      Controller.reset()
      hardReset()
    }
  }

  function handleStepInit() {
    if (isIdle) {
      addRecord(code)
      Controller.init(code)
      setStatus('paused')
    } else if (isPaused) {
      Controller.step()
    }
  }

  function handleStepOver() {
    if (!isPaused) return
    Controller.stepOver()
  }

  function handleStepOut() {
    if (!isPaused) return
    Controller.stepOut()
  }

  function handleRunToEnd() {
    if (!isPaused) return
    setStatus('running')
    Controller.runAll()
  }

  function handleReset() {
    Controller.pause()
    Controller.reset()
    hardReset()
  }

  function handleStop() {
    Controller.pause()
    Controller.reset()
    hardReset()
    setStatus('idle')
  }

  const runLabel  = isRunning ? 'Pause' : isPaused ? 'Resume' : isFinished ? 'Restart' : 'Run'
  const RunIcon   = isRunning ? IconPause : IconRun
  const runBtnClass = (isIdle || isFinished) ? theme.runBtn : theme.runBtnActive

  const historyBtn = (
    <button
      onClick={() => setShowHistory(v => !v)}
      className={`
        flex items-center justify-center w-7 h-7 rounded-xl
        transition-all duration-150 active:scale-95 select-none
        ${showHistory ? theme.btnActive : theme.btnBase}
      `}
      title="历史记录"
    >
      <IconHistory />
    </button>
  )

  return (
    <div className={`
      flex flex-col gap-1.5 px-3 py-2 shrink-0 min-w-0 w-full
      ${theme.sidebarBg} rounded-2xl mx-3 mt-3
    `}>
      {compactMode ? (
        <div className="flex items-center gap-1.5 min-w-0 w-full">
          {/* Run / Pause / Resume / Restart */}
          <button
            onClick={handleRun}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0
              transition-all duration-150 active:scale-95 select-none
              ${runBtnClass}
            `}
            title={runLabel}
          >
            <RunIcon />
            <span>{runLabel}</span>
          </button>

          <ToolBtn
            onClick={handleStepInit}
            disabled={isRunning || isFinished}
            icon={<IconStep />}
            label="Step"
            theme={theme}
            title={isIdle ? '初始化并进入单步模式' : '单步进入（遇函数则进入内部）'}
          />

          <div className="ml-auto shrink-0">
            {historyBtn}
          </div>
        </div>
      ) : (
        <>
          {/* Top row: primary actions + status */}
          <div className="flex items-start gap-2 min-w-0 w-full">
            <div className="flex items-center flex-wrap gap-1.5 min-w-0">
              <button
                onClick={handleRun}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0
                  transition-all duration-150 active:scale-95 select-none
                  ${runBtnClass}
                `}
                title={runLabel}
              >
                <RunIcon />
                <span>{runLabel}</span>
              </button>

              <div className={`w-px h-5 mx-0.5 shrink-0 ${theme.divider}`} />

              <ToolBtn
                onClick={handleStepInit}
                disabled={isRunning || isFinished}
                icon={<IconStep />}
                label="Step"
                theme={theme}
                title={isIdle ? '初始化并进入单步模式' : '单步进入（遇函数则进入内部）'}
              />

              {/* Step Over */}
              <ToolBtn
                onClick={handleStepOver}
                disabled={!isPaused}
                icon={<IconOver />}
                label="Over"
                theme={theme}
                title="单步跨过（执行完当前行的函数调用，停在下一行）"
              />

              {/* Step Out */}
              <ToolBtn
                onClick={handleStepOut}
                disabled={!isPaused}
                icon={<IconOut />}
                label="Out"
                theme={theme}
                title="跳出函数（执行完当前函数的剩余部分，返回调用处）"
              />

              {/* Run to End */}
              <ToolBtn
                onClick={handleRunToEnd}
                disabled={!isPaused}
                icon={<IconEnd />}
                label="End"
                theme={theme}
                title="运行至结束"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {historyBtn}
              <StatusPill status={status} theme={theme} />
            </div>
          </div>

          <div className={`h-px w-full ${theme.divider} opacity-40`} />

          {/* Bottom row: secondary actions */}
          <div className="flex items-center gap-1.5 min-w-0 w-full">
            {/* Reset */}
            <ToolBtn
              onClick={handleReset}
              disabled={isIdle}
              icon={<IconReset />}
              label="Reset"
              theme={theme}
              title="重置"
            />

            {/* Stop */}
            <ToolBtn
              onClick={handleStop}
              disabled={isIdle || isFinished}
              icon={<IconStop />}
              label="Stop"
              theme={theme}
              title="停止执行"
            />
          </div>
        </>
      )}

      {/* History panel overlay */}
      {showHistory && (
        <HistoryPanel
          onLoadCode={code => { if (onLoadCode) onLoadCode(code) }}
          onClose={() => setShowHistory(false)}
          theme={theme}
        />
      )}
    </div>
  )
}

function ToolBtn({ onClick, disabled, icon, label, theme, title }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className={`
        flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium shrink-0
        transition-all duration-150 active:scale-95 select-none whitespace-nowrap
        ${disabled ? theme.btnDisabled : theme.btnBase}
      `}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function StatusPill({ status, theme }) {
  const map = {
    idle:     { dot: 'bg-gray-400',                   label: 'Idle' },
    running:  { dot: 'bg-green-400 animate-pulse',    label: 'Running' },
    paused:   { dot: 'bg-yellow-400',                 label: 'Paused' },
    finished: { dot: 'bg-blue-400',                   label: 'Done' },
  }
  const s = map[status] || map.idle
  return (
    <span className={`
      flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
      ${theme.tag} transition-all duration-300
    `}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}
