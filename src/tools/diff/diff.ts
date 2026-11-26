/*
 * Line and word diffs using Myers' O(ND) algorithm ("An O(ND) Difference
 * Algorithm and Its Variations", 1986), plus unified-diff output.
 */

export type Op = 'equal' | 'insert' | 'delete'

export interface Edit {
  op: Op
  /** Index into `a` (equal/delete). */
  ai?: number
  /** Index into `b` (equal/insert). */
  bi?: number
}

/** Shortest edit script between two sequences. */
export function myers<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean = Object.is): Edit[] {
  // Trim the common prefix/suffix first: cheap, and keeps the trace small.
  let start = 0
  while (start < a.length && start < b.length && eq(a[start]!, b[start]!)) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && eq(a[endA - 1]!, b[endB - 1]!)) {
    endA--
    endB--
  }

  const n = endA - start
  const m = endB - start
  const max = n + m
  const offset = max
  const v = new Int32Array(2 * max + 2)
  const trace: Int32Array[] = []
  let found = max === 0

  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1
      let y = x - k
      while (x < n && y < m && eq(a[start + x]!, b[start + y]!)) {
        x++
        y++
      }
      v[offset + k] = x
      if (x >= n && y >= m) {
        found = true
        break
      }
    }
  }

  // Backtrack through the saved V arrays to recover the path.
  const middle: Edit[] = []
  let x = n
  let y = m
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d]!
    const k = x - y
    const prevK = k === -d || (k !== d && vd[offset + k - 1]! < vd[offset + k + 1]!) ? k + 1 : k - 1
    const prevX = d === 0 ? 0 : vd[offset + prevK]!
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      x--
      y--
      middle.push({ op: 'equal', ai: start + x, bi: start + y })
    }
    if (d > 0) {
      if (x === prevX) middle.push({ op: 'insert', bi: start + prevY })
      else middle.push({ op: 'delete', ai: start + prevX })
    }
    x = prevX
    y = prevY
  }
  middle.reverse()

  const out: Edit[] = []
  for (let i = 0; i < start; i++) out.push({ op: 'equal', ai: i, bi: i })
  out.push(...middle)
  for (let i = 0; i < a.length - endA; i++) out.push({ op: 'equal', ai: endA + i, bi: endB + i })
  return out
}

/* ------------------------------- lines -------------------------------- */

export interface DiffOptions {
  ignoreWhitespace?: boolean
  ignoreCase?: boolean
}

export interface DiffLine {
  op: Op
  text: string
  /** 1-based line numbers in each side. */
  aLine?: number
  bLine?: number
}

export function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split(/\r\n|\r|\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function diffLines(a: string, b: string, options: DiffOptions = {}): DiffLine[] {
  const la = splitLines(a)
  const lb = splitLines(b)
  const norm = (s: string) => {
    let t = options.ignoreWhitespace ? s.replace(/\s+/g, ' ').trim() : s
    if (options.ignoreCase) t = t.toLowerCase()
    return t
  }
  const na = la.map(norm)
  const nb = lb.map(norm)
  const idxA = na.map((_, i) => i)
  const idxB = nb.map((_, i) => i)
  return myers(idxA, idxB, (i, j) => na[i] === nb[j]).map((e) => {
    if (e.op === 'equal') return { op: 'equal', text: lb[e.bi!]!, aLine: e.ai! + 1, bLine: e.bi! + 1 }
    if (e.op === 'delete') return { op: 'delete', text: la[e.ai!]!, aLine: e.ai! + 1 }
    return { op: 'insert', text: lb[e.bi!]!, bLine: e.bi! + 1 }
  })
}

export interface DiffStats {
  added: number
  removed: number
  unchanged: number
}

export function diffStats(lines: readonly DiffLine[]): DiffStats {
  const s: DiffStats = { added: 0, removed: 0, unchanged: 0 }
  for (const l of lines) {
    if (l.op === 'insert') s.added++
    else if (l.op === 'delete') s.removed++
    else s.unchanged++
  }
  return s
}

/** `git diff`-style unified output with `context` lines around each change. */
export function unifiedDiff(lines: readonly DiffLine[], context = 3, nameA = 'a', nameB = 'b'): string {
  const changed = lines.map((l, i) => (l.op !== 'equal' ? i : -1)).filter((i) => i >= 0)
  if (changed.length === 0) return ''
  const hunks: [number, number][] = []
  for (const i of changed) {
    const from = Math.max(0, i - context)
    const to = Math.min(lines.length - 1, i + context)
    const last = hunks[hunks.length - 1]
    if (last && from <= last[1] + 1) last[1] = to
    else hunks.push([from, to])
  }
  const out = [`--- ${nameA}`, `+++ ${nameB}`]
  for (const [from, to] of hunks) {
    const slice = lines.slice(from, to + 1)
    // Start lines: the first line number on each side at or after the hunk start.
    const firstA = lines.slice(from).find((l) => l.aLine !== undefined)?.aLine
    const firstB = lines.slice(from).find((l) => l.bLine !== undefined)?.bLine
    const countA = slice.filter((l) => l.op !== 'insert').length
    const countB = slice.filter((l) => l.op !== 'delete').length
    const startA = countA === 0 ? (firstA ?? 1) - 1 : (firstA ?? 1)
    const startB = countB === 0 ? (firstB ?? 1) - 1 : (firstB ?? 1)
    const range = (start: number, count: number) => (count === 1 ? `${start}` : `${start},${count}`)
    out.push(`@@ -${range(Math.max(0, startA), countA)} +${range(Math.max(0, startB), countB)} @@`)
    for (const l of slice) out.push(`${l.op === 'insert' ? '+' : l.op === 'delete' ? '-' : ' '}${l.text}`)
  }
  return out.join('\n') + '\n'
}

/* ------------------------------- words -------------------------------- */

export interface WordPart {
  op: Op
  text: string
}

export function tokenizeWords(s: string): string[] {
  return s.match(/\w+|\s+|[^\w\s]/gu) ?? []
}

/** Word-level diff between two lines, merged into runs for rendering. */
export function diffWords(a: string, b: string): WordPart[] {
  const ta = tokenizeWords(a)
  const tb = tokenizeWords(b)
  const parts: WordPart[] = []
  for (const e of myers(ta, tb)) {
    const text = e.op === 'insert' ? tb[e.bi!]! : ta[e.ai!]!
    const last = parts[parts.length - 1]
    if (last && last.op === e.op) last.text += text
    else parts.push({ op: e.op, text })
  }
  return parts
}

/* --------------------------- side by side ----------------------------- */

export interface SideRow {
  left?: DiffLine
  right?: DiffLine
}

/** Pair deletions with the insertions that follow them so changed lines sit side by side. */
export function toSideBySide(lines: readonly DiffLine[]): SideRow[] {
  const rows: SideRow[] = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]!
    if (l.op === 'equal') {
      rows.push({ left: l, right: l })
      i++
      continue
    }
    const dels: DiffLine[] = []
    const ins: DiffLine[] = []
    while (i < lines.length && lines[i]!.op === 'delete') dels.push(lines[i++]!)
    while (i < lines.length && lines[i]!.op === 'insert') ins.push(lines[i++]!)
    for (let j = 0; j < Math.max(dels.length, ins.length); j++) rows.push({ left: dels[j], right: ins[j] })
  }
  return rows
}
