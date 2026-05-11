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

  if (messages.length === 0) {
    messages.push('代码已经基本适合可视化。')
  }

  return {
    code: nextCode,
    messages,
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

function expandForOfLoops(code) {
  return code.split('\n').map(line => {
    const match = line.match(
      /^(\s*)for\s*\(\s*var\s+([A-Za-z_$][\w$]*)\s+of\s+([A-Za-z_$][\w$]*)\s*\)\s*\{\s*$/
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
      /^(\s*)var\s+([A-Za-z_$][\w$]*)\s*=\s*Array\.from\s*\(\s*\{\s*length\s*:\s*([^}]+?)\s*\}\s*,\s*\(\s*\)\s*=>\s*new\s+Array\s*\(\s*(.+?)\s*\)\s*\.\s*fill\s*\(\s*(.+?)\s*\)\s*\)\s*;?\s*$/
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
      /^(\s*)var\s+([A-Za-z_$][\w$]*)\s*=\s*Array\.from\s*\(\s*\{\s*length\s*:\s*([^}]+?)\s*\}\s*,\s*\(\s*[^,)]*,\s*([A-Za-z_$][\w$]*)\s*\)\s*=>\s*new\s+Array\s*\(\s*(.+?)\s*\)\s*\.\s*fill\s*\(\s*(.+?)\s*\)\s*\)\s*;?\s*$/
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
      /^(\s*)var\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Array\s*\(\s*([^)]+?)\s*\)\s*\.\s*fill\s*\(\s*(.+?)\s*\)\s*;?\s*$/
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

function appendMissingFunctionInvocation(code) {
  const functionMatch = code.match(/\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)/)
  if (!functionMatch) return { code, message: '' }

  const functionName = functionMatch[1]
  const args = functionMatch[2]
    .split(',')
    .map(arg => arg.trim())
    .filter(Boolean)

  const escapedName = escapeRegExp(functionName)
  const callPattern = new RegExp(`(^|[^\\w$])${escapedName}\\s*\\(`, 'g')
  let callCount = 0
  let m

  while ((m = callPattern.exec(code)) !== null) {
    callCount++
  }

  if (callCount > 0 || args.length === 0) return { code, message: '' }

  // For each param not already defined globally, generate a sample value
  const additions = []
  for (const arg of args) {
    const alreadyDefined = new RegExp(`\\bvar\\s+${escapeRegExp(arg)}\\b`).test(code)
    if (!alreadyDefined) {
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
 * Infer a sensible default example value for a function parameter by its name.
 */
function getDefaultArgValue(name) {
  const lower = name.toLowerCase()

  if (lower === 'grid' || lower === 'matrix') {
    return '[[1, 3, 1], [1, 5, 1], [4, 2, 1]]'
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
