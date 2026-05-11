import React, { useMemo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow'
import 'reactflow/dist/style.css'
import useGraphStore from '../store/graphStore.js'
import useSelectionStore from '../store/selectionStore.js'

// ─── Pointer node (tree / linkedlist) ─────────────────────────────────────

function GlassNode({ data }) {
  const active      = data.isActive
  const selected    = data.isSelected
  const activeColor = data.activeColor  ?? 'rgba(74,222,128,0.85)'
  const activeBg    = data.activeBg     ?? 'rgba(74,222,128,0.18)'
  const activeGlow  = data.activeGlow   ?? 'rgba(74,222,128,0.5)'
  const activeTxt   = data.activeTxt    ?? '#4ade80'
  const normalTxt   = data.graphText    ?? '#e2e8f0'
  const mutedTxt    = data.graphMuted   ?? 'rgba(148,163,184,0.6)'
  const borderColor = selected ? '#facc15' : active ? activeColor : 'rgba(255,255,255,0.20)'
  const bgColor     = selected ? 'rgba(250,204,21,0.16)' : active ? activeBg : 'rgba(255,255,255,0.09)'
  const txtColor    = selected ? '#b45309' : active ? activeTxt : normalTxt
  const glowColor   = selected ? 'rgba(250,204,21,0.55)' : activeGlow

  return (
    <div style={{
      background:   bgColor,
      border:       `2px solid ${borderColor}`,
      backdropFilter: 'blur(10px)',
      borderRadius: 12,
      padding:      '7px 18px',
      minWidth:     44,
      textAlign:    'center',
      fontSize:     14,
      fontWeight:   700,
      fontFamily:   'monospace',
      color:        txtColor,
      boxShadow:    active || selected
        ? `0 0 18px ${glowColor}, 0 2px 8px rgba(0,0,0,0.35)`
        : '0 2px 14px rgba(0,0,0,0.28)',
      transition:   'all 0.3s ease',
      userSelect:   'none',
      cursor:       'grab',
    }}>
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />
      {data.label}
      {data.varName && (
        <div style={{
          fontSize:    9,
          fontWeight:  400,
          color:       active ? `${activeTxt}b3` : mutedTxt,
          marginTop:   3,
          letterSpacing: '0.04em',
        }}>
          {data.varName}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}

function NullNode() {
  return (
    <div style={{
      background:   'rgba(255,255,255,0.03)',
      border:       '1.5px dashed rgba(255,255,255,0.13)',
      borderRadius: 10,
      padding:      '5px 12px',
      fontSize:     12,
      fontFamily:   'monospace',
      color:        '#475569',
      userSelect:   'none',
    }}>
      ∅
    </div>
  )
}

// ─── Card node (array / stack / queue / matrix / object / primitive) ───────

const TYPE_BORDER = {
  array:     'rgba(96,165,250,0.5)',
  stack:     'rgba(167,139,250,0.5)',
  queue:     'rgba(52,211,153,0.5)',
  matrix:    'rgba(251,191,36,0.5)',
  object:    'rgba(251,146,60,0.5)',
  primitive: 'rgba(148,163,184,0.4)',
}

const TYPE_LABEL_COLOR = {
  array:     '#60a5fa',
  stack:     '#a78bfa',
  queue:     '#34d399',
  matrix:    '#fbbf24',
  object:    '#fb923c',
  primitive: '#94a3b8',
}

function CardNode({ data }) {
  const active      = data.isActive
  const selected    = data.isSelected
  const activeGlow  = data.activeGlow  ?? 'rgba(74,222,128,0.5)'
  const textColor   = data.graphText   ?? '#e2e8f0'
  const mutedColor  = data.graphMuted  ?? '#94a3b8'
  const cardBg      = data.graphCardBg ?? 'rgba(255,255,255,0.05)'
  const activeCardBg = data.graphCardActiveBg ?? 'rgba(255,255,255,0.10)'
  const cardWidth   = data.cardWidth ?? 260
  const borderColor = active
    ? (data.activeColor ?? 'rgba(74,222,128,0.85)')
    : (TYPE_BORDER[data.structType] ?? 'rgba(255,255,255,0.15)')
  const finalBorderColor = selected ? '#facc15' : borderColor
  const labelColor  = TYPE_LABEL_COLOR[data.structType] ?? '#94a3b8'
  const typeLabel   = data.structType?.toUpperCase() ?? '?'

  return (
    <div style={{
      background:   selected ? 'rgba(250,204,21,0.14)' : active ? activeCardBg : cardBg,
      border:       `1.5px solid ${finalBorderColor}`,
      borderRadius: 14,
      padding:      '8px 12px',
      minWidth:     130,
      width:        cardWidth,
      boxSizing:    'border-box',
      fontFamily:   'monospace',
      boxShadow:    active || selected
        ? `0 0 18px ${selected ? 'rgba(250,204,21,0.45)' : activeGlow}, 0 2px 10px rgba(0,0,0,0.3)`
        : '0 2px 10px rgba(0,0,0,0.2)',
      transition:   'all 0.3s ease',
      userSelect:   'none',
      cursor:       'grab',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: textColor }}>{data.name}</span>
        <span style={{
          fontSize: 9, fontWeight: 600,
          color: labelColor,
          background: `${labelColor}22`,
          padding: '1px 6px',
          borderRadius: 20,
          letterSpacing: '0.05em',
        }}>{typeLabel}{data.meta?.op ? ` · ${data.meta.op}` : ''}</span>
      </div>
      {/* Content */}
      <CardContent
        structType={data.structType}
        value={data.value}
        labelColor={labelColor}
        textColor={textColor}
        mutedColor={mutedColor}
        maxContentWidth={Math.max(100, cardWidth - 24)}
      />
      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, pointerEvents: 'none' }}
      />
    </div>
  )
}

function CardContent({ structType, value, labelColor, textColor = '#e2e8f0', mutedColor = '#94a3b8', maxContentWidth = 240 }) {
  if (structType === 'primitive') {
    return (
      <div style={{ fontSize: 15, fontWeight: 700, color: textColor }}>
        {fmtVal(value)}
        <span style={{ fontSize: 9, color: mutedColor, marginLeft: 6 }}>{typeof value}</span>
      </div>
    )
  }

  if (structType === 'object') {
    const entries = value && typeof value === 'object'
      ? Object.entries(value).filter(([k]) => k !== '__id__')
      : []
    if (entries.length === 0) return <span style={{ fontSize: 11, color: mutedColor }}>&#123; &#125;</span>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {entries.slice(0, 8).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 6, fontSize: 11 }}>
            <span style={{ color: labelColor, minWidth: 40, fontWeight: 600 }}>{k}</span>
            <span style={{ color: mutedColor }}>:</span>
            <span style={{ color: textColor }}>{fmtVal(v)}</span>
          </div>
        ))}
        {entries.length > 8 && <span style={{ fontSize: 9, color: mutedColor }}>+{entries.length - 8} more</span>}
      </div>
    )
  }

  if (structType === 'matrix') {
    const rows = Array.isArray(value) ? value : []
    const visibleRows = rows.slice(0, 8)
    const maxCols = visibleRows.reduce(
      (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
      0
    )
    const visibleCols = Math.min(maxCols, 12)
    const cellSize = 34
    const rowLabelWidth = 54
    return (
      <div style={{ maxWidth: maxContentWidth, overflow: 'auto', paddingBottom: 2 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${rowLabelWidth}px repeat(${visibleCols}, ${cellSize}px)`,
            gridAutoRows: `${cellSize}px`,
            alignItems: 'stretch',
          }}
        >
          <div />
          {Array.from({ length: visibleCols }).map((_, ci) => (
            <MatrixAxisLabel key={`col-${ci}`} mutedColor={mutedColor}>
              j={ci}
            </MatrixAxisLabel>
          ))}

          {visibleRows.map((row, ri) => (
            <React.Fragment key={`row-${ri}`}>
              <MatrixAxisLabel mutedColor={mutedColor} align="right">
                {getMatrixRowLabel(ri)}
              </MatrixAxisLabel>
              {Array.from({ length: visibleCols }).map((_, ci) => (
                <MatrixCell
                  key={`${ri}-${ci}`}
                  value={Array.isArray(row) ? row[ci] : undefined}
                  textColor={textColor}
                  mutedColor={mutedColor}
                  labelColor={labelColor}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
        {(rows.length > visibleRows.length || maxCols > visibleCols) && (
          <div style={{ marginTop: 4, fontSize: 9, color: mutedColor }}>
            showing {visibleRows.length}/{rows.length} rows, {visibleCols}/{maxCols} cols
          </div>
        )}
      </div>
    )
  }

  // array / stack / queue
  const arr = Array.isArray(value) ? value : []
  const isStack = structType === 'stack'
  const isQueue = structType === 'queue'

  if (arr.length === 0) return <span style={{ fontSize: 11, color: mutedColor }}>[ empty ]</span>

  if (isStack) {
    const reversed = [...arr].reverse()
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {reversed.slice(0, 8).map((v, ri) => (
          <div key={ri} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: ri === 0 ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.04)',
            border:     ri === 0 ? '1px solid rgba(167,139,250,0.3)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 6, padding: '2px 7px', fontSize: 12, fontWeight: 700, color: textColor,
          }}>
            {fmtVal(v)}
            {ri === 0 && <span style={{ fontSize: 9, color: '#a78bfa', marginLeft: 6 }}>top</span>}
          </div>
        ))}
        {arr.length > 8 && <span style={{ fontSize: 9, color: mutedColor }}>+{arr.length - 8} more</span>}
      </div>
    )
  }

  // array or queue — horizontal cells
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: maxContentWidth }}>
      {arr.slice(0, 12).map((v, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {isQueue && (
            <span style={{ fontSize: 8, color: `${labelColor}99`, marginBottom: 2 }}>
              {i === 0 ? 'F' : i === arr.length - 1 ? 'R' : ''}
            </span>
          )}
          <span style={{
            fontSize: 13,
            fontWeight: 800,
            color: textColor,
            background: `${labelColor}18`,
            border: `1.5px solid ${labelColor}88`,
            borderRadius: 7,
            padding: '4px 8px',
            minWidth: 28,
            textAlign: 'center',
            boxShadow: `0 0 10px ${labelColor}22`,
          }}>{fmtVal(v)}</span>
          {!isQueue && <span style={{ fontSize: 9, color: `${mutedColor}88`, marginTop: 3 }}>{i}</span>}
        </div>
      ))}
      {arr.length > 12 && <span style={{ fontSize: 9, color: mutedColor, alignSelf: 'center' }}>+{arr.length - 12}</span>}
    </div>
  )
}

function MatrixAxisLabel({ children, mutedColor, align = 'center' }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'right' ? 'flex-end' : 'center',
        paddingRight: align === 'right' ? 8 : 0,
        fontSize: 10,
        fontWeight: 700,
        color: mutedColor,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  )
}

function MatrixCell({ value, textColor, mutedColor, labelColor }) {
  const isTrue = value === true
  const isFalse = value === false
  const display = isTrue ? 'T' : isFalse ? 'F' : value === undefined ? '' : fmtVal(value)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${mutedColor}55`,
        background: isTrue ? 'rgba(34,197,94,0.13)' : 'rgba(148,163,184,0.08)',
        color: isTrue ? '#16a34a' : isFalse ? textColor : mutedColor,
        fontSize: 12,
        fontWeight: 800,
        boxShadow: isTrue ? `inset 0 0 0 1px ${labelColor}33` : 'none',
      }}
    >
      {display}
    </div>
  )
}

function getMatrixRowLabel(index) {
  if (index === 0) return 'i=0'
  return `i=${index}`
}

// ─── Module-level stable node types map ───────────────────────────────────

const NODE_TYPES = { glassNode: GlassNode, nullNode: NullNode, cardNode: CardNode }

// ─── Main export ───────────────────────────────────────────────────────────

/**
 * VisualizerView: single ReactFlowProvider always mounted.
 * All data structures render as persistent canvas nodes.
 */
export default function VisualizerView({ theme, fallbackStructures = [] }) {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 260 }}>
      <GraphCanvas theme={theme} fallbackStructures={fallbackStructures} />
    </div>
  )
}

// ─── Graph canvas (always mounted) ────────────────────────────────────────

function GraphCanvasInner({ theme, fallbackStructures }) {
  const nodes          = useGraphStore(s => s.nodes)
  const edges          = useGraphStore(s => s.edges)
  const onNodesChange  = useGraphStore(s => s.onNodesChange)
  const selectedVariable = useSelectionStore(s => s.selectedVariable)
  const setSelectedVariable = useSelectionStore(s => s.setSelectedVariable)
  const { fitView, fitBounds } = useReactFlow()
  const [ready, setReady] = useState(false)
  const [didInitialFit, setDidInitialFit] = useState(false)
  const liveFlow = useMemo(
    () => buildLiveFlowFromStructures(fallbackStructures),
    [fallbackStructures]
  )
  const useLiveFlow = liveFlow.nodes.length > 0
  const renderNodes = useLiveFlow ? liveFlow.nodes : nodes
  const renderEdges = useLiveFlow ? liveFlow.edges : edges

  // ── Stable refs so selection effect never has stale closures ─────────────
  // useLayoutEffect runs synchronously after DOM mutations, before paint,
  // so these refs are always up-to-date when any useEffect fires.
  const fitBoundsRef   = useRef(fitBounds)
  const fitViewRef     = useRef(fitView)
  const renderNodesRef = useRef(renderNodes)
  useLayoutEffect(() => { fitBoundsRef.current   = fitBounds   })
  useLayoutEffect(() => { fitViewRef.current     = fitView     })
  useLayoutEffect(() => { renderNodesRef.current = renderNodes })

  // Mark ready after first paint
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Fit once when the first visual nodes appear. After that, preserve the
  // user's zoom/pan across step changes.
  useEffect(() => {
    if (!ready || renderNodes.length === 0 || didInitialFit) return
    const id1 = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => {
        fitViewRef.current({ padding: 0.2, duration: 300 })
        setDidInitialFit(true)
      })
      return () => cancelAnimationFrame(id2)
    })
    return () => cancelAnimationFrame(id1)
  }, [renderNodes.length, ready, didInitialFit])

  // ── Focus selected variable ───────────────────────────────────────────────
  // Depends ONLY on selectedVariable + ready.
  // renderNodes and fitBounds are read from stable refs, so this effect is
  // never re-triggered by routine re-renders / step changes.
  useEffect(() => {
    if (!ready || !selectedVariable) return

    const nodes = renderNodesRef.current
    if (!nodes || nodes.length === 0) return

    const targetNode = nodes.find(n => getNodeVariableName(n) === selectedVariable)
    if (!targetNode?.position) return

    const bounds = getNodeFocusBounds(targetNode)
    const frameId = requestAnimationFrame(() => {
      fitBoundsRef.current?.(bounds, { padding: 0.35, duration: 360 })
    })
    return () => cancelAnimationFrame(frameId)
  }, [selectedVariable, ready])

  // Inject theme tokens into glassNode data
  const themedNodes = useMemo(() => renderNodes.map(n => {
    const isLightTheme = theme.id === 'cupertino'
    if (n.type !== 'glassNode' && n.type !== 'cardNode') return n
    return {
      ...n,
      data: {
        ...n.data,
        isSelected: getNodeVariableName(n) === selectedVariable,
        graphText: isLightTheme ? '#1f2937' : '#e2e8f0',
        graphMuted: isLightTheme ? '#64748b' : '#94a3b8',
        graphCardBg: isLightTheme ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.05)',
        graphCardActiveBg: isLightTheme ? 'rgba(239,246,255,0.96)' : 'rgba(255,255,255,0.10)',
        activeColor: theme.graphActive    ?? 'rgba(74,222,128,0.85)',
        activeBg:    theme.graphActiveBg  ?? 'rgba(74,222,128,0.18)',
        activeGlow:  theme.graphGlow      ?? 'rgba(74,222,128,0.5)',
        activeTxt:   theme.graphActiveTxt ?? '#4ade80',
      },
    }
  }), [renderNodes, theme, selectedVariable])

  return (
    <div
      style={{ width: '100%', height: '100%', minHeight: 260, position: 'relative' }}
      className={`rounded-xl border border-white/10 ${theme.sidebarBg}`}
    >
      <ReactFlow
        nodes={themedNodes}
        edges={renderEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={useLiveFlow ? undefined : onNodesChange}
        onNodeClick={(_, node) => {
          const nodeName = node.data?.name ?? node.data?.varName
          if (nodeName) setSelectedVariable(nodeName)
        }}
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={true}
        zoomOnPinch={true}
        panOnScroll={false}
        panOnDrag={true}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent', width: '100%', height: '100%' }}
      >
        <Background
          color={theme.graphBgDot ?? '#334155'}
          gap={20}
          size={1}
          variant="dots"
        />
      </ReactFlow>

      {themedNodes.length > 0 && (
        <button
          type="button"
          onClick={() => {
            fitView({ padding: 0.2, duration: 300 })
            setDidInitialFit(true)
          }}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 20,
            border: '1px solid rgba(148,163,184,0.32)',
            borderRadius: 999,
            padding: '5px 10px',
            fontSize: 11,
            fontWeight: 700,
            color: '#e2e8f0',
            background: 'rgba(15,23,42,0.72)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.22)',
            cursor: 'pointer',
          }}
          title="缩放并平移到完整视图"
        >
          Fit View
        </button>
      )}

      {themedNodes.length === 0 && fallbackStructures.length > 0 && (
        <FallbackCanvas structures={fallbackStructures} theme={theme} />
      )}
    </div>
  )
}

function GraphCanvas({ theme, fallbackStructures }) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner theme={theme} fallbackStructures={fallbackStructures} />
    </ReactFlowProvider>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const INF_SENTINEL  =  1_000_000_000
const NINF_SENTINEL = -1_000_000_000

function fmtVal(v) {
  if (v === null)      return 'null'
  if (v === undefined) return 'undef'
  if (typeof v === 'string')  return `"${v}"`
  if (typeof v === 'object')  return Array.isArray(v) ? `[…${v.length}]` : '{…}'
  if (typeof v === 'number') {
    if (v === Infinity  || v >= INF_SENTINEL)  return '∞'
    if (v === -Infinity || v <= NINF_SENTINEL) return '-∞'
  }
  return String(v)
}

function FallbackCanvas({ structures, theme }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'auto',
        padding: 10,
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {structures.slice(0, 40).map((s, i) => (
          <div
            key={`${s.name}-${i}`}
            style={{
              pointerEvents: 'auto',
              minWidth: 120,
              maxWidth: 280,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
              padding: '6px 8px',
              fontFamily: 'monospace',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>{s.name}</span>
              <span style={{ fontSize: 9, color: '#94a3b8' }}>{String(s.type).toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 11, color: '#cbd5e1' }}>
              {fmtVal(s.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function buildLiveFlowFromStructures(structures) {
  if (!Array.isArray(structures) || structures.length === 0) {
    return { nodes: [], edges: [] }
  }

  const nodes = []
  const edges = []
  const seen = new Set()

  let listRow = 0
  let treeRow = 0
  const cardTypes = new Set(['array', 'stack', 'queue', 'matrix', 'object', 'primitive'])
  const cards = []

  for (const s of structures) {
    if (s.type === 'linkedlist') {
      let cur = s.value
      let x = 40
      const y = 40 + listRow * 120
      let guard = 0
      while (cur && typeof cur === 'object' && cur.__id__ && guard < 80) {
        const id = cur.__id__
        if (!seen.has(id)) {
          seen.add(id)
          nodes.push({
            id,
            type: 'glassNode',
            data: { kind: 'pointer', label: getPointerVal(cur), varName: s.name, isActive: true },
            position: { x, y },
          })
        }
        if (cur.next && typeof cur.next === 'object' && cur.next.__id__) {
          edges.push(makeEdge(id, cur.next.__id__, 'next'))
        }
        cur = cur.next
        x += 160
        guard++
      }
      listRow++
    } else if (s.type === 'tree') {
      const rootY = 40 + treeRow * 220
      const visited = new Set()
      const placeTree = (node, x, y, spread) => {
        if (!node || typeof node !== 'object' || !node.__id__ || visited.has(node.__id__)) return
        visited.add(node.__id__)
        if (!seen.has(node.__id__)) {
          seen.add(node.__id__)
          nodes.push({
            id: node.__id__,
            type: 'glassNode',
            data: { kind: 'pointer', label: getPointerVal(node), varName: s.name, isActive: true },
            position: { x, y },
          })
        }
        if (node.left && typeof node.left === 'object' && node.left.__id__) {
          edges.push(makeEdge(node.__id__, node.left.__id__, 'left'))
          placeTree(node.left, x - spread, y + 100, Math.max(spread / 2, 45))
        }
        if (node.right && typeof node.right === 'object' && node.right.__id__) {
          edges.push(makeEdge(node.__id__, node.right.__id__, 'right'))
          placeTree(node.right, x + spread, y + 100, Math.max(spread / 2, 45))
        }
      }
      placeTree(s.value, 320 + treeRow * 100, rootY, 140)
      treeRow++
    } else if (cardTypes.has(s.type)) {
      cards.push(s)
    }
  }

  // Render non-pointer structures as persistent-like cards. Cards are laid out
  // with estimated dimensions so wide arrays wrap instead of covering neighbors.
  let cx = 40
  let cy = Math.max(
    120,
    nodes.reduce((m, n) => Math.max(m, (n.position?.y ?? 0) + 120), 0)
  )
  let rowHeight = 0
  const rowStartX = 40
  const maxRowWidth = 900
  const baseY = Math.max(
    120,
    nodes.reduce((m, n) => Math.max(m, (n.position?.y ?? 0) + 120), 0)
  )
  for (const s of cards) {
    const size = estimateCardSize(s)
    if (cx > rowStartX && cx + size.width > rowStartX + maxRowWidth) {
      cx = rowStartX
      cy += rowHeight + 36
      rowHeight = 0
    }

    nodes.push({
      id: `live_card__${s.name}`,
      type: 'cardNode',
      data: {
        kind: 'card',
        structType: s.type,
        name: s.name,
        value: s.value,
        meta: s.meta ?? null,
        isActive: true,
        cardWidth: size.width,
        cardHeight: size.height,
      },
      position: { x: cx, y: cy || baseY },
    })
    cx += size.width + 36
    rowHeight = Math.max(rowHeight, size.height)
  }

  return { nodes, edges }
}

function getPointerVal(node) {
  if (!node || typeof node !== 'object') return '?'
  if (node.val !== undefined) return String(node.val)
  if (node.value !== undefined) return String(node.value)
  return '?'
}

function estimateCardSize(structure) {
  if (!structure) return { width: 180, height: 110 }

  if (structure.type === 'array' || structure.type === 'queue') {
    const len = Array.isArray(structure.value) ? structure.value.length : 0
    const columns = Math.max(1, Math.min(len, 6))
    const rows = Math.max(1, Math.ceil(Math.min(len, 12) / 6))
    return {
      width: clamp(150, columns * 44 + 44, 340),
      height: 76 + rows * 48,
    }
  }

  if (structure.type === 'stack') {
    const len = Array.isArray(structure.value) ? structure.value.length : 0
    return { width: 180, height: 72 + Math.min(len, 8) * 30 }
  }

  if (structure.type === 'matrix') {
    const rows = Array.isArray(structure.value) ? structure.value.length : 0
    const cols = Array.isArray(structure.value?.[0]) ? structure.value[0].length : 0
    const visibleCols = Math.min(cols, 12)
    const visibleRows = Math.min(rows, 8)
    return {
      width: clamp(260, 54 + visibleCols * 34 + 44, 560),
      height: 92 + visibleRows * 34,
    }
  }

  if (structure.type === 'object') return { width: 220, height: 150 }
  if (structure.type === 'primitive') return { width: 170, height: 90 }
  return { width: 190, height: 110 }
}

function clamp(min, value, max) {
  return Math.max(min, Math.min(value, max))
}

function getNodeVariableName(node) {
  if (!node) return null
  if (node.data?.name) return node.data.name
  if (node.data?.varName) return node.data.varName
  if (typeof node.id === 'string' && node.id.startsWith('live_card__')) {
    return node.id.replace(/^live_card__/, '')
  }
  if (typeof node.id === 'string' && node.id.startsWith('card__')) {
    return node.id.replace(/^card__/, '')
  }
  return null
}

function getNodeFocusBounds(node) {
  const width = node.width ?? node.data?.cardWidth ?? (node.type === 'cardNode' ? 240 : 110)
  const height = node.height ?? node.data?.cardHeight ?? (node.type === 'cardNode' ? 140 : 90)
  return {
    x: (node.position?.x ?? 0) - 40,
    y: (node.position?.y ?? 0) - 40,
    width: width + 80,
    height: height + 80,
  }
}

function makeEdge(source, target, label) {
  return {
    id: `live_${source}_${label}_${target}`,
    source,
    target,
    label,
    type: 'smoothstep',
    animated: true,
    markerEnd: { type: 'arrowclosed', color: '#38bdf8' },
    style: { stroke: '#38bdf8', strokeWidth: 2 },
    labelStyle: { fontSize: 10, fill: '#cbd5e1', fontWeight: 700 },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 6,
    labelBgStyle: { fill: 'rgba(15,23,42,0.85)', fillOpacity: 0.9 },
  }
}
