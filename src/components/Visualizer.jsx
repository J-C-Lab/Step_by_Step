import React, { useEffect, useMemo, useRef } from 'react'
import useThemeStore from '../store/themeStore.js'
import useTimelineStore from '../store/timelineStore.js'
import useGraphStore from '../store/graphStore.js'
import VisualizerView from '../visualizer/VisualizerView.jsx'
import { buildVisualizerState } from '../visualizer/VisualizerAdapter.js'

/**
 * Visualizer: upper-right panel.
 * VisualizerView (GraphCanvas) is ALWAYS mounted so ReactFlowProvider is never
 * torn down — this preserves incremental node state across steps.
 */
export default function Visualizer() {
  const { theme } = useThemeStore()
  const { timeline, currentStep, status } = useTimelineStore()

  const updateGraph = useGraphStore(s => s.updateGraph)
  const resetGraph  = useGraphStore(s => s.reset)

  const snap     = timeline[currentStep] ?? null
  const prevSnap = currentStep > 0 ? (timeline[currentStep - 1] ?? null) : null
  const total    = timeline.length

  const prevTimelineLen = useRef(0)

  const structures = useMemo(() => {
    if (!snap) return []
    return buildVisualizerState(
      { variables: snap.variables },
      prevSnap ? { variables: prevSnap.variables } : null
    ).structures
  }, [snap, prevSnap])

  // Feed GraphStore whenever displayed step data changes.
  // We intentionally avoid step dedupe refs here so timeline scrub / pause /
  // strict-mode remounts cannot accidentally skip a graph update.
  useEffect(() => {
    if (!snap || structures.length === 0) return
    updateGraph(structures, snap.step)
  }, [snap, structures, updateGraph])

  // Reset graph only on explicit timeline reset or fresh new program session.
  // Avoid clearing when timeline length is 1 after init; otherwise step0 graph
  // is fed then immediately wiped, causing an empty right panel.
  useEffect(() => {
    const isHardReset = timeline.length === 0
    const isNewProgramStart =
      timeline.length === 1 &&
      prevTimelineLen.current > 1 &&
      (snap?.step ?? null) === 0

    if (isHardReset || isNewProgramStart) {
      resetGraph()
    }

    prevTimelineLen.current = timeline.length
  }, [timeline.length, snap?.step, resetGraph])

  return (
    <div className={`
      flex flex-col h-full gap-2 p-3
      ${theme.panelBg} rounded-2xl
    `}>
      {/* Top row: step counter + progress bar + status */}
      <div className="flex items-center gap-3 shrink-0">
        <div className={`flex flex-col ${theme.text}`}>
          <span className="text-2xl font-bold tabular-nums leading-none">
            {snap ? snap.step : 0}
          </span>
          <span className={`text-xs ${theme.subText}`}>/ {total > 0 ? total - 1 : 0} steps</span>
        </div>

        <div className="flex-1 h-1.5 rounded-full bg-current opacity-10 relative overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${theme.accent} opacity-100 transition-all duration-300`}
            style={{ width: total > 1 ? `${(currentStep / (total - 1)) * 100}%` : '0%' }}
          />
        </div>

        <StatusBadge status={status} theme={theme} />
      </div>

      {/* Line indicator — shrink-0 so it doesn't collapse */}
      {snap?.line != null && (
        <div className="shrink-0">
          <LineCard line={snap.line} theme={theme} />
        </div>
      )}

      {/* React Flow canvas — always mounted, flex-1 to fill remaining space */}
      <div className="flex-1 min-h-0">
        <VisualizerView theme={theme} fallbackStructures={structures} />
      </div>

      {/* Call stack frames — below canvas, scrollable if needed */}
      {snap && (
        <div className="shrink-0 max-h-40 overflow-y-auto">
          <StackVisual callStack={snap.callStack} theme={theme} />
        </div>
      )}

      {/* Empty state hint */}
      {!snap && <EmptyHint theme={theme} />}
    </div>
  )
}

function StatusBadge({ status, theme }) {
  const colors = {
    idle:     'bg-gray-400/20 text-gray-400',
    running:  'bg-green-400/20 text-green-400',
    paused:   'bg-yellow-400/20 text-yellow-400',
    finished: 'bg-blue-400/20 text-blue-400',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[status] ?? colors.idle}`}>
      {status}
    </span>
  )
}

function LineCard({ line, theme }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-yellow-400/10 border border-yellow-400/20">
      <span className="text-yellow-400 text-lg">▶</span>
      <div>
        <p className={`text-xs font-medium ${theme.text}`}>Executing</p>
        <p className="text-xs text-yellow-400 font-mono">Line {line}</p>
      </div>
    </div>
  )
}

function StackVisual({ callStack, theme }) {
  if (!callStack || callStack.length === 0) return null
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wider ${theme.subText} mb-1.5 select-none`}>Stack Frames</p>
      <div className="flex flex-col-reverse gap-1">
        {callStack.map((frame, i) => (
          <div
            key={i}
            className={`
              rounded-xl px-3 py-2 flex items-center gap-2
              ${i === callStack.length - 1
                ? `${theme.panelBg} border-2 border-yellow-400/30`
                : theme.sidebarBg}
              transition-all duration-200
            `}
            style={{ marginLeft: i * 8 }}
          >
            <span className={`text-xs font-mono ${i === callStack.length - 1 ? theme.accentText : theme.subText}`}>
              {frame}
            </span>
            {i === callStack.length - 1 && (
              <span className="ml-auto text-yellow-400 text-xs">← top</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyHint({ theme }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 opacity-30">
      <p className={`text-xs ${theme.subText} select-none`}>Run or step code to see memory graph</p>
    </div>
  )
}
