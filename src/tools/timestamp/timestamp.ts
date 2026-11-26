/* Unix timestamp <-> date conversion with IANA time zones (via Intl). */

export class TimestampError extends Error {}

export type TimeUnit = 's' | 'ms' | 'us' | 'ns'

export interface ParsedInstant {
  /** Milliseconds since the epoch (may be fractional for us/ns input). */
  ms: number
  source: 'unix' | 'iso' | 'now'
  unit?: TimeUnit
  note?: string
}

const UNIT_DIVISOR: Record<TimeUnit, number> = { s: 1e-3, ms: 1, us: 1e3, ns: 1e6 }

/** Guess the unit of a numeric timestamp from its magnitude. */
export function detectUnit(value: number): TimeUnit {
  const abs = Math.abs(value)
  if (abs < 1e11) return 's' // up to year 5138 in seconds
  if (abs < 1e14) return 'ms'
  if (abs < 1e17) return 'us'
  return 'ns'
}

// ISO 8601 / RFC 3339 subset: date, optional time, optional fraction, optional zone.
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i

export const MAX_DATE_MS = 8.64e15

/** Date.UTC that does not map years 0-99 to 1900-1999. */
export function utc(year: number, monthIndex: number, day: number, hour = 0, minute = 0, second = 0): number {
  const d = new Date(0)
  // Unlike Date.UTC, setUTCFullYear takes the year literally; both normalise overflowing fields.
  d.setUTCFullYear(year, monthIndex, day)
  d.setUTCHours(hour, minute, second, 0)
  return d.getTime()
}

export function parseInstant(input: string, unit: TimeUnit | 'auto' = 'auto', now: () => number = Date.now): ParsedInstant {
  const s = input.trim()
  if (s === '') throw new TimestampError('Enter a Unix timestamp or an ISO 8601 date.')
  if (s.toLowerCase() === 'now') return { ms: now(), source: 'now' }

  if (/^[+-]?\d+(\.\d+)?$/.test(s)) {
    const value = Number(s)
    const u = unit === 'auto' ? detectUnit(value) : unit
    // BigInt keeps nanosecond inputs exact before scaling down.
    const ms = /^[+-]?\d+$/.test(s) && (u === 'us' || u === 'ns') ? Number(BigInt(s)) / UNIT_DIVISOR[u] : value / UNIT_DIVISOR[u]
    if (Math.abs(ms) > MAX_DATE_MS) throw new TimestampError('That timestamp is outside the range JavaScript dates support (about 275,000 years).')
    const note = unit === 'auto' ? `Interpreted as ${UNIT_LABELS[u]} based on its size.` : undefined
    return { ms, source: 'unix', unit: u, note }
  }

  const m = ISO_RE.exec(s)
  if (!m) {
    throw new TimestampError('Unrecognised format. Use digits for a Unix timestamp, or ISO 8601 like 2026-03-29T14:30:00Z.')
  }
  const [, y, mo, d, h = '0', mi = '0', sec = '0', frac = '', zone] = m
  const fields = [Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(sec)] as const
  if (fields[1] < 1 || fields[1] > 12) throw new TimestampError(`Month ${fields[1]} is out of range (01-12).`)
  const dim = new Date(utc(fields[0], fields[1], 0)).getUTCDate()
  if (fields[2] < 1 || fields[2] > dim) throw new TimestampError(`Day ${fields[2]} does not exist in ${y}-${mo} (it has ${dim} days).`)
  if (fields[3] > 23) throw new TimestampError(`Hour ${fields[3]} is out of range (00-23).`)
  if (fields[4] > 59) throw new TimestampError(`Minute ${fields[4]} is out of range (00-59).`)
  if (fields[5] > 59) throw new TimestampError(`Second ${fields[5]} is out of range (00-59); leap seconds are not representable.`)
  const fracMs = frac ? Number(`0.${frac}`) * 1000 : 0
  const wall = utc(fields[0], fields[1] - 1, fields[2], fields[3], fields[4], fields[5]) + fracMs
  if (!zone) {
    const local = new Date(fields[0], fields[1] - 1, fields[2], fields[3], fields[4], fields[5], fracMs)
    local.setFullYear(fields[0]) // the Date constructor maps years 0-99 to 1900-1999
    return { ms: local.getTime(), source: 'iso', note: 'No offset given, so it was read as local time.' }
  }
  if (zone.toUpperCase() === 'Z') return { ms: wall, source: 'iso' }
  const zm = /^([+-])(\d{2}):?(\d{2})$/.exec(zone)!
  const offsetMin = (zm[1] === '-' ? -1 : 1) * (Number(zm[2]) * 60 + Number(zm[3]))
  if (Math.abs(offsetMin) > 18 * 60) throw new TimestampError(`Offset ${zone} is out of range (max +/-18:00).`)
  return { ms: wall - offsetMin * 60_000, source: 'iso' }
}

export const UNIT_LABELS: Record<TimeUnit, string> = { s: 'seconds', ms: 'milliseconds', us: 'microseconds', ns: 'nanoseconds' }

/* ----------------------------- zones ---------------------------------- */

export interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const partsCache = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        era: 'short',
      })
    } catch {
      throw new TimestampError(`Unknown time zone "${timeZone}".`)
    }
    partsCache.set(timeZone, f)
  }
  return f
}

export function isValidZone(timeZone: string): boolean {
  try {
    formatter(timeZone)
    return true
  } catch {
    return false
  }
}

export function wallClock(ms: number, timeZone: string): WallClock {
  const parts = formatter(timeZone).formatToParts(new Date(ms))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const era = parts.find((p) => p.type === 'era')?.value
  const year = era === 'BC' || era === 'B' ? 1 - get('year') : get('year')
  return { year, month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

/** UTC offset of `timeZone` at instant `ms`, in minutes (e.g. +60 for CET). */
export function zoneOffsetMinutes(ms: number, timeZone: string): number {
  const w = wallClock(ms, timeZone)
  const asUtc = utc(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000)
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

const p2 = (n: number) => String(n).padStart(2, '0')

/** ISO 8601 with the zone's offset, e.g. 2026-03-29T03:30:00+02:00. */
export function formatInZone(ms: number, timeZone: string): string {
  const w = wallClock(ms, timeZone)
  const yr = w.year < 0 || w.year > 9999 ? `${w.year < 0 ? '-' : '+'}${String(Math.abs(w.year)).padStart(6, '0')}` : String(w.year).padStart(4, '0')
  const off = zoneOffsetMinutes(ms, timeZone)
  return `${yr}-${p2(w.month)}-${p2(w.day)}T${p2(w.hour)}:${p2(w.minute)}:${p2(w.second)}${off === 0 && timeZone === 'UTC' ? 'Z' : formatOffset(off)}`
}

export type ZonedResolution =
  | { kind: 'exact'; ms: number }
  | { kind: 'ambiguous'; earlier: number; later: number }
  | { kind: 'gap'; before: number; after: number }

/**
 * Convert a wall-clock time in `timeZone` to an instant. Handles DST:
 * times that occur twice are "ambiguous", times that are skipped are a "gap".
 */
export function zonedToInstant(w: WallClock, timeZone: string): ZonedResolution {
  const guess = utc(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  const offsets = new Set([zoneOffsetMinutes(guess - 86_400_000, timeZone), zoneOffsetMinutes(guess, timeZone), zoneOffsetMinutes(guess + 86_400_000, timeZone)])
  const matches: number[] = []
  for (const off of offsets) {
    const t = guess - off * 60_000
    const back = wallClock(t, timeZone)
    if (back.year === w.year && back.month === w.month && back.day === w.day && back.hour === w.hour && back.minute === w.minute && back.second === w.second) {
      matches.push(t)
    }
  }
  matches.sort((a, b) => a - b)
  if (matches.length === 1) return { kind: 'exact', ms: matches[0]! }
  if (matches.length >= 2) return { kind: 'ambiguous', earlier: matches[0]!, later: matches[matches.length - 1]! }
  const sorted = [...offsets].sort((a, b) => a - b)
  return { kind: 'gap', before: guess - sorted[0]! * 60_000, after: guess - sorted[sorted.length - 1]! * 60_000 }
}

export function parseWallClock(value: string): WallClock {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!m) throw new TimestampError('Enter a date and time.')
  return { year: +m[1]!, month: +m[2]!, day: +m[3]!, hour: +m[4]!, minute: +m[5]!, second: +(m[6] ?? 0) }
}
