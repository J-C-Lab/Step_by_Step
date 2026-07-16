/**
 * Rule-based code preparation for the visualizer sandbox.
 *
 * The goal is intentionally conservative: make common algorithm snippets
 * executable and observable without changing the algorithm's intent.
 */

export function prepareCodeForVisualization(code) {
  const messages = []
  let nextCode = String(code ?? '').replace(/\r\n/g, '\n').trim()

  if (!nextCode) {
    return {
      code: '',
      messages: ['请输入一段 JavaScript 算法代码后再适配。'],
      changed: false,
    }
  }

  const beforeModernDecl = nextCode
  nextCode = nextCode.replace(/\b(let|const)\b/g, 'var')
  if (nextCode !== beforeModernDecl) {
    messages.push('将 let/const 转为 var，降低沙盒兼容风险。')
  }

  const beforeDuplicateAssign = nextCode
  nextCode = fixDuplicateSelfAssignment(nextCode)
  if (nextCode !== beforeDuplicateAssign) {
    messages.push('修正重复变量赋值，避免无意义的 self assignment。')
  }

  const beforeTreePointerFix = nextCode
  nextCode = fixCommonTreePointerMistakes(nextCode)
  if (nextCode !== beforeTreePointerFix) {
    messages.push('检测到可疑树指针赋值（node.left = node），已自动修正为 node.left = null。')
  }

  const beforeFlattenPrevFix = nextCode
  nextCode = fixFlattenPrevAssignment(nextCode)
  if (nextCode !== beforeFlattenPrevFix) {
    messages.push('检测到 flatten 模式缺少 prev = node，已自动补齐，避免链表结果丢节点。')
  }

  const beforeForOf = nextCode
  nextCode = expandForOfLoops(nextCode)
  if (nextCode !== beforeForOf) {
    messages.push('将 for...of 改为索引 for 循环，便于当前沙盒逐步执行。')
  }

  const beforeArrayFrom = nextCode
  nextCode = expandArrayFromFill(nextCode)
  if (nextCode !== beforeArrayFrom) {
    messages.push('将 Array.from(...fill...) 改为二维数组显式初始化循环。')
  }

  const beforeArrayFill = nextCode
  nextCode = expandArrayFill(nextCode)
  if (nextCode !== beforeArrayFill) {
    messages.push('将 new Array(n).fill(value) 改为显式初始化循环，避免沙盒不支持 fill 导致提前结束。')
  }

  const beforeReturnFix = nextCode
  nextCode = replaceTopLevelReturns(nextCode)
  if (nextCode !== beforeReturnFix) {
    messages.push('将顶层 return 改为 var result，便于 Watch 和可视化捕获。')
  }

  const beforeIndexFix = nextCode
  nextCode = fixObviousArrayBoundResult(nextCode)
  if (nextCode !== beforeIndexFix) {
    messages.push('将明显的 dp[n] 结果访问修正为 dp[n - 1]，避免数组越界。')
  }

  const beforeInputFix = nextCode
  const inputResult = injectMissingTopLevelInputs(nextCode)
  nextCode = inputResult.code
  if (nextCode !== beforeInputFix) {
    messages.push(inputResult.message)
  }

  const beforeTreeBuild = nextCode
  const treeBuildResult = autoBuildTreeInputs(nextCode)
  nextCode = treeBuildResult.code
  if (nextCode !== beforeTreeBuild) {
    messages.push(treeBuildResult.message)
  }

  const priorCompleteness = assessAlgorithmCompleteness(nextCode)

  const beforeInvokeFix = nextCode
  const invokeResult = appendMissingFunctionInvocation(nextCode)
  nextCode = invokeResult.code
  if (nextCode !== beforeInvokeFix) {
    messages.push(invokeResult.message)
  }

  nextCode = replaceInfinity(nextCode)

  const beforeFormat = nextCode
  nextCode = lightFormat(nextCode)
  if (nextCode !== beforeFormat) {
    messages.push('已做轻量格式化，让代码更适合逐步阅读。')
  }

  const completeness = assessAlgorithmCompleteness(nextCode)
  if (completeness.incomplete) {
    messages.unshift(completeness.message)
  } else if (priorCompleteness.incomplete) {
    messages.unshift(
      priorCompleteness.message.includes('缺少示例输入')
        ? '检测到原代码只包含算法函数，缺少示例输入与顶层调用。已尝试自动补全；建议手动书写完整代码（示例输入 + 调用），便于可视化完整执行路径。'
        : '检测到原代码已有输入但缺少顶层调用。已尝试自动补全入口调用；建议确认调用参数是否正确。'
    )
  }

  if (messages.length === 0) {
    messages.push('代码已经基本适合可视化。')
  }

  return {
    code: nextCode,
    messages,
    incomplete: completeness.incomplete,
    changed: nextCode !== String(code ?? ''),
  }
}

function replaceTopLevelReturns(code) {
  const lines = code.split('\n')
  let depth = 0

  return lines.map(line => {
    const trimmed = line.trim()
    const isTopLevelReturn = depth === 0 && /^return\b/.test(trimmed)

    let nextLine = line
    if (isTopLevelReturn) {
      const indent = line.match(/^\s*/)?.[0] ?? ''
      const expr = trimmed
        .replace(/^return\b/, '')
        .replace(/;?\s*$/, '')
        .trim()
      nextLine = `${indent}var result = ${expr};`
    }

    depth += braceDeltaIgnoringStrings(line)
    if (depth < 0) depth = 0

    return nextLine
  }).join('\n')
}

function fixDuplicateSelfAssignment(code) {
  return code.replace(
    /\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*\1\s*=\s*/g,
    'var $1 = '
  )
}

function fixCommonTreePointerMistakes(code) {
  return code.replace(
    /\bnode\s*\.\s*left\s*=\s*node\s*;/g,
    'node.left = null;'
  )
}

function fixFlattenPrevAssignment(code) {
  const hasRightToPrev = /\bnode\s*\.\s*right\s*=\s*prev\s*;/.test(code)
  const hasLeftNull = /\bnode\s*\.\s*left\s*=\s*null\s*;/.test(code)
  const hasPrevAssign = /\bprev\s*=\s*node\s*;/.test(code)
  if (!hasRightToPrev || !hasLeftNull || hasPrevAssign) return code

  return code.replace(
    /(\bnode\s*\.\s*left\s*=\s*null\s*;)/,
    '$1\n    prev = node;'
  )
}

function expandForOfLoops(code) {
  return code.split('\n').map(line => {
    const match = line.match(
      /^(\s*)for\s*\(\s*var\s+([A-Za-z_$][\w$]*)\s+of\s+([A-Za-z_$][\w$]*)\s*\)\s*\{\s*(?:\/\/[^\r\n]*)?$/
    )
    if (!match) return line

    const [, indent, itemName, collectionName] = match
    const indexName = uniqueLoopIndexName(code, collectionName)

    return [
      `${indent}for (var ${indexName} = 0; ${indexName} < ${collectionName}.length; ${indexName}++) {`,
      `${indent}  var ${itemName} = ${collectionName}[${indexName}];`,
    ].join('\n')
  }).join('\n')
}

function uniqueLoopIndexName(code, collectionName) {
  const base = `__idx_${collectionName}`
  let candidate = base
  let i = 1
  while (new RegExp(`\\b${escapeRegExp(candidate)}\\b`).test(code)) {
    candidate = `${base}_${i}`
    i++
  }
  return candidate
}

function expandArrayFromFill(code) {
  return code.split('\n').map(line => {
    // Pattern A: Array.from({length: N}, () => new Array(M).fill(V))
    // All rows have the same fixed column count.
    const fixedMatch = line.match(
      /^(\s*)var\s+([A-Za-z_$][\w$]*)\s*=\s*Array\.from\s*\(\s*\{\s*length\s*:\s*([^}]+?)\s*\}\s*,\s*\(\s*\)\s*=>\s*new\s+Array\s*\(\s*(.+?)\s*\)\s*\.\s*fill\s*\(\s*(.+?)\s*\)\s*\)\s*;?\s*(?:\/\/[^\r\n]*)?$/
    )
    if (fixedMatch) {
      const [, indent, arrayName, rowCountExpr, colCountExpr, fillExpr] = fixedMatch
      const rowName = uniqueInitIndexName(code, `${arrayName}_row`)
      const colName = uniqueInitIndexName(code, `${arrayName}_col`)
      return [
        `${indent}var ${arrayName} = [];`,
        `${indent}for (var ${rowName} = 0; ${rowName} < ${rowCountExpr.trim()}; ${rowName}++) {`,
        `${indent}  ${arrayName}[${rowName}] = [];`,
        `${indent}  for (var ${colName} = 0; ${colName} < ${colCountExpr.trim()}; ${colName}++) {`,
        `${indent}    ${arrayName}[${rowName}][${colName}] = ${fillExpr.trim()};`,
        `${indent}  }`,
        `${indent}}`,
      ].join('\n')
    }

    // Pattern B: Array.from({length: N}, (_, i) => new Array(EXPR_WITH_i).fill(V))
    // Row column count depends on the row index (e.g. triangular / jagged arrays).
    // Captures the ignored first param (any name) and the index param name.
    const jaggedMatch = line.match(
      /^(\s*)var\s+([A-Za-z_$][\w$]*)\s*=\s*Array\.from\s*\(\s*\{\s*length\s*:\s*([^}]+?)\s*\}\s*,\s*\(\s*[^,)]*,\s*([A-Za-z_$][\w$]*)\s*\)\s*=>\s*new\s+Array\s*\(\s*(.+?)\s*\)\s*\.\s*fill\s*\(\s*(.+?)\s*\)\s*\)\s*;?\s*(?:\/\/[^\r\n]*)?$/
    )
    if (jaggedMatch) {
      const [, indent, arrayName, rowCountExpr, idxParam, colCountExpr, fillExpr] = jaggedMatch
      const rowName = uniqueInitIndexName(code, `${arrayName}_row`)
      const colName = uniqueInitIndexName(code, `${arrayName}_col`)
      // Replace the arrow-function index parameter with the generated row loop variable.
      const colExpr = colCountExpr.trim().replace(
        new RegExp(`\\b${escapeRegExp(idxParam)}\\b`, 'g'),
        rowName
      )
      return [
        `${indent}var ${arrayName} = [];`,
        `${indent}for (var ${rowName} = 0; ${rowName} < ${rowCountExpr.trim()}; ${rowName}++) {`,
        `${indent}  ${arrayName}[${rowName}] = [];`,
        `${indent}  for (var ${colName} = 0; ${colName} < ${colExpr}; ${colName}++) {`,
        `${indent}    ${arrayName}[${rowName}][${colName}] = ${fillExpr.trim()};`,
        `${indent}  }`,
        `${indent}}`,
      ].join('\n')
    }

    return line
  }).join('\n')
}

function expandArrayFill(code) {
  return code.split('\n').map(line => {
    const match = line.match(
      /^(\s*)var\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Array\s*\(\s*([^)]+?)\s*\)\s*\.\s*fill\s*\(\s*(.+?)\s*\)\s*;?\s*(?:\/\/[^\r\n]*)?$/
    )
    if (!match) return line

    const [, indent, arrayName, lengthExpr, fillExpr] = match
    const idxName = uniqueInitIndexName(code, arrayName)

    return [
      `${indent}var ${arrayName} = [];`,
      `${indent}for (var ${idxName} = 0; ${idxName} < ${lengthExpr.trim()}; ${idxName}++) {`,
      `${indent}  ${arrayName}[${idxName}] = ${fillExpr.trim()};`,
      `${indent}}`,
    ].join('\n')
  }).join('\n')
}

function uniqueInitIndexName(code, arrayName) {
  const base = `__init_${arrayName}`
  let candidate = base
  let i = 1
  while (new RegExp(`\\b${escapeRegExp(candidate)}\\b`).test(code)) {
    candidate = `${base}_${i}`
    i++
  }
  return candidate
}

const JS_KEYWORDS = new Set([
  'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof', 'new', 'return',
  'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with',
  'true', 'false', 'null', 'undefined',
])

const JS_GLOBALS = new Set([
  'Array', 'Object', 'Math', 'console', 'Number', 'String', 'Boolean', 'Date',
  'JSON', 'parseInt', 'parseFloat', 'isNaN', 'Infinity', 'NaN', 'length',
  'ListNode', 'TreeNode', 'Node', 'Map', 'Set', 'Error', 'RegExp', 'Promise',
])

/**
 * When users paste a LeetCode function body without wrapper or sample input
 * (e.g. references `temperatures` but never declares it), execution dies on
 * the first access with ReferenceError. Inject known sample bindings at top.
 */
function injectMissingTopLevelInputs(code) {
  const declared = collectDeclaredNames(code)
  const referenced = collectReferencedIdentifiers(code)

  const missing = [...referenced].filter(name =>
    !declared.has(name) &&
    !JS_KEYWORDS.has(name) &&
    !JS_GLOBALS.has(name) &&
    isKnownInputIdentifier(name)
  )

  if (missing.length === 0) return { code, message: '' }

  const additions = missing.map(name => `var ${name} = ${getDefaultArgValue(name)};`)
  const names = missing.join(', ')
  return {
    code: `${additions.join('\n')}\n\n${code.trimStart()}`,
    message: `检测到未定义的输入变量（${names}），已在顶部自动添加示例数据。请按需修改。`,
  }
}

function collectDeclaredNames(code) {
  const names = new Set()

  for (const match of code.matchAll(/\bvar\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1])
  }
  for (const match of code.matchAll(/,\s*([A-Za-z_$][\w$]*)\s*=/g)) {
    names.add(match[1])
  }
  for (const match of code.matchAll(/\bfor\s*\(\s*var\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1])
  }

  for (const match of code.matchAll(/\bfunction\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g)) {
    addParamNames(names, match[1])
  }
  for (const match of code.matchAll(/\bfunction\s*\(([^)]*)\)/g)) {
    addParamNames(names, match[1])
  }
  for (const match of code.matchAll(/\bvar\s+[A-Za-z_$][\w$]*\s*=\s*function\s*\(([^)]*)\)/g)) {
    addParamNames(names, match[1])
  }

  return names
}

function addParamNames(names, paramsSource) {
  for (const param of paramsSource.split(',')) {
    const trimmed = param.trim()
    if (!trimmed) continue
    const name = trimmed.split('=')[0].trim()
    if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
  }
}

function collectReferencedIdentifiers(code) {
  const stripped = code
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, ' ')
    .replace(/`(?:\\.|[^`\\])*`/g, ' ')

  const ids = new Set()
  for (const match of stripped.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
    ids.add(match[1])
  }
  return ids
}

function isKnownInputIdentifier(name) {
  const lower = name.toLowerCase()
  return (
    lower === 'grid' || lower === 'matrix' ||
    lower === 'nums' || lower === 'arr' || lower === 'array' ||
    lower === 'values' || lower === 'prices' || lower === 'weights' || lower === 'wt' ||
    lower === 'temperatures' ||
    lower === 's' || lower === 'str' || lower === 'text' || lower === 't' ||
    lower === 'n' || lower === 'capacity' || lower === 'target' ||
    lower === 'm' || lower === 'k'
  )
}

function appendMissingFunctionInvocation(code) {
  const functionMatch = code.match(/\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)/)
  if (!functionMatch) return { code, message: '' }

  const functionName = functionMatch[1]
  const args = functionMatch[2]
    .split(',')
    .map(arg => arg.trim())
    .filter(Boolean)

  // Only count top-level calls. Recursive self-calls inside the body must not
  // block appending an entry-point invocation.
  const callCount = countTopLevelCalls(code, functionName)

  if (callCount > 0 || args.length === 0) return { code, message: '' }

  // For each param not already defined globally, generate a sample value
  const additions = []
  for (const arg of args) {
    if (!isTopLevelVarDeclared(code, arg)) {
      additions.push(`var ${arg} = ${getDefaultArgValue(arg)};`)
    }
  }

  const prefix = additions.length > 0 ? '\n' + additions.join('\n') + '\n' : ''
  const newCode = `${code.trimEnd()}${prefix}\nvar result = ${functionName}(${args.join(', ')});`
  const note = additions.length > 0
    ? `检测到只定义函数未调用，已自动添加示例输入（${additions.map(l => l.split('=')[0].replace('var','').trim()).join(', ')}）并追加调用。请按需修改示例数据。`
    : '检测到只定义函数未调用，已追加 var result = fn(args) 以进入算法内部。'
  return { code: newCode, message: note }
}

/**
 * Detect algorithm snippets that are only a method definition — no sample
 * inputs and no top-level call — and ask the user to write a complete script.
 */
function assessAlgorithmCompleteness(code) {
  const fn = findPrimaryAlgorithmFunction(code)
  if (!fn) return { incomplete: false, message: '' }

  const topLevelCalls = countTopLevelCalls(code, fn.name)
  const hasInputs = hasTopLevelSampleInputs(code, fn.params)

  if (topLevelCalls > 0) return { incomplete: false, message: '' }

  const exampleInputs = fn.params
    .map(param => `var ${param} = ${getDefaultArgValue(param)};`)
    .join('\n')
  const callLine = `var result = ${fn.name}(${fn.params.join(', ')});`

  if (!hasInputs) {
    return {
      incomplete: true,
      message:
        `检测到代码只包含算法函数「${fn.name}」，缺少示例输入与顶层调用。` +
        `请书写完整后再运行，例如：\n${exampleInputs || '/* 在此声明示例输入 */'}\n${callLine}`,
    }
  }

  return {
    incomplete: true,
    message:
      `检测到已定义函数「${fn.name}」及输入，但缺少顶层调用，可视化只会执行声明就结束。` +
      `请补充：${callLine}`,
  }
}

function findPrimaryAlgorithmFunction(code) {
  const varFn = code.match(/\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)/)
  if (varFn) {
    return {
      name: varFn[1],
      params: splitParamNames(varFn[2]),
    }
  }

  const declFn = code.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/)
  if (declFn && declFn[1] !== 'TreeNode' && !declFn[1].startsWith('__')) {
    return {
      name: declFn[1],
      params: splitParamNames(declFn[2]),
    }
  }

  return null
}

function splitParamNames(paramsSource) {
  return String(paramsSource ?? '')
    .split(',')
    .map(arg => arg.trim().split('=')[0].trim())
    .filter(name => /^[A-Za-z_$][\w$]*$/.test(name))
}

/** Count calls to `functionName(...)` that occur outside any `{ ... }` body. */
function countTopLevelCalls(code, functionName) {
  let depth = 0
  let count = 0
  let i = 0
  const n = code.length
  const nameLen = functionName.length

  while (i < n) {
    const c = code[i]

    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      i++
      while (i < n && code[i] !== quote) {
        if (code[i] === '\\') i++
        i++
      }
      i++
      continue
    }

    if (c === '/' && code[i + 1] === '/') {
      i += 2
      while (i < n && code[i] !== '\n') i++
      continue
    }

    if (c === '/' && code[i + 1] === '*') {
      i += 2
      while (i < n - 1 && !(code[i] === '*' && code[i + 1] === '/')) i++
      i += 2
      continue
    }

    if (c === '{') {
      depth++
      i++
      continue
    }
    if (c === '}') {
      depth = Math.max(0, depth - 1)
      i++
      continue
    }

    if (depth === 0 && code.startsWith(functionName, i)) {
      const prev = i === 0 ? '' : code[i - 1]
      if (i > 0 && /[\w$]/.test(prev)) {
        i++
        continue
      }

      // Skip `function name(` declarations
      const before = code.slice(Math.max(0, i - 12), i)
      if (/\bfunction\s*$/.test(before)) {
        i += nameLen
        continue
      }

      let j = i + nameLen
      while (j < n && /\s/.test(code[j])) j++
      if (code[j] === '(') {
        count++
        i = j + 1
        continue
      }
    }

    i++
  }

  return count
}

/** Whether params already have top-level `var name = ...` sample bindings. */
function hasTopLevelSampleInputs(code, params) {
  if (!params || params.length === 0) return true
  return params.every(param => isTopLevelVarDeclared(code, param))
}

/** True if `name` is declared at top level via `var name` or `var a = ..., name = ...`. */
function isTopLevelVarDeclared(code, name) {
  let depth = 0
  const lines = code.split('\n')
  const direct = new RegExp(`\\bvar\\s+${escapeRegExp(name)}\\b`)
  const comma = new RegExp(`,\\s*${escapeRegExp(name)}\\s*=`)

  for (const line of lines) {
    if (depth === 0 && (direct.test(line) || comma.test(line))) {
      return true
    }
    depth = Math.max(0, depth + braceDeltaIgnoringStrings(line))
  }
  return false
}

function autoBuildTreeInputs(code) {
  const hasTreeCtor = /\bTreeNode\b/.test(code)
  const treeAlgoLikely = /(?:\.left\b|\.right\b)/.test(code)
  if (!hasTreeCtor && !treeAlgoLikely) return { code, message: '' }

  const lines = code.split('\n')
  let changed = false
  let requiresHelper = false

  const updated = lines.map(line => {
    const match = line.match(
      /^(\s*)var\s+([A-Za-z_$][\w$]*)\s*=\s*(\[[^[\]]*\])\s*;?\s*(?:\/\/[^\r\n]*)?$/
    )
    if (!match) return line

    const [, indent, name, arrLiteral] = match
    if (!isLikelyTreeRootName(name)) return line
    if (!isLikelyLevelOrderArrayLiteral(arrLiteral)) return line

    changed = true
    const inlineTreeExpr = tryBuildTreeCtorExpression(arrLiteral)
    if (inlineTreeExpr) {
      return `${indent}var ${name} = ${inlineTreeExpr};`
    }
    requiresHelper = true
    return `${indent}var ${name} = __buildTreeFromLevelOrder(${arrLiteral});`
  })

  if (!changed) return { code, message: '' }
  const needsTreeCtorInjection = !hasTreeCtor
  if (!requiresHelper || /\b__buildTreeFromLevelOrder\s*\(/.test(code)) {
    const ctorBlock = needsTreeCtorInjection ? `${getDefaultTreeNodeCtor()}\n` : ''
    return {
      code: `${ctorBlock}${updated.join('\n')}`,
      message: needsTreeCtorInjection
        ? '检测到树算法输入仍为数组，已自动补全 TreeNode 并构建 left/right 二叉树。'
        : '检测到 TreeNode + 层序数组输入，已自动构建 left/right 二叉树。',
    }
  }

  const helper = [
    'function __buildTreeFromLevelOrder(arr) {',
    '  if (!arr || arr.length === 0) return null;',
    '  if (arr[0] === null || arr[0] === undefined) return null;',
    '  var nodes = [];',
    '  for (var i = 0; i < arr.length; i++) {',
    '    if (arr[i] === null || arr[i] === undefined) {',
    '      nodes[i] = null;',
    '    } else {',
    '      nodes[i] = new TreeNode(arr[i]);',
    '    }',
    '  }',
    '  for (var j = 0; j < nodes.length; j++) {',
    '    if (!nodes[j]) continue;',
    '    var li = 2 * j + 1;',
    '    var ri = 2 * j + 2;',
    '    nodes[j].left = li < nodes.length ? nodes[li] : null;',
    '    nodes[j].right = ri < nodes.length ? nodes[ri] : null;',
    '  }',
    '  return nodes[0];',
    '}',
    '',
  ].join('\n')

  return {
    code: `${needsTreeCtorInjection ? `${getDefaultTreeNodeCtor()}\n` : ''}${helper}${updated.join('\n')}`,
    message: needsTreeCtorInjection
      ? '检测到树算法输入仍为数组，已自动补全 TreeNode 并构建 left/right 二叉树。'
      : '检测到 TreeNode + 层序数组输入，已自动构建 left/right 二叉树。',
  }
}

/**
 * Infer a sensible default example value for a function parameter by its name.
 */
function getDefaultArgValue(name) {
  const lower = name.toLowerCase()

  if (lower === 'grid' || lower === 'matrix') {
    return '[[1, 3, 1], [1, 5, 1], [4, 2, 1]]'
  }
  if (lower === 'temperatures') {
    return '[73, 74, 75, 71, 69, 72, 76, 73]'
  }
  if (lower === 'nums' || lower === 'arr' || lower === 'array' || lower === 'values' || lower === 'prices') {
    return '[1, 5, 11, 5]'
  }
  if (lower === 'weights' || lower === 'wt') {
    return '[1, 2, 3, 5]'
  }
  if (lower === 's' || lower === 'str' || lower === 'text') {
    return '"abcde"'
  }
  if (lower === 't') {
    return '"ace"'
  }
  if (lower === 'n' || lower === 'capacity' || lower === 'target') {
    return '5'
  }
  if (lower === 'm') {
    return '3'
  }
  if (lower === 'k') {
    return '2'
  }
  // generic fallback
  return '5'
}

function isLikelyTreeRootName(name) {
  return /(^root$)|tree|node/i.test(name)
}

function isLikelyLevelOrderArrayLiteral(literal) {
  if (!literal) return false
  if (!/^\[[\s\S]*\]$/.test(literal)) return false
  if (/[\{\}:]/.test(literal)) return false
  const compact = literal.replace(/\s+/g, '')
  if (!compact.includes(',')) return false
  if (!/(^|,)(null|undefined)(,|$)/.test(compact) && compact.length < 10) return false
  return true
}

function tryBuildTreeCtorExpression(arrLiteral) {
  let arr
  try {
    arr = Function(`"use strict"; return (${arrLiteral});`)()
  } catch {
    return null
  }
  if (!Array.isArray(arr) || arr.length === 0) return null
  const valueOk = arr.every(v =>
    v === null ||
    v === undefined ||
    typeof v === 'number' ||
    typeof v === 'string' ||
    typeof v === 'boolean'
  )
  if (!valueOk) return null

  const build = idx => {
    if (idx >= arr.length || arr[idx] === null || arr[idx] === undefined) return 'null'
    const left = build(2 * idx + 1)
    const right = build(2 * idx + 2)
    return `new TreeNode(${toJsLiteral(arr[idx])}, ${left}, ${right})`
  }
  return build(0)
}

function toJsLiteral(value) {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  return 'null'
}

function getDefaultTreeNodeCtor() {
  return [
    'function TreeNode(val, left, right) {',
    '  this.val = (val === undefined ? 0 : val);',
    '  this.left = (left === undefined ? null : left);',
    '  this.right = (right === undefined ? null : right);',
    '}',
    '',
  ].join('\n')
}

/**
 * Replace bare Infinity with a large-but-finite sentinel (1e15) so the
 * js-interpreter never has to deal with IEEE infinity in array cells.
 * We only replace Infinity that appears as a standalone token (not part of an
 * identifier), and we leave Number.POSITIVE_INFINITY / -Infinity alone.
 */
function replaceInfinity(code) {
  return code.replace(/(?<![.\w])Infinity(?!\w)/g, '1000000000')
}

function fixObviousArrayBoundResult(code) {
  const arrayLengthByName = new Map()
  const arrayDeclPattern = /var\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Array\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g
  const expandedArrayPattern = /for\s*\(\s*var\s+[A-Za-z_$][\w$]*\s*=\s*0\s*;\s*[A-Za-z_$][\w$]*\s*<\s*([A-Za-z_$][\w$]*)\s*;[\s\S]*?\{\s*([A-Za-z_$][\w$]*)\s*\[/g
  let match

  while ((match = arrayDeclPattern.exec(code)) !== null) {
    arrayLengthByName.set(match[1], match[2])
  }
  while ((match = expandedArrayPattern.exec(code)) !== null) {
    arrayLengthByName.set(match[2], match[1])
  }

  let nextCode = code
  for (const [arrayName, lenName] of arrayLengthByName.entries()) {
    const resultPattern = new RegExp(
      `var\\s+result\\s*=\\s*${escapeRegExp(arrayName)}\\s*\\[\\s*${escapeRegExp(lenName)}\\s*\\]\\s*;`,
      'g'
    )
    nextCode = nextCode.replace(resultPattern, `var result = ${arrayName}[${lenName} - 1];`)
  }

  return nextCode
}

function lightFormat(code) {
  return code
    .split('\n')
    .map(line => formatLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

function formatLine(line) {
  const leading = line.match(/^\s*/)?.[0] ?? ''
  let text = line.trim()
  if (!text) return ''

  text = text
    .replace(/\+\s+=/g, '+=')
    .replace(/-\s+=/g, '-=')
    .replace(/\*\s+=/g, '*=')
    .replace(/\/\s+=/g, '/=')
    .replace(/%\s+=/g, '%=')
    .replace(/\s*([+\-*/%])=\s*/g, ' $1= ')
    .replace(/\bfor\s*\(/g, 'for (')
    .replace(/\bif\s*\(/g, 'if (')
    .replace(/\bwhile\s*\(/g, 'while (')
    .replace(/\)\s*\{/g, ') {')
    .replace(/\s*(?<![<>=!+\-*/%&|^])=(?![=>])\s*/g, ' = ')
    .replace(/\s*;\s*/g, '; ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\[\s+/g, '[')
    .replace(/\s+\]/g, ']')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (
    text &&
    !text.endsWith(';') &&
    !text.endsWith('{') &&
    !text.endsWith('}') &&
    !text.startsWith('//')
  ) {
    text += ';'
  }

  return leading + text
}

function braceDeltaIgnoringStrings(line) {
  let delta = 0
  let quote = null
  let escaped = false

  for (const ch of line) {
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '{') delta++
    if (ch === '}') delta--
  }

  return delta
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
