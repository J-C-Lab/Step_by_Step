/**
 * GraphStore (Zustand)
 *
 * Single source of truth for the React Flow canvas.
 * Implements "incremental / heap-persistent" graph updates for ALL
 * data structure types: tree, linkedlist, array, stack, queue, object, primitive.
 *
 * Node lifecycle:
 *   - Nodes are NEVER deleted once created (simulates heap memory).
 *   - On each step, existing nodes are updated in-place; new nodes are appended.
 *   - Nodes that were just created or whose value changed are marked isActive=true.
 *   - isActive is cleared after ACTIVE_TTL steps.
 *
 * Node types on canvas:
 *   - tree / linkedlist  → individual GlassNodes per object, connected by edges
 *   - array / stack / queue / matrix (2D-array) → one "card" node per variable
 *   - object / primitive → one "card" node per variable
 *
 * Consumed by: VisualizerView.
 * Updated by:  Visualizer.jsx on every snap change.
 */

import { create } from 'zustand'

const ACTIVE_TTL = 2   // steps before highlight fades

// ─── Layout constants ──────────────────────────────────────────────────────
const LIST_X_STEP    = 160
const TREE_Y_STEP    = 110
const TREE_X_SPREAD  = 150
// Card nodes (array / stack / queue / object / primitive) layout
const CARD_X_STEP    = 220
const CARD_Y_START   = 0
const CARD_START_X   = 20

// ─── Store ─────────────────────────────────────────────────────────────────

const useGraphStore = create((set, get) => ({
  /** @type {import('reactflow').Node[]} */
  nodes: [],
  /** @type {import('reactflow').Edge[]} */
  edges: [],
  /** Internal metadata keyed by node id */
  _meta: {},          // { [id]: { activeSince: stepIndex } }
  /** Current global step counter */
  _step: 0,

  /**
   * Main update entry point.
   * Called by Visualizer.jsx after each timeline step change.
   *
   * @param {Array<{type,name,value,meta?}>} structures  Output of buildVisualizerState
   * @param {number} stepIndex
   * @param {Set<string>} [activePointerIds]  Node ids for current algorithm pointer
   */
  updateGraph(structures, stepIndex, activePointerIds = new Set()) {
    if (!structures || structures.length === 0) return

    const state     = get()
    const prevNodes = state.nodes
    const prevMeta  = state._meta

    // ── 1. Collect graph-able pointer objects (tree/linkedlist) ──────────
    const objectMap = new Map()   // __id__ → { value, varName, type }
    for (const s of structures) {
      if (s.type === 'tree' || s.type === 'linkedlist') {
        collectObjects(s.value, objectMap, s.name, s.type)
      }
    }

    // ── 2. Assign / reuse positions for pointer nodes ────────────────────
    const positionMap = objectMap.size > 0
      ? assignPointerPositions(objectMap, prevNodes)
      : new Map()

    // ── 3. Build updated nodes array (incremental merge) ─────────────────
    const newMeta      = { ...prevMeta }
    const existingIds  = new Set(prevNodes.map(n => n.id))
    const updatedNodes = [...prevNodes]

    // -- 3a. Pointer nodes (tree / linkedlist) ----------------------------
    let fallbackX = computeMaxX(prevNodes) + 40
    for (const [id, info] of objectMap.entries()) {
      const label        = getPointerLabel(info.value)
      const isNew        = !existingIds.has(id)
      const prevNode     = prevNodes.find(n => n.id === id)
      const valueChanged = prevNode && prevNode.data.rawLabel !== label

      if (isNew || valueChanged) newMeta[id] = { activeSince: stepIndex }

      const isActive = newMeta[id]
        ? (stepIndex - newMeta[id].activeSince) < ACTIVE_TTL
        : false
      const isCurrent = activePointerIds instanceof Set && activePointerIds.has(id)

      const nodeData = {
        kind: 'pointer',
        pointerType: info.type,
        label,
        rawLabel: label,
        isActive,
        isCurrent,
        varName: isNew ? info.varName : (prevNode?.data.varName ?? info.varName),
      }

      if (isNew) {
        let pos = positionMap.get(id)
        if (!pos) { pos = { x: fallbackX, y: 20 }; fallbackX += 160 }
        updatedNodes.push({ id, type: 'glassNode', data: nodeData, position: pos })
        existingIds.add(id)
      } else {
        const idx = updatedNodes.findIndex(n => n.id === id)
        if (idx !== -1) updatedNodes[idx] = { ...updatedNodes[idx], data: nodeData }
      }
    }

    // Refresh isActive / isCurrent for pointer nodes NOT in current objectMap (TTL decay)
    for (let i = 0; i < updatedNodes.length; i++) {
      const n = updatedNodes[i]
      if (n.data.kind === 'pointer' && !objectMap.has(n.id)) {
        const meta     = newMeta[n.id]
        const isActive = meta ? (stepIndex - meta.activeSince) < ACTIVE_TTL : false
        const isCurrent = activePointerIds instanceof Set && activePointerIds.has(n.id)
        if (n.data.isActive !== isActive || n.data.isCurrent !== isCurrent) {
          updatedNodes[i] = { ...n, data: { ...n.data, isActive, isCurrent } }
        }
      }
    }

    // -- 3b. Card nodes (array / stack / queue / matrix / object / primitive)
    // Each variable gets a stable id: "card__<varName>"
    // We layout them in a row below the pointer section
    const graphMaxY = updatedNodes
      .filter(n => n.data.kind === 'pointer')
      .reduce((m, n) => Math.max(m, (n.position?.y ?? 0) + 80), 0)
    const cardY = graphMaxY > 0 ? graphMaxY + 80 : CARD_Y_START

    const cardTypes = new Set(['array', 'stack', 'queue', 'matrix', 'object', 'primitive'])
    const cardStructures = structures.filter(s => cardTypes.has(s.type))

    // Compute x start to not overlap with pointer nodes
    let cardX = CARD_START_X

    for (const s of cardStructures) {
      const id    = `card__${s.name}`
      const label = getCardLabel(s)
      const isNew = !existingIds.has(id)
      const prevNode     = prevNodes.find(n => n.id === id)
      const valueChanged = prevNode && prevNode.data.rawLabel !== label

      if (isNew || valueChanged) newMeta[id] = { activeSince: stepIndex }

      const isActive = newMeta[id]
        ? (stepIndex - newMeta[id].activeSince) < ACTIVE_TTL
        : false

      const nodeData = {
        kind:      'card',
        structType: s.type,
        name:      s.name,
        value:     s.value,
        meta:      s.meta ?? null,
        label,
        rawLabel:  label,
        isActive,
      }

      if (isNew) {
        updatedNodes.push({
          id,
          type: 'cardNode',
          data: nodeData,
          position: { x: cardX, y: cardY },
        })
        existingIds.add(id)
        cardX += CARD_X_STEP
      } else {
        const idx = updatedNodes.findIndex(n => n.id === id)
        if (idx !== -1) {
          const existingPos = updatedNodes[idx].position
          updatedNodes[idx] = { ...updatedNodes[idx], data: nodeData, position: existingPos }
        }
        cardX += CARD_X_STEP
      }
    }

    // ── 4. Recompute edges (only pointer nodes have edges) ────────────────
    const newEdges = buildEdges(objectMap, updatedNodes)

    set({ nodes: updatedNodes, edges: newEdges, _meta: newMeta, _step: stepIndex })
  },

  /** Full reset — call on interpreter init */
  reset() {
    set({ nodes: [], edges: [], _meta: {}, _step: 0 })
  },

  /** Called by ReactFlow when user drags a node */
  onNodesChange(changes) {
    set(state => ({
      nodes: applyNodeChanges(changes, state.nodes),
    }))
  },
}))

export default useGraphStore

// ─── Helpers ───────────────────────────────────────────────────────────────

function computeMaxX(nodes) {
  return nodes.reduce((m, n) => Math.max(m, (n.position?.x ?? 0) + 100), 0)
}

/**
 * Recursively collect all pointer-objects in a tree/list value.
 */
function collectObjects(node, map, varName, type, visited = new Set()) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return
  const id = node.__id__
  if (!id || visited.has(id)) return
  visited.add(id)
  map.set(id, { value: node, varName, type })

  if (node.next  && typeof node.next  === 'object') collectObjects(node.next,  map, varName, type, visited)
  if (node.left  && typeof node.left  === 'object') collectObjects(node.left,  map, varName, type, visited)
  if (node.right && typeof node.right === 'object') collectObjects(node.right, map, varName, type, visited)
}

/**
 * Assign positions to pointer nodes (tree / linkedlist).
 * Existing nodes keep their current position (user may have dragged them).
 */
function assignPointerPositions(objectMap, prevNodes) {
  const posMap      = new Map()
  const existingPos = new Map(prevNodes.map(n => [n.id, n.position]))

  // Find roots: nodes not pointed to by any other
  const pointed = new Set()
  for (const [, info] of objectMap.entries()) {
    const v = info.value
    if (v.next?.__id__)  pointed.add(v.next.__id__)
    if (v.left?.__id__)  pointed.add(v.left.__id__)
    if (v.right?.__id__) pointed.add(v.right.__id__)
  }

  const roots = [...objectMap.keys()].filter(id => !pointed.has(id))
  let listX = 20
  let treeX = 20

  for (const rootId of roots) {
    const info = objectMap.get(rootId)
    if (!info) continue

    if (info.type === 'linkedlist') {
      let cur = info.value
      let x   = listX
      const visited = new Set()
      while (cur && cur.__id__ && !visited.has(cur.__id__)) {
        visited.add(cur.__id__)
        posMap.set(cur.__id__, existingPos.get(cur.__id__) ?? { x, y: 20 })
        x += LIST_X_STEP
        cur = cur.next
      }
      listX = x + 40
    } else {
      const treeW = countNodes(info.value) * 60
      layoutTree(info.value, treeX + treeW / 2, 20, TREE_X_SPREAD, posMap, existingPos, new Set())
      treeX += treeW + 80
    }
  }

  return posMap
}

function layoutTree(node, x, y, spread, posMap, existingPos, visited) {
  if (!node || typeof node !== 'object' || !node.__id__) return
  if (visited.has(node.__id__)) return
  visited.add(node.__id__)

  posMap.set(node.__id__, existingPos.get(node.__id__) ?? { x, y })

  if (node.left?.__id__)  layoutTree(node.left,  x - spread, y + TREE_Y_STEP, Math.max(spread / 2, 40), posMap, existingPos, visited)
  if (node.right?.__id__) layoutTree(node.right, x + spread, y + TREE_Y_STEP, Math.max(spread / 2, 40), posMap, existingPos, visited)
}

function countNodes(node, visited = new Set()) {
  if (!node || typeof node !== 'object' || !node.__id__) return 0
  if (visited.has(node.__id__)) return 0
  visited.add(node.__id__)
  return 1 + countNodes(node.left, visited) + countNodes(node.right, visited)
}

/**
 * Build edges from objectMap using next/left/right pointer fields.
 */
function buildEdges(objectMap, allNodes) {
  const edges    = []
  const nodeIdSet = new Set(allNodes.map(n => n.id))

  for (const [id, info] of objectMap.entries()) {
    if (!nodeIdSet.has(id)) continue
    const v = info.value

    for (const ptr of ['next', 'left', 'right']) {
      const child = v[ptr]
      if (child && typeof child === 'object' && child.__id__ && nodeIdSet.has(child.__id__)) {
        const isTreeEdge = ptr === 'left' || ptr === 'right'
        edges.push({
          id:    `e-${id}-${ptr}`,
          source: id,
          target: child.__id__,
          label:  isTreeEdge ? '' : ptr,
          type:   isTreeEdge ? 'straight' : 'smoothstep',
          animated: !isTreeEdge,
          markerEnd: isTreeEdge ? undefined : { type: 'arrowclosed' },
          style: isTreeEdge
            ? { stroke: '#0f172a', strokeWidth: 1.6 }
            : { strokeWidth: 1.5 },
          labelStyle:   { fontSize: 10, fill: '#94a3b8' },
          labelBgStyle: { fill: 'transparent' },
        })
      }
    }
  }

  return edges
}

function getPointerLabel(value) {
  const v = value.val !== undefined ? value.val : value.value
  return v !== undefined ? String(v) : '?'
}

function getCardLabel(s) {
  // Stable serialization for change detection (not shown in node)
  try {
    return JSON.stringify(s.value)
  } catch {
    return String(s.value)
  }
}

/**
 * Minimal applyNodeChanges — handles position/select/remove changes.
 */
function applyNodeChanges(changes, nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  for (const change of changes) {
    if (change.type === 'position' && change.id && change.position) {
      const n = nodeMap.get(change.id)
      if (n) nodeMap.set(change.id, { ...n, position: change.position })
    }
    // 'select' / 'dimensions' / 'remove' — ignore (we never delete nodes)
  }
  return [...nodeMap.values()]
}
