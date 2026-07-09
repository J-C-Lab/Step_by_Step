/**
 * VisualizerAdapter (v2)
 *
 * Converts two consecutive timeline snapshots (current + previous) into
 * structured semantic data for VisualizerView to render.
 *
 * Detection priority per variable:
 *  1. isLinkedList(value)                     → type: "linkedlist"
 *  2. isTree(value)                           → type: "tree"
 *  3. Array.isArray(value)
 *       + diff vs previous → stack behaviour  → type: "stack",  meta: { op }
 *       + diff vs previous → queue behaviour  → type: "queue",  meta: { op }
 *       + otherwise                           → type: "array"
 *  4. typeof value === "object" (non-null)    → type: "object"
 *  5. primitive                               → type: "primitive"
 *
 * Stack heuristic (LIFO, based purely on diff — NOT variable name):
 *   push: curr.length === prev.length + 1  AND  prev elements are a prefix of curr
 *   pop:  curr.length === prev.length - 1  AND  curr elements are a prefix of prev
 *
 * Queue heuristic (FIFO, based purely on diff — NOT variable name):
 *   shift: curr.length === prev.length - 1  AND  first element differs (front dequeue)
 *   enqueue: curr.length === prev.length + 1 AND last element added (rear enqueue)
 *
 * Input:
 *   currentSnap  — timeline snapshot ({ variables, ... })
 *   previousSnap — previous snapshot, or null for step 0
 *
 * Output:
 *   { structures: Array<StructureItem> }
 *
 * StructureItem:
 *   { type: string, name: string, value: any, meta?: object }
 */

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * @param {{ variables: Object }} currentSnap
 * @param {{ variables: Object } | null} previousSnap
 * @returns {{ structures: Array }}
 */
export function buildVisualizerState(currentSnap, previousSnap) {
  const curr = currentSnap?.variables ?? {}
  const prev = previousSnap?.variables ?? {}

  const structures = Object.entries(curr).map(([name, value]) => {
    const prevValue = prev[name]
    return detectStructure(name, value, prevValue)
  })

  return { structures: filterRenderStructures(structures) }
}

/** Walker vars are used for current-node highlight only — not separate tree renders. */
const WALKER_POINTER_NAMES = new Set([
  'node', 'cur', 'current', 'p', 'ptr', 'temp', 'prev', 'walker', 'now', 'next',
])

const CANONICAL_TREE_NAMES = new Set(['root', 'tree'])

function isWalkerPointerName(name) {
  return WALKER_POINTER_NAMES.has(String(name ?? '').toLowerCase())
}

function countTreeNodes(root) {
  if (!root || typeof root !== 'object') return 0
  let count = 0
  const visited = new Set()
  const stack = [root]
  let guard = 0
  while (stack.length > 0 && guard < 600) {
    const node = stack.pop()
    guard++
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue
    if (!node.__id__ || visited.has(node.__id__)) continue
    visited.add(node.__id__)
    count++
    stack.push(node.left, node.right, node.next)
  }
  return count
}

/** 'real' = interpreter objects; 'synthetic' = arrtree_/nodepool_ fallback graphs. */
function classifyTreeIdKind(root) {
  if (!root || typeof root !== 'object') return 'synthetic'
  let hasReal = false
  let hasSynthetic = false
  const visited = new Set()
  const stack = [root]
  let guard = 0

  while (stack.length > 0 && guard < 600) {
    const node = stack.pop()
    guard++
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue
    if (!node.__id__ || visited.has(node.__id__)) continue
    visited.add(node.__id__)
    if (String(node.__id__).startsWith('arrtree_') || String(node.__id__).startsWith('nodepool_')) {
      hasSynthetic = true
    } else {
      hasReal = true
    }
    stack.push(node.left, node.right, node.next)
  }

  if (hasReal) return 'real'
  if (hasSynthetic) return 'synthetic'
  return 'synthetic'
}

/**
 * Keep a single connected tree on canvas. Drop duplicate synthetic trees,
 * walker pointer subtrees, and redundant level-order array trees when a
 * real TreeNode root is already available.
 */
function filterRenderStructures(structures) {
  if (!Array.isArray(structures) || structures.length === 0) return structures

  const trees = structures.filter(s => s.type === 'tree')
  if (trees.length === 0) return structures

  const hasRealTree = trees.some(s => classifyTreeIdKind(s.value) === 'real')
  const nonWalkerTrees = trees.filter(s => !isWalkerPointerName(s.name))

  let keptTrees = (nonWalkerTrees.length > 0 ? nonWalkerTrees : trees).filter(s => {
    if (hasRealTree && classifyTreeIdKind(s.value) === 'synthetic') return false
    return true
  })

  if (keptTrees.length > 1) {
    const canonical = keptTrees.filter(s => CANONICAL_TREE_NAMES.has(String(s.name).toLowerCase()))
    const pool = canonical.length > 0 ? canonical : keptTrees
    keptTrees = [...pool].sort((a, b) => countTreeNodes(b.value) - countTreeNodes(a.value)).slice(0, 1)
  }

  const hasCanonicalTree = keptTrees.some(s => CANONICAL_TREE_NAMES.has(String(s.name).toLowerCase()))

  const others = structures.filter(s => {
    if (s.type === 'tree') return false
    if (
      hasCanonicalTree &&
      s.type === 'array' &&
      isLikelyTreeVariableName(s.name) &&
      looksLikeLevelOrderTreeArray(s.name, s.value)
    ) {
      return false
    }
    return true
  })

  return [...others, ...keptTrees]
}

/** Names that commonly hold the "current" pointer during tree/list traversal. */
const WALKER_NAME_PRIORITY = [
  'node', 'cur', 'current', 'p', 'ptr', 'temp', 'walker', 'now', 'head', 'root',
]

/**
 * Resolve which graph node ids represent the algorithm's current pointer(s).
 * Uses walker variable names first, then falls back to pointer identity changes
 * between consecutive snapshots.
 *
 * @param {Record<string, any>} variables
 * @param {Record<string, any> | null} [prevVariables]
 * @returns {Set<string>}
 */
export function resolveActivePointerIds(variables, prevVariables = null) {
  const vars = variables ?? {}
  const candidates = []

  for (const [name, value] of Object.entries(vars)) {
    if (!value || typeof value !== 'object' || !value.__id__) continue
    if (!isTree(value) && !isLinkedList(value)) continue

    const lower = name.toLowerCase()
    const priority = WALKER_NAME_PRIORITY.indexOf(lower)
    candidates.push({
      name,
      id: value.__id__,
      priority: priority >= 0 ? priority : 100 + lower.charCodeAt(0),
    })
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
    const best = candidates[0].priority
    const ids = new Set()
    for (const c of candidates) {
      if (c.priority === best) ids.add(c.id)
      else break
    }
    return ids
  }

  if (prevVariables) {
    const changed = new Set()
    for (const [name, value] of Object.entries(vars)) {
      const prevVal = prevVariables[name]
      if (!value?.__id__ || (!isTree(value) && !isLinkedList(value))) continue
      if (prevVal?.__id__ !== value.__id__) changed.add(value.__id__)
    }
    return changed
  }

  return new Set()
}

let anonListIdCounter = 0

// ─── Structure detectors ───────────────────────────────────────────────────

function detectStructure(name, value, prevValue) {
  // 1. Linked list node
  if (isLinkedList(value)) {
    return { type: 'linkedlist', name, value }
  }

  // 2. Flattened tree (right-chain) shown as linked list
  if (isTree(value) && isRightChainTree(value)) {
    return { type: 'linkedlist', name, value: rightChainTreeToLinkedList(value) }
  }

  // 3. Binary tree node
  if (isTree(value)) {
    return { type: 'tree', name, value }
  }

  // 4. Array with diff-based classification
  if (Array.isArray(value)) {
    // Tree node pool in builder helpers, e.g. "nodes = [TreeNode, TreeNode, ...]"
    if (looksLikeTreeNodeObjectArray(name, value)) {
      return {
        type: 'tree',
        name,
        value: buildTreeFromNodePool(value, name),
      }
    }

    // Level-order tree input like: root = [1,2,3,null,4]
    if (looksLikeLevelOrderTreeArray(name, value)) {
      return {
        type: 'tree',
        name,
        value: buildTreeFromLevelOrderArray(value, name),
      }
    }

    // 4a. 2-D matrix: array where every element is also an array
    if (value.length > 0 && value.every(row => Array.isArray(row))) {
      return { type: 'matrix', name, value }
    }

    const prevArr = Array.isArray(prevValue) ? prevValue : null
    const stackOp = prevArr !== null ? detectStackOp(prevArr, value) : null
    const queueOp = prevArr !== null && !stackOp ? detectQueueOp(prevArr, value) : null

    if (stackOp) return { type: 'stack', name, value, meta: { op: stackOp } }
    if (queueOp) return { type: 'queue', name, value, meta: { op: queueOp } }
    return { type: 'array', name, value }
  }

  // 5. Plain object
  if (value !== null && typeof value === 'object') {
    return { type: 'object', name, value }
  }

  // 6. Primitive
  return { type: 'primitive', name, value }
}

/**
 * Returns "push" | "pop" | null
 * Stack = mutations always happen at the tail (LIFO).
 */
function detectStackOp(prev, curr) {
  // push: curr is prev + one element appended at the end
  if (curr.length === prev.length + 1) {
    const isPrefixMatch = prev.every((v, i) => jsonEq(v, curr[i]))
    if (isPrefixMatch) return 'push'
  }
  // pop: prev is curr + one element at the end
  if (curr.length === prev.length - 1) {
    const isPrefixMatch = curr.every((v, i) => jsonEq(v, prev[i]))
    if (isPrefixMatch) return 'pop'
  }
  return null
}

/**
 * Returns "shift" | "enqueue" | null
 * Queue = mutations happen at the front (shift) or rear (enqueue).
 */
function detectQueueOp(prev, curr) {
  // shift: one element removed from the front
  if (curr.length === prev.length - 1) {
    const frontChanged = !jsonEq(prev[0], curr[0])
    if (frontChanged) {
      // verify the rest of curr matches prev[1..]
      const restMatch = curr.every((v, i) => jsonEq(v, prev[i + 1]))
      if (restMatch) return 'shift'
    }
  }
  // enqueue: one element appended at the rear
  if (curr.length === prev.length + 1) {
    const prevIsPrefix = prev.every((v, i) => jsonEq(v, curr[i]))
    // but the stack check already caught this pattern when element added at tail —
    // to distinguish, we rely on the queue heuristic only when a prior shift was seen
    // (i.e., the variable has already been classified as queue at least once).
    // For first occurrence we prefer "array" over misidentifying as queue.
    if (prevIsPrefix) return 'enqueue'
  }
  return null
}

// ─── Type predicates ───────────────────────────────────────────────────────

/**
 * Linked list node: { val, next } or { value, next }
 * next can be null (end of list) or another node object.
 */
function isLinkedList(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false
  const keys = Object.keys(node)
  const hasVal = keys.includes('val') || keys.includes('value')
  const hasNext = keys.includes('next')
  return hasVal && hasNext
}

/**
 * Binary tree node: { val, left, right } or { value, left, right }
 */
function isTree(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false
  const keys = Object.keys(node)
  const hasVal = keys.includes('val') || keys.includes('value')
  const hasLeft = keys.includes('left')
  const hasRight = keys.includes('right')
  return hasVal && hasLeft && hasRight
}

function isRightChainTree(root) {
  if (!root || typeof root !== 'object' || Array.isArray(root)) return false
  let cur = root
  let count = 0
  const visited = new Set()

  while (cur && typeof cur === 'object') {
    if (Array.isArray(cur)) return false
    const id = cur.__id__ || `noid_${count}`
    if (visited.has(id)) return false
    visited.add(id)
    count++

    if (cur.left && typeof cur.left === 'object') return false
    const next = cur.right
    if (!next) break
    if (typeof next !== 'object' || Array.isArray(next)) return false
    cur = next
  }

  return count >= 2
}

function rightChainTreeToLinkedList(root) {
  if (!root || typeof root !== 'object') return root
  const visited = new Map()

  const clone = node => {
    if (!node || typeof node !== 'object') return null
    const id = node.__id__ || `list_anon_${++anonListIdCounter}`
    if (visited.has(id)) return visited.get(id)
    const val = node.val !== undefined ? node.val : node.value
    const listNode = { __id__: id, val, next: null }
    visited.set(id, listNode)
    listNode.next = clone(node.right)
    return listNode
  }

  return clone(root)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function jsonEq(a, b) {
  if (a === b) return true
  try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false }
}

function looksLikeLevelOrderTreeArray(name, arr) {
  if (!Array.isArray(arr) || arr.length < 3) return false
  if (arr.some(item => Array.isArray(item))) return false
  if (!isLikelyTreeVariableName(name)) return false

  const allSimple = arr.every(item =>
    item == null || ['number', 'string', 'boolean'].includes(typeof item)
  )
  if (!allSimple) return false

  const hasNullHole = arr.some(item => item == null)
  return hasNullHole || arr.length >= 7
}

function isLikelyTreeVariableName(name) {
  return /(^root$)|tree|node/i.test(String(name ?? ''))
}

function buildTreeFromLevelOrderArray(arr, varName) {
  if (!arr || arr.length === 0 || arr[0] == null) return null

  const cleanName = String(varName ?? 'root').replace(/[^\w$]/g, '_')
  const nodes = arr.map((val, idx) => {
    if (val == null) return null
    return {
      __id__: `arrtree_${cleanName}_${idx}`,
      val,
      left: null,
      right: null,
    }
  })

  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i]) continue
    const li = 2 * i + 1
    const ri = 2 * i + 2
    nodes[i].left = li < nodes.length ? nodes[li] : null
    nodes[i].right = ri < nodes.length ? nodes[ri] : null
  }

  return nodes[0]
}

function looksLikeTreeNodeObjectArray(name, arr) {
  if (!Array.isArray(arr) || arr.length < 3) return false
  if (!isLikelyTreeVariableName(name)) return false

  let objCount = 0
  for (const item of arr) {
    if (item == null) continue
    if (typeof item !== 'object' || Array.isArray(item)) return false
    const keys = Object.keys(item)
    const hasVal = keys.includes('val') || keys.includes('value')
    const hasChildFields = keys.includes('left') || keys.includes('right')
    if (!hasVal || !hasChildFields) return false
    objCount++
  }

  return objCount >= 2
}

function buildTreeFromNodePool(arr, varName) {
  const cleanName = String(varName ?? 'nodes').replace(/[^\w$]/g, '_')
  const nodes = arr.map((item, idx) => {
    if (!item || typeof item !== 'object') return null
    const val = item.val !== undefined ? item.val : item.value
    return {
      __id__: `nodepool_${cleanName}_${idx}`,
      val,
      left: null,
      right: null,
    }
  })

  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i]) continue
    const li = 2 * i + 1
    const ri = 2 * i + 2
    nodes[i].left = li < nodes.length ? nodes[li] : null
    nodes[i].right = ri < nodes.length ? nodes[ri] : null
  }

  return nodes[0]
}

// ─── Flow converters (used by VisualizerView) ──────────────────────────────

/**
 * Convert a linked list head node to React Flow nodes + edges.
 * Guards against circular references with a max-node limit.
 */
export function listToFlow(head) {
  const nodes = []
  const edges = []
  const MAX = 30
  let current = head
  let i = 0

  while (current && i < MAX) {
    const id = String(i)
    const label = current.val !== undefined ? String(current.val) : String(current.value)

    nodes.push({
      id,
      type: 'glassNode',
      data: { label },
      position: { x: i * 140, y: 0 },
    })

    if (current.next && typeof current.next === 'object') {
      edges.push({
        id: `e${i}-${i + 1}`,
        source: id,
        target: String(i + 1),
        label: 'next',
        type: 'smoothstep',
        markerEnd: { type: 'arrowclosed' },
        style: { strokeWidth: 1.5 },
        labelStyle: { fontSize: 10, fill: '#94a3b8' },
      })
    }

    current = current.next
    i++
  }

  // Append null sentinel node
  nodes.push({
    id: String(i),
    type: 'nullNode',
    data: { label: 'null' },
    position: { x: i * 140, y: 0 },
  })
  if (i > 0) {
    edges.push({
      id: `e${i - 1}-null`,
      source: String(i - 1),
      target: String(i),
      label: 'next',
      type: 'smoothstep',
      markerEnd: { type: 'arrowclosed' },
      style: { strokeWidth: 1.5, strokeDasharray: '4 2' },
      labelStyle: { fontSize: 10, fill: '#94a3b8' },
    })
  }

  return { nodes, edges }
}

/**
 * Convert a binary tree root node to React Flow nodes + edges.
 * Assigns each node an id before recursing so edge targets are always valid.
 */
export function treeToFlow(root) {
  const nodes = []
  const edges = []
  let idCounter = 0

  function traverse(node, x, y, spread) {
    if (!node || typeof node !== 'object') return null

    // Assign this node's id immediately
    const id = String(idCounter++)
    const label = node.val !== undefined ? String(node.val) : String(node.value)

    nodes.push({
      id,
      type: 'glassNode',
      data: { label },
      position: { x, y },
    })

    // Recurse left — child will receive the next available id (idCounter at this moment)
    if (node.left && typeof node.left === 'object') {
      const leftId = String(idCounter) // peek: this is what traverse will assign
      traverse(node.left, x - spread, y + 90, Math.max(spread / 2, 30))
      edges.push({
        id: `e${id}-L`,
        source: id,
        target: leftId,
        label: 'left',
        type: 'smoothstep',
        markerEnd: { type: 'arrowclosed' },
        style: { strokeWidth: 1.5 },
        labelStyle: { fontSize: 10, fill: '#94a3b8' },
      })
    }

    // Recurse right
    if (node.right && typeof node.right === 'object') {
      const rightId = String(idCounter) // peek again after left subtree consumed ids
      traverse(node.right, x + spread, y + 90, Math.max(spread / 2, 30))
      edges.push({
        id: `e${id}-R`,
        source: id,
        target: rightId,
        label: 'right',
        type: 'smoothstep',
        markerEnd: { type: 'arrowclosed' },
        style: { strokeWidth: 1.5 },
        labelStyle: { fontSize: 10, fill: '#94a3b8' },
      })
    }

    return id
  }

  traverse(root, 200, 20, 130)
  return { nodes, edges }
}
