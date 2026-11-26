/**
 * Small subsequence-based fuzzy matcher used by the command palette.
 *
 * Scoring rewards (in order of weight): an exact prefix, matches at word
 * boundaries, consecutive runs of matched characters, and shorter targets.
 * Returns `null` when `query` is not a subsequence of `target`.
 */
export interface FuzzyMatch {
  score: number
  /** Indexes into `target` of the matched characters, for highlighting. */
  indices: number[]
}

const BOUNDARY = /[\s\-_/.:]/

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase()
  const t = target.toLowerCase()
  if (q.length === 0) return { score: 0, indices: [] }

  const indices: number[] = []
  let score = 0
  let ti = 0
  let prevMatch = -2

  for (const ch of q) {
    // Spaces in the query are separators, not characters to match.
    if (ch === ' ') continue
    let found = -1
    while (ti < t.length) {
      if (t[ti] === ch) {
        found = ti
        break
      }
      ti++
    }
    if (found === -1) return null

    let charScore = 1
    if (found === 0) charScore += 8
    else if (BOUNDARY.test(t[found - 1] ?? '')) charScore += 5
    if (found === prevMatch + 1) charScore += 4
    score += charScore
    indices.push(found)
    prevMatch = found
    ti = found + 1
  }

  if (t.startsWith(q)) score += 20
  // Mild preference for shorter targets so "JSON" beats "JSON diff" for "json".
  score -= t.length * 0.05
  return { score, indices }
}

export interface Searchable {
  /** Primary label, used for highlighting. */
  label: string
  /** Extra words that should also match (aliases, description). */
  keywords?: readonly string[]
}

export interface RankedResult<T> {
  item: T
  score: number
  indices: number[]
}

/** Rank items by the best match over their label and keywords. */
export function fuzzyRank<T extends Searchable>(query: string, items: readonly T[]): RankedResult<T>[] {
  if (query.trim() === '') return items.map((item) => ({ item, score: 0, indices: [] }))
  const results: RankedResult<T>[] = []
  for (const item of items) {
    const labelMatch = fuzzyMatch(query, item.label)
    let best: RankedResult<T> | null = labelMatch
      ? { item, score: labelMatch.score + 10, indices: labelMatch.indices }
      : null
    for (const kw of item.keywords ?? []) {
      const m = fuzzyMatch(query, kw)
      if (m && (!best || m.score > best.score)) best = { item, score: m.score, indices: [] }
    }
    if (best) results.push(best)
  }
  return results.sort((a, b) => b.score - a.score)
}
