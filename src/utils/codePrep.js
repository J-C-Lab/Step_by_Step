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
    .replace(/\bfor\s*\(/g, 'for (')
    .replace(/\bif\s*\(/g, 'if (')
    .replace(/\bwhile\s*\(/g, 'while (')
    .replace(/\)\s*\{/g, ') {')
    .replace(/\s*(?<![<>=!])=(?![=>])\s*/g, ' = ')
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
