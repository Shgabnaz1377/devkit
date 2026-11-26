/// <reference lib="webworker" />
// Runs user-supplied regexes off the main thread so catastrophic backtracking
// cannot freeze the page; the UI terminates this worker after a timeout.
import { findMatches, replaceAll, type MatchResult } from './regex'

export interface RegexJob {
  id: number
  pattern: string
  flags: string
  text: string
  replacement: string | null
}

export type RegexJobResult =
  | { id: number; ok: true; result: MatchResult; replaced: string | null; ms: number }
  | { id: number; ok: false; error: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (event: MessageEvent<RegexJob>) => {
  const { id, pattern, flags, text, replacement } = event.data
  const started = performance.now()
  let reply: RegexJobResult
  try {
    const result = findMatches(pattern, flags, text)
    const replaced = replacement === null ? null : replaceAll(pattern, flags, text, replacement)
    reply = { id, ok: true, result, replaced, ms: performance.now() - started }
  } catch (e) {
    reply = { id, ok: false, error: (e as Error).message }
  }
  ctx.postMessage(reply)
}
