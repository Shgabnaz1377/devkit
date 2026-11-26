/* Base64, URL and HTML-entity encoding with precise error reporting. */

export class EncodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EncodeError'
  }
}

const utf8 = new TextEncoder()

export function bytesToHex(bytes: Uint8Array, separator = ''): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(separator)
}

/* ------------------------------- Base64 ------------------------------ */

export interface Base64Options {
  urlSafe?: boolean
  padding?: boolean
}

export function base64EncodeBytes(bytes: Uint8Array, { urlSafe = false, padding = true }: Base64Options = {}): string {
  let bin = ''
  // Chunk to stay well below argument limits for large inputs.
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  let out = btoa(bin)
  if (urlSafe) out = out.replace(/\+/g, '-').replace(/\//g, '_')
  if (!padding) out = out.replace(/=+$/, '')
  return out
}

export function base64Encode(text: string, options: Base64Options = {}): string {
  return base64EncodeBytes(utf8.encode(text), options)
}

/** Decode standard or URL-safe Base64; whitespace and missing padding are tolerated. */
export function base64DecodeBytes(input: string): Uint8Array {
  const compact = input.replace(/\s+/g, '')
  const bad = /[^A-Za-z0-9+/\-_=]/.exec(compact)
  if (bad) {
    const pos = input.indexOf(bad[0])
    throw new EncodeError(`Invalid Base64 character "${bad[0]}" at position ${pos + 1}.`)
  }
  if (/[+/]/.test(compact) && /[-_]/.test(compact)) {
    throw new EncodeError('The input mixes standard (+ /) and URL-safe (- _) Base64 alphabets.')
  }
  const firstPad = compact.indexOf('=')
  if (firstPad !== -1 && !/^=+$/.test(compact.slice(firstPad))) {
    throw new EncodeError('Padding "=" may only appear at the end.')
  }
  const body = compact.replace(/=+$/, '')
  if (compact.length - body.length > 2) throw new EncodeError('Too much "=" padding (at most two).')
  if (body.length % 4 === 1) {
    throw new EncodeError(`Invalid Base64 length: ${body.length} characters cannot encode whole bytes (one character too many or too few).`)
  }
  const std = body.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export type DecodedText = { kind: 'text'; text: string } | { kind: 'binary'; hex: string; length: number }

export function base64Decode(input: string): DecodedText {
  const bytes = base64DecodeBytes(input)
  try {
    return { kind: 'text', text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    return { kind: 'binary', hex: bytesToHex(bytes, ' '), length: bytes.length }
  }
}

/* --------------------------------- URL -------------------------------- */

export type UrlMode = 'component' | 'uri' | 'form'

export function urlEncode(text: string, mode: UrlMode = 'component'): string {
  try {
    if (mode === 'uri') return encodeURI(text)
    const enc = encodeURIComponent(text)
    // application/x-www-form-urlencoded: spaces become "+", and !'()* are escaped too.
    return mode === 'form'
      ? enc.replace(/%20/g, '+').replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
      : enc
  } catch {
    throw new EncodeError('The text contains an unpaired surrogate (a broken emoji or similar), which cannot be URL-encoded.')
  }
}

export function urlDecode(text: string, mode: UrlMode = 'component'): string {
  const source = mode === 'form' ? text.replace(/\+/g, ' ') : text
  const badEscape = /%(?![0-9A-Fa-f]{2})/.exec(source)
  if (badEscape) {
    throw new EncodeError(`Malformed escape at position ${badEscape.index + 1}: "%" must be followed by two hex digits.`)
  }
  try {
    return mode === 'uri' ? decodeURI(source) : decodeURIComponent(source)
  } catch {
    const seq = /(%[0-9A-Fa-f]{2})+/.exec(source)?.[0] ?? ''
    throw new EncodeError(`The percent-escapes do not form valid UTF-8${seq ? ` (near "${seq.slice(0, 24)}")` : ''}.`)
  }
}

/* -------------------------------- HTML -------------------------------- */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  laquo: '«', raquo: '»', bull: '•', middot: '·', deg: '°', plusmn: '±', times: '×',
  divide: '÷', euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', hearts: '♥', check: '✓', shy: '­',
  eacute: 'é', egrave: 'è', agrave: 'à', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß',
  ccedil: 'ç', ntilde: 'ñ',
}

export interface HtmlEncodeOptions {
  /** Also encode every non-ASCII character as a numeric reference. */
  nonAscii?: boolean
}

export function htmlEncode(text: string, { nonAscii = false }: HtmlEncodeOptions = {}): string {
  let out = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  if (nonAscii) out = out.replace(/[^\x20-\x7e\t\n\r]/gu, (ch) => `&#x${ch.codePointAt(0)!.toString(16).toUpperCase()};`)
  return out
}

export interface HtmlDecodeResult {
  text: string
  /** Entity-looking sequences that were left untouched. */
  unknown: string[]
}

export function htmlDecode(text: string): HtmlDecodeResult {
  const unknown: string[] = []
  const decoded = text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      // Per the HTML spec, invalid code points and surrogates decode to U+FFFD.
      if (!Number.isFinite(cp) || cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�'
      return String.fromCodePoint(cp)
    }
    const named = NAMED[body]
    if (named === undefined) {
      unknown.push(whole)
      return whole
    }
    return named
  })
  return { text: decoded, unknown: [...new Set(unknown)] }
}
