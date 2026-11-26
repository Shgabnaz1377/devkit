/* Pure helpers for the regex tester. Matching itself runs in a worker. */

export const FLAG_INFO: Record<string, string> = {
  g: 'global: find all matches',
  i: 'ignore case',
  m: 'multiline: ^ and $ match at line breaks',
  s: 'dotAll: . also matches line breaks',
  u: 'unicode: code-point aware, stricter syntax',
  v: 'unicodeSets: u plus set operations in classes',
  y: 'sticky: match only at lastIndex',
  d: 'indices: record capture group positions',
}

export class RegexError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RegexError'
  }
}

export function validateFlags(flags: string): void {
  const seen = new Set<string>()
  for (const f of flags) {
    if (!(f in FLAG_INFO)) throw new RegexError(`Unknown flag "${f}". Valid flags: ${Object.keys(FLAG_INFO).join('')}.`)
    if (seen.has(f)) throw new RegexError(`Flag "${f}" is repeated.`)
    seen.add(f)
  }
  if (seen.has('u') && seen.has('v')) throw new RegexError('Flags "u" and "v" cannot be combined; "v" already implies Unicode mode.')
}

/**
 * Accepts either a bare pattern or a literal like `/ab+c/gi`; a literal's
 * flags are returned so the UI can adopt them.
 */
export function splitLiteral(input: string): { pattern: string; flags: string | null } {
  const m = /^\/([\s\S]+)\/([a-z]*)$/.exec(input)
  return m ? { pattern: m[1]!, flags: m[2]! } : { pattern: input, flags: null }
}

export function buildRegex(pattern: string, flags: string): RegExp {
  validateFlags(flags)
  if (pattern === '') throw new RegexError('Enter a pattern.')
  try {
    return new RegExp(pattern, flags)
  } catch (e) {
    // Engines prefix messages with "Invalid regular expression: /.../flags: "; keep the useful tail.
    const msg = (e as Error).message.replace(/^Invalid regular expression: \/[\s\S]*\/[a-z]*: /, '')
    throw new RegexError(`Invalid pattern: ${msg}`)
  }
}

export interface RegexMatch {
  index: number
  end: number
  text: string
  /** Numbered capture groups (1..n); undefined when a group did not participate. */
  groups: (string | undefined)[]
  named: Record<string, string | undefined>
}

export interface MatchResult {
  matches: RegexMatch[]
  truncated: boolean
}

/**
 * All matches, or just the first if the `g` flag is absent. Zero-length
 * matches are handled by matchAll, which advances lastIndex past them.
 */
export function findMatches(pattern: string, flags: string, text: string, limit = 1000): MatchResult {
  const global = flags.includes('g')
  const re = buildRegex(pattern, global ? flags : flags + 'g')
  const matches: RegexMatch[] = []
  for (const m of text.matchAll(re)) {
    matches.push({
      index: m.index,
      end: m.index + m[0].length,
      text: m[0],
      groups: m.slice(1),
      named: m.groups ? { ...m.groups } : {},
    })
    if (!global) break
    if (matches.length >= limit) return { matches, truncated: true }
  }
  return { matches, truncated: false }
}

export interface Segment {
  text: string
  /** Index into the matches array, or null for unmatched text. */
  match: number | null
}

/** Split text into alternating plain/matched segments for highlighting. */
export function segmentText(text: string, matches: readonly RegexMatch[]): Segment[] {
  const out: Segment[] = []
  let pos = 0
  matches.forEach((m, i) => {
    if (m.index > pos) out.push({ text: text.slice(pos, m.index), match: null })
    // Zero-length matches still get a (empty) segment so they can be shown as a caret.
    if (m.index >= pos) out.push({ text: m.text, match: i })
    pos = Math.max(pos, m.end)
  })
  if (pos < text.length) out.push({ text: text.slice(pos), match: null })
  return out
}

export function replaceAll(pattern: string, flags: string, text: string, replacement: string): string {
  return text.replace(buildRegex(pattern, flags), replacement)
}

/** Escape a literal string for use inside a regular expression. */
export function escapeRegex(literal: string): string {
  // "-" is deliberately not escaped: "\-" is a syntax error outside classes in unicode mode.
  return literal.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

/**
 * Map capture-group numbers to names by scanning the pattern source: skips
 * escapes and character classes, and ignores (?:), lookarounds and modifiers.
 */
export function groupNames(pattern: string): Map<number, string> {
  const names = new Map<number, string>()
  let n = 0
  let inClass = false
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (inClass) {
      if (ch === ']') inClass = false
      continue
    }
    if (ch === '[') {
      inClass = true
      continue
    }
    if (ch !== '(') continue
    if (pattern[i + 1] !== '?') {
      n++
      continue
    }
    const named = /^\?<([A-Za-z_$][\w$]*)>/.exec(pattern.slice(i + 1))
    if (named) names.set(++n, named[1]!)
  }
  return names
}
