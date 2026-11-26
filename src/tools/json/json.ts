/* JSON parsing with precise error locations, formatting, and structural diff. */

export interface JsonErrorInfo {
  message: string
  /** 1-based line and column of the offending character. */
  line: number
  column: number
  offset: number
  hint?: string
}

export type JsonParseResult = { ok: true; value: unknown } | { ok: false; error: JsonErrorInfo }

export function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1
  let col = 1
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++
      col = 1
    } else col++
  }
  return { line, column: col }
}

class ScanError extends Error {
  constructor(
    message: string,
    public offset: number,
    public hint?: string,
  ) {
    super(message)
  }
}

/**
 * Strict JSON scanner (RFC 8259) used only to locate errors, so messages are
 * identical across browsers. JSON.parse remains the source of truth for values.
 */
function scan(text: string): void {
  let i = 0
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++
  }
  const describe = (ch: string | undefined) => (ch === undefined ? 'end of input' : `"${ch}"`)

  const value = (): void => {
    ws()
    const ch = text[i]
    if (ch === '{') return object()
    if (ch === '[') return array()
    if (ch === '"') return string()
    if (ch === '-' || (ch !== undefined && ch >= '0' && ch <= '9')) return number()
    for (const lit of ['true', 'false', 'null']) {
      if (text.startsWith(lit, i)) {
        i += lit.length
        return
      }
    }
    if (ch === "'") throw new ScanError('Unexpected single quote', i, 'JSON strings must use double quotes.')
    if (ch === '/' && (text[i + 1] === '/' || text[i + 1] === '*'))
      throw new ScanError('Comments are not allowed in JSON', i, 'Remove the comment, or use YAML/JSON5 if you need comments.')
    if (text.startsWith('undefined', i) || text.startsWith('NaN', i) || text.startsWith('Infinity', i))
      throw new ScanError(`${text.slice(i).match(/^\w+/)![0]} is not a JSON value`, i, 'Use null or a string instead.')
    throw new ScanError(`Unexpected ${describe(ch)}, expected a value`, i)
  }

  const object = (): void => {
    let comma = -1
    i++ // {
    ws()
    if (text[i] === '}') {
      i++
      return
    }
    for (;;) {
      ws()
      if (text[i] === '}') throw new ScanError('Trailing comma before "}"', comma, 'Remove the last comma in the object.')
      if (text[i] !== '"') {
        const hint = /[A-Za-z_$]/.test(text[i] ?? '')
          ? 'Object keys must be double-quoted strings.'
          : text[i] === "'"
            ? 'JSON strings must use double quotes.'
            : undefined
        throw new ScanError(`Unexpected ${describe(text[i])}, expected a property name`, i, hint)
      }
      string()
      ws()
      if (text[i] !== ':') throw new ScanError(`Unexpected ${describe(text[i])}, expected ":" after property name`, i)
      i++
      value()
      ws()
      if (text[i] === ',') {
        comma = i++
        continue
      }
      if (text[i] === '}') {
        i++
        return
      }
      throw new ScanError(`Unexpected ${describe(text[i])}, expected "," or "}"`, i, text[i] === '"' ? 'A comma is probably missing.' : undefined)
    }
  }

  const array = (): void => {
    let comma = -1
    i++ // [
    ws()
    if (text[i] === ']') {
      i++
      return
    }
    for (;;) {
      ws()
      if (text[i] === ']') throw new ScanError('Trailing comma before "]"', comma, 'Remove the last comma in the array.')
      value()
      ws()
      if (text[i] === ',') {
        comma = i++
        continue
      }
      if (text[i] === ']') {
        i++
        return
      }
      throw new ScanError(`Unexpected ${describe(text[i])}, expected "," or "]"`, i)
    }
  }

  const string = (): void => {
    const start = i
    i++ // opening quote
    while (i < text.length) {
      const ch = text[i]!
      if (ch === '"') {
        i++
        return
      }
      if (ch === '\\') {
        const esc = text[i + 1]
        if (esc === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) throw new ScanError('Invalid \\u escape: expected 4 hex digits', i)
          i += 6
          continue
        }
        if (esc === undefined || !'"\\/bfnrt'.includes(esc)) throw new ScanError(`Invalid escape sequence "\\${esc ?? ''}"`, i)
        i += 2
        continue
      }
      if (ch.charCodeAt(0) < 0x20) {
        throw new ScanError(
          ch === '\n' ? 'Unescaped line break inside a string' : 'Unescaped control character inside a string',
          i,
          'Use \\n, \\t or a \\u escape inside strings.',
        )
      }
      i++
    }
    throw new ScanError('Unterminated string', start, 'A closing double quote is missing.')
  }

  const number = (): void => {
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i))
    if (!m) throw new ScanError('Invalid number', i)
    const next = text[i + m[0].length]
    if (next !== undefined && /[\d.xXeE]/.test(next)) {
      throw new ScanError('Invalid number', i, /^-?0\d/.test(text.slice(i)) ? 'Numbers cannot have leading zeros.' : undefined)
    }
    i += m[0].length
  }

  ws()
  if (i >= text.length) throw new ScanError('The input is empty', 0)
  value()
  ws()
  if (i < text.length) throw new ScanError(`Unexpected ${describe(text[i])} after the end of the JSON value`, i, 'Only one top-level value is allowed.')
}

export function parseJson(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch (nativeError) {
    let info: { message: string; offset: number; hint?: string }
    try {
      scan(text)
      // The scanner accepted what the engine rejected: report the engine's message.
      info = { message: (nativeError as Error).message, offset: 0 }
    } catch (e) {
      if (!(e instanceof ScanError)) throw e
      info = { message: e.message, offset: e.offset, hint: e.hint }
    }
    const { line, column } = lineColumn(text, info.offset)
    return { ok: false, error: { ...info, line, column } }
  }
}

/** Integer literals that JSON.parse cannot represent exactly (beyond 2^53). */
export function findUnsafeIntegers(text: string): string[] {
  const found: string[] = []
  const re = /"(?:[^"\\]|\\.)*"|(-?\d+)(?![\d.eE])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const lit = m[1]
    if (lit && !Number.isSafeInteger(Number(lit))) found.push(lit)
  }
  return found
}

export type Indent = 0 | 2 | 4 | '\t'

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep((value as Record<string, unknown>)[k])
    return out
  }
  return value
}

export function formatJson(value: unknown, indent: Indent, sortKeys = false): string {
  return JSON.stringify(sortKeys ? sortKeysDeep(value) : value, null, indent === 0 ? undefined : indent)
}

/* ------------------------------- stats ------------------------------- */

export interface JsonStats {
  objects: number
  arrays: number
  keys: number
  maxDepth: number
}

export function jsonStats(value: unknown): JsonStats {
  const s: JsonStats = { objects: 0, arrays: 0, keys: 0, maxDepth: 0 }
  const walk = (v: unknown, depth: number) => {
    s.maxDepth = Math.max(s.maxDepth, depth)
    if (Array.isArray(v)) {
      s.arrays++
      v.forEach((x) => walk(x, depth + 1))
    } else if (v !== null && typeof v === 'object') {
      s.objects++
      for (const [, x] of Object.entries(v)) {
        s.keys++
        walk(x, depth + 1)
      }
    }
  }
  walk(value, 0)
  return s
}

/* -------------------------------- diff ------------------------------- */

export type JsonChange =
  | { kind: 'added'; path: string; after: unknown }
  | { kind: 'removed'; path: string; before: unknown }
  | { kind: 'changed'; path: string; before: unknown; after: unknown }

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export function childPath(parent: string, key: string | number): string {
  if (typeof key === 'number') return `${parent}[${key}]`
  return IDENT.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`
}

function kindOf(v: unknown): 'array' | 'object' | 'null' | 'scalar' {
  if (Array.isArray(v)) return 'array'
  if (v === null) return 'null'
  return typeof v === 'object' ? 'object' : 'scalar'
}

/**
 * Structural diff. Objects are compared by key (order-insensitive), arrays by
 * index. Type changes (e.g. object -> array) are reported as a single change.
 */
export function diffJson(before: unknown, after: unknown, path = '$'): JsonChange[] {
  const ka = kindOf(before)
  const kb = kindOf(after)
  if (ka !== kb) return [{ kind: 'changed', path, before, after }]
  if (ka === 'array') {
    const a = before as unknown[]
    const b = after as unknown[]
    const out: JsonChange[] = []
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i++) {
      const p = childPath(path, i)
      if (i >= a.length) out.push({ kind: 'added', path: p, after: b[i] })
      else if (i >= b.length) out.push({ kind: 'removed', path: p, before: a[i] })
      else out.push(...diffJson(a[i], b[i], p))
    }
    return out
  }
  if (ka === 'object') {
    const a = before as Record<string, unknown>
    const b = after as Record<string, unknown>
    const out: JsonChange[] = []
    for (const key of Object.keys(a)) {
      const p = childPath(path, key)
      if (!Object.hasOwn(b, key)) out.push({ kind: 'removed', path: p, before: a[key] })
      else out.push(...diffJson(a[key], b[key], p))
    }
    for (const key of Object.keys(b)) {
      if (!Object.hasOwn(a, key)) out.push({ kind: 'added', path: childPath(path, key), after: b[key] })
    }
    return out
  }
  return Object.is(before, after) ? [] : [{ kind: 'changed', path, before, after }]
}
