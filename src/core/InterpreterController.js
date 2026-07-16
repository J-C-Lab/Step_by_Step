/**
 * InterpreterController
 *
 * Wraps js-interpreter and drives the execution loop.
 * Calls Adapter.capture() after each step and pushes to TimelineStore.
 *
 * Public API:
 *   init(code)  — load new code, reset everything
 *   step()      — execute one step, returns true if more steps remain
 *   runAll()    — run until done or MAX_STEPS
 *   reset()     — tear down interpreter
 */

import Interpreter from 'js-interpreter'
import { capture, resetObjectIds } from './Adapter.js'
import { transformCode } from './codeTransformer.js'
import { prepareCodeForVisualization } from '../utils/codePrep.js'

const MAX_STEPS = 1000

// Store ref is injected at runtime to avoid circular imports
let _storeApi = null

export function injectStore(storeApi) {
  _storeApi = storeApi
}

let _interpreter = null
let _stepCount = 0
let _running = false

function pushDiagnostic(message, level = 'warning') {
  if (!_storeApi?.getState) return
  _storeApi.getState().addDiagnostic?.({
    level,
    message,
    atStep: _stepCount,
  })
}

/** Build initFunc to expose console.log to the interpreter sandbox */
function initFunc(interpreter, globalObject) {
  const consoleObj = interpreter.nativeToPseudo({})
  interpreter.setProperty(
    globalObject,
    'console',
    consoleObj
  )
  interpreter.setProperty(
    consoleObj,
    'log',
    interpreter.createNativeFunction((...args) => {
      // eslint-disable-next-line no-console
      console.log('[sandbox]', ...args.map(a => {
        try { return interpreter.pseudoToNative(a) } catch { return String(a) }
      }))
    })
  )
}

export function init(code) {
  resetObjectIds()
  _storeApi.getState().clearDiagnostics?.()
  const prepared = prepareCodeForVisualization(code)
  for (const msg of prepared.messages ?? []) {
    if (/请书写完整|缺少示例输入|缺少顶层调用|只会执行声明就结束|已尝试自动补全/.test(msg)) {
      pushDiagnostic(msg, 'warning')
    } else if (/检测到|修正|补齐|自动/.test(msg)) {
      pushDiagnostic(msg, 'info')
    }
  }
  const transformed = transformCode(prepared.code)
  _interpreter = new Interpreter(transformed, initFunc)
  _stepCount = 0
  _running = false

  // Capture initial state (step 0)
  const snap = capture(_interpreter, _stepCount)
  _storeApi.getState().resetTimeline([snap])
}

/** Return the source line of the top-most stateStack entry that has loc info. */
function getCurrentLine(interp) {
  const stack = interp.stateStack
  if (!Array.isArray(stack)) return null
  for (let i = stack.length - 1; i >= 0; i--) {
    const line = stack[i]?.node?.loc?.start?.line
    if (line != null) return line
  }
  return null
}

/**
 * Advance the interpreter until the source line changes (or execution ends).
 * Returns { hasMore, changed } so callers know whether to push a snapshot.
 *
 * We cap the inner loop at MAX_AST_STEPS to avoid an infinite loop on
 * programs that never change line (e.g. a single-expression program).
 */
const MAX_AST_STEPS = 2000
const IGNORED_HELPER_FUNCTIONS = new Set([
  '__buildTreeFromLevelOrder',
])

function isInIgnoredHelper(interp) {
  const stack = interp?.stateStack
  if (!Array.isArray(stack) || stack.length === 0) return false
  for (const state of stack) {
    const node = state?.node
    if (!node) continue
    if (
      (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') &&
      node.id?.name &&
      IGNORED_HELPER_FUNCTIONS.has(node.id.name)
    ) {
      return true
    }
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      IGNORED_HELPER_FUNCTIONS.has(node.callee.name)
    ) {
      return true
    }
  }
  return false
}

function stepToNextLine() {
  const startLine = getCurrentLine(_interpreter)
  let hasMore = true
  let innerSteps = 0

  try {
    while (innerSteps < MAX_AST_STEPS) {
      hasMore = _interpreter.step()
      innerSteps++
      if (!hasMore) break
      const newLine = getCurrentLine(_interpreter)
      if (newLine !== startLine && newLine != null && !isInIgnoredHelper(_interpreter)) break
    }
    if (innerSteps >= MAX_AST_STEPS && hasMore) {
      pushDiagnostic('单步执行在同一行耗时过长，已自动截断本步。可能存在复杂循环或疑似死循环。')
    }
  } catch (err) {
    console.error('[InterpreterController] step error:', err)
    pushDiagnostic(`运行异常：${err?.message ?? '未知错误'}，请检查当前算法与输入结构。`)
    _storeApi.getState().setStatus('finished')
    return false
  }

  return hasMore
}

export function step() {
  if (!_interpreter) return false
  if (_stepCount >= MAX_STEPS) {
    _storeApi.getState().setStatus('finished')
    return false
  }

  const hasMore = stepToNextLine()

  _stepCount++
  const snap = capture(_interpreter, _stepCount)
  _storeApi.getState().pushSnapshot(snap)

  if (!hasMore) {
    _storeApi.getState().setStatus('finished')
  }

  return hasMore
}

export function runAll() {
  if (!_interpreter) return
  _running = true

  // Use requestAnimationFrame to keep UI responsive for small programs,
  // and fall back to synchronous loop for large ones.
  const BATCH = 50
  let count = 0

  const tick = () => {
    if (!_running) return
    for (let i = 0; i < BATCH; i++) {
      if (!step()) {
        _running = false
        return
      }
      count++
      if (count >= MAX_STEPS) {
        _running = false
        _storeApi.getState().setStatus('finished')
        return
      }
    }
    requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

/**
 * Count the number of active function frames in the stateStack.
 * Each FunctionExpression / FunctionDeclaration node in the stack
 * represents one level of function call depth.
 */
function getCallDepth(interp) {
  if (!Array.isArray(interp.stateStack)) return 0
  let depth = 0
  for (const state of interp.stateStack) {
    const t = state?.node?.type
    if (t === 'FunctionExpression' || t === 'FunctionDeclaration') depth++
  }
  return depth
}

/**
 * Step Over: advance until we return to the same (or shallower) call depth
 * AND the source line has changed.  Treats the entire body of any function
 * call on the current line as a single logical step.
 */
export function stepOver() {
  if (!_interpreter) return false
  if (_stepCount >= MAX_STEPS) {
    _storeApi.getState().setStatus('finished')
    return false
  }

  const startDepth = getCallDepth(_interpreter)
  const startLine  = getCurrentLine(_interpreter)
  let hasMore = true

  try {
    let inner = 0
    const limit = MAX_AST_STEPS * 10
    while (inner < limit) {
      hasMore = _interpreter.step()
      inner++
      if (!hasMore) break
      const depth = getCallDepth(_interpreter)
      const line  = getCurrentLine(_interpreter)
      if (depth <= startDepth && line !== startLine && line != null) break
    }
  } catch (err) {
    console.error('[InterpreterController] stepOver error:', err)
    _storeApi.getState().setStatus('finished')
    return false
  }

  _stepCount++
  const snap = capture(_interpreter, _stepCount)
  _storeApi.getState().pushSnapshot(snap)
  if (!hasMore) _storeApi.getState().setStatus('finished')
  return hasMore
}

/**
 * Step Out: run until the call depth becomes shallower than where we are now.
 * If already at the top level, falls back to a regular step.
 */
export function stepOut() {
  if (!_interpreter) return false
  if (_stepCount >= MAX_STEPS) {
    _storeApi.getState().setStatus('finished')
    return false
  }

  const startDepth = getCallDepth(_interpreter)
  if (startDepth === 0) return step()   // already at top level

  let hasMore = true

  try {
    let inner = 0
    const limit = MAX_AST_STEPS * 20
    while (inner < limit) {
      hasMore = _interpreter.step()
      inner++
      if (!hasMore) break
      if (getCallDepth(_interpreter) < startDepth) break
    }
  } catch (err) {
    console.error('[InterpreterController] stepOut error:', err)
    _storeApi.getState().setStatus('finished')
    return false
  }

  _stepCount++
  const snap = capture(_interpreter, _stepCount)
  _storeApi.getState().pushSnapshot(snap)
  if (!hasMore) _storeApi.getState().setStatus('finished')
  return hasMore
}

export function pause() {
  _running = false
}

export function reset() {
  _interpreter = null
  _stepCount = 0
  _running = false
}
