import { describe, expect, it } from 'vitest'
import { diffLines, diffStats, diffWords, myers, splitLines, toSideBySide, unifiedDiff, type Edit } from './diff'

/** Apply an edit script to `a` and check it produces `b`. */
function apply<T>(a: T[], b: T[], edits: Edit[]): T[] {
  const out: T[] = []
  for (const e of edits) {
    if (e.op === 'equal') {
      expect(a[e.ai!]).toEqual(b[e.bi!])
      out.push(a[e.ai!]!)
    } else if (e.op === 'insert') out.push(b[e.bi!]!)
  }
  return out
}

const cost = (edits: Edit[]) => edits.filter((e) => e.op !== 'equal').length

describe('myers', () => {
  it('finds the shortest edit script for the paper example (D = 5)', () => {
    const a = [...'ABCABBA']
    const b = [...'CBABAC']
    const edits = myers(a, b)
    expect(cost(edits)).toBe(5)
    expect(apply(a, b, edits)).toEqual(b)
  })

  it('handles empty inputs', () => {
    expect(myers([], [])).toEqual([])
    expect(myers(['x'], []).map((e) => e.op)).toEqual(['delete'])
    expect(myers([], ['x', 'y']).map((e) => e.op)).toEqual(['insert', 'insert'])
  })

  it('handles identical and completely different inputs', () => {
    expect(cost(myers([1, 2, 3], [1, 2, 3]))).toBe(0)
    expect(cost(myers([1, 2, 3], [4, 5]))).toBe(5)
  })

  it('produces a valid minimal script on random inputs', () => {
    let seed = 1
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    for (let t = 0; t < 200; t++) {
      const a = Array.from({ length: Math.floor(rnd() * 12) }, () => Math.floor(rnd() * 4))
      const b = Array.from({ length: Math.floor(rnd() * 12) }, () => Math.floor(rnd() * 4))
      const edits = myers(a, b)
      expect(apply(a, b, edits)).toEqual(b)
      // Minimality: edit distance (insert/delete only) = n + m - 2 * LCS.
      expect(cost(edits)).toBe(a.length + b.length - 2 * lcs(a, b))
    }
  })

  it('stays fast on large mostly-equal inputs', () => {
    const a = Array.from({ length: 20000 }, (_, i) => `line ${i}`)
    const b = [...a]
    b.splice(10000, 1, 'changed')
    const t0 = performance.now()
    expect(cost(myers(a, b))).toBe(2)
    expect(performance.now() - t0).toBeLessThan(500)
  })
})

function lcs<T>(a: T[], b: T[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i]![j] = a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
  return dp[a.length]![b.length]!
}

describe('splitLines', () => {
  it('handles all newline styles and a trailing newline', () => {
    expect(splitLines('a\r\nb\rc\nd\n')).toEqual(['a', 'b', 'c', 'd'])
    expect(splitLines('')).toEqual([])
    expect(splitLines('\n')).toEqual([''])
  })
})

describe('diffLines', () => {
  it('numbers lines on each side', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { op: 'equal', text: 'a', aLine: 1, bLine: 1 },
      { op: 'delete', text: 'b', aLine: 2 },
      { op: 'insert', text: 'x', bLine: 2 },
      { op: 'equal', text: 'c', aLine: 3, bLine: 3 },
    ])
  })

  it('can ignore whitespace and case', () => {
    expect(diffStats(diffLines('a  b\nC', 'a b \nc')).unchanged).toBe(0)
    expect(diffStats(diffLines('a  b\nC', 'a b \nc', { ignoreWhitespace: true, ignoreCase: true }))).toEqual({
      added: 0,
      removed: 0,
      unchanged: 2,
    })
  })

  it('treats CRLF and LF files as equal', () => {
    expect(diffStats(diffLines('a\r\nb\r\n', 'a\nb\n')).unchanged).toBe(2)
  })
})

describe('unifiedDiff', () => {
  it('matches git-style output with context', () => {
    const nums = Array.from({ length: 14 }, (_, i) => String(i + 1))
    const a = nums.join('\n')
    const b = [...nums.slice(0, 3), 'four', ...nums.slice(4), '15'].join('\n')
    expect(unifiedDiff(diffLines(a, b), 3, 'old.txt', 'new.txt')).toBe(
      [
        '--- old.txt',
        '+++ new.txt',
        '@@ -1,7 +1,7 @@',
        ' 1',
        ' 2',
        ' 3',
        '-4',
        '+four',
        ' 5',
        ' 6',
        ' 7',
        '@@ -12,3 +12,4 @@',
        ' 12',
        ' 13',
        ' 14',
        '+15',
        '',
      ].join('\n'),
    )
  })

  it('joins hunks whose context would touch, like git', () => {
    const nums = Array.from({ length: 10 }, (_, i) => String(i + 1))
    const b = [...nums.slice(0, 3), 'four', ...nums.slice(4), '11']
    const out = unifiedDiff(diffLines(nums.join('\n'), b.join('\n')))
    expect(out.match(/@@ [^@]+ @@/g)).toEqual(['@@ -1,10 +1,11 @@'])
  })

  it('merges nearby hunks', () => {
    const a = 'a\nb\nc\nd\ne'
    const b = 'A\nb\nc\nd\nE'
    expect(unifiedDiff(diffLines(a, b), 3).match(/@@/g)).toHaveLength(2)
  })

  it('uses a zero start line for pure insertions into an empty file', () => {
    expect(unifiedDiff(diffLines('', 'x\ny'))).toBe('--- a\n+++ b\n@@ -0,0 +1,2 @@\n+x\n+y\n')
  })

  it('returns an empty string when nothing changed', () => {
    expect(unifiedDiff(diffLines('same', 'same'))).toBe('')
  })
})

describe('diffWords', () => {
  it('highlights changed words inside a line', () => {
    expect(diffWords('the quick brown fox', 'the slow brown fox')).toEqual([
      { op: 'equal', text: 'the ' },
      { op: 'delete', text: 'quick' },
      { op: 'insert', text: 'slow' },
      { op: 'equal', text: ' brown fox' },
    ])
  })

  it('reconstructs both sides', () => {
    const a = 'let x = foo(1, 2);'
    const b = 'const x = foo(1, 3); // changed'
    const parts = diffWords(a, b)
    expect(parts.filter((p) => p.op !== 'insert').map((p) => p.text).join('')).toBe(a)
    expect(parts.filter((p) => p.op !== 'delete').map((p) => p.text).join('')).toBe(b)
  })
})

describe('toSideBySide', () => {
  it('pairs deletions with insertions', () => {
    const rows = toSideBySide(diffLines('a\nb\nc\nd', 'a\nB\nd\ne'))
    expect(rows.map((r) => [r.left?.text ?? null, r.right?.text ?? null])).toEqual([
      ['a', 'a'],
      ['b', 'B'],
      ['c', null],
      ['d', 'd'],
      [null, 'e'],
    ])
  })
})
