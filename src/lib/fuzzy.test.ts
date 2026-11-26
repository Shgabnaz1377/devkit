import { describe, expect, it } from 'vitest'
import { fuzzyMatch, fuzzyRank } from './fuzzy'

describe('fuzzyMatch', () => {
  it('matches subsequences and reports indices', () => {
    const m = fuzzyMatch('jwt', 'JWT decoder')
    expect(m).not.toBeNull()
    expect(m!.indices).toEqual([0, 1, 2])
  })

  it('returns null when characters are missing or out of order', () => {
    expect(fuzzyMatch('xyz', 'JSON formatter')).toBeNull()
    expect(fuzzyMatch('nosj', 'json')).toBeNull()
  })

  it('treats an empty query as a neutral match', () => {
    expect(fuzzyMatch('   ', 'anything')).toEqual({ score: 0, indices: [] })
  })

  it('is case-insensitive', () => {
    expect(fuzzyMatch('UUID', 'uuid generator')).not.toBeNull()
  })

  it('prefers prefix and word-boundary matches over scattered ones', () => {
    const prefix = fuzzyMatch('hash', 'Hash generator')!
    const scattered = fuzzyMatch('hash', 'The anchor shown here')!
    expect(prefix.score).toBeGreaterThan(scattered.score)
  })

  it('ignores spaces in the query', () => {
    expect(fuzzyMatch('json diff', 'JSON diff')).not.toBeNull()
    expect(fuzzyMatch('js df', 'JSON diff')).not.toBeNull()
  })
})

describe('fuzzyRank', () => {
  const items = [
    { label: 'JSON formatter', keywords: ['pretty print', 'validate'] },
    { label: 'JSON diff', keywords: ['compare'] },
    { label: 'Regex tester', keywords: ['regular expression'] },
  ]

  it('returns everything, in order, for an empty query', () => {
    expect(fuzzyRank('', items).map((r) => r.item.label)).toEqual([
      'JSON formatter',
      'JSON diff',
      'Regex tester',
    ])
  })

  it('filters and ranks by label', () => {
    const ranked = fuzzyRank('json d', items).map((r) => r.item.label)
    expect(ranked[0]).toBe('JSON diff')
    expect(ranked).not.toContain('Regex tester')
  })

  it('falls back to keywords', () => {
    expect(fuzzyRank('compare', items).map((r) => r.item.label)).toEqual(['JSON diff'])
    expect(fuzzyRank('regular', items)[0]!.item.label).toBe('Regex tester')
  })
})
