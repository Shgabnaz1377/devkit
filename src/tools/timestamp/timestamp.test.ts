import { describe, expect, it } from 'vitest'
import {
  TimestampError,
  detectUnit,
  formatInZone,
  formatOffset,
  isValidZone,
  parseInstant,
  parseWallClock,
  utc,
  wallClock,
  zoneOffsetMinutes,
  zonedToInstant,
} from './timestamp'

const T = 1_774_000_000 // 2026-03-20T09:46:40Z

describe('detectUnit / parseInstant (numbers)', () => {
  it('detects seconds, milliseconds, microseconds and nanoseconds by magnitude', () => {
    expect(detectUnit(T)).toBe('s')
    expect(detectUnit(T * 1e3)).toBe('ms')
    expect(detectUnit(T * 1e6)).toBe('us')
    expect(detectUnit(T * 1e9)).toBe('ns')
  })

  it('converts every unit to the same instant', () => {
    for (const input of [`${T}`, `${T}000`, `${T}000000`, `${T}000000000`]) {
      expect(parseInstant(input).ms).toBe(T * 1000)
    }
    expect(new Date(parseInstant(`${T}`).ms).toISOString()).toBe('2026-03-20T09:46:40.000Z')
  })

  it('keeps sub-millisecond precision from nanoseconds', () => {
    expect(parseInstant('1774000000123456789').ms).toBeCloseTo(1774000000123.4568, 3)
  })

  it('honours an explicit unit', () => {
    expect(parseInstant('1000', 'ms').ms).toBe(1000)
    expect(parseInstant('1000', 's').ms).toBe(1_000_000)
  })

  it('handles zero, negatives and fractional seconds', () => {
    expect(parseInstant('0').ms).toBe(0)
    expect(new Date(parseInstant('-86400').ms).toISOString()).toBe('1969-12-31T00:00:00.000Z')
    expect(parseInstant('1.5', 's').ms).toBe(1500)
  })

  it('explains auto-detection', () => {
    expect(parseInstant(`${T}000`).note).toMatch(/milliseconds/)
  })

  it('supports "now" with an injectable clock', () => {
    expect(parseInstant('now', 'auto', () => 42).ms).toBe(42)
  })

  it('rejects values JavaScript dates cannot represent', () => {
    expect(() => parseInstant('9999999999999999', 'ms')).toThrow(/outside the range/)
  })
})

describe('parseInstant (ISO 8601)', () => {
  it('parses UTC and offset forms', () => {
    expect(parseInstant('2026-03-20T09:46:40Z').ms).toBe(T * 1000)
    expect(parseInstant('2026-03-20T10:46:40+01:00').ms).toBe(T * 1000)
    expect(parseInstant('2026-03-20T15:16:40+0530').ms).toBe(T * 1000)
    expect(parseInstant('2026-03-20 09:46:40.250Z').ms).toBe(T * 1000 + 250)
    expect(parseInstant('2026-03-20t09:46:40z').ms).toBe(T * 1000)
  })

  it('reads a missing offset as local time', () => {
    const r = parseInstant('2026-03-20T09:46:40')
    expect(r.note).toMatch(/local time/)
    expect(r.ms).toBe(new Date(2026, 2, 20, 9, 46, 40).getTime())
  })

  it('handles date-only input and years before 100', () => {
    expect(parseInstant('2026-03-20Z').ms).toBe(Date.UTC(2026, 2, 20))
    expect(new Date(parseInstant('0050-06-01T00:00:00Z').ms).getUTCFullYear()).toBe(50)
  })

  it.each([
    ['', /Enter a Unix timestamp/],
    ['yesterday', /Unrecognised format/],
    ['2026-13-01T00:00:00Z', /Month 13/],
    ['2026-02-29T00:00:00Z', /Day 29 does not exist in 2026-02 \(it has 28 days\)/],
    ['2026-01-01T24:00:00Z', /Hour 24/],
    ['2026-01-01T00:60:00Z', /Minute 60/],
    ['2026-01-01T00:00:60Z', /leap seconds/],
    ['2026-01-01T00:00:00+19:00', /out of range/],
  ])('rejects %j', (input, message) => {
    expect(() => parseInstant(input)).toThrow(TimestampError)
    expect(() => parseInstant(input)).toThrow(message)
  })

  it('accepts Feb 29 in leap years', () => {
    expect(() => parseInstant('2028-02-29T00:00:00Z')).not.toThrow()
  })
})

describe('utc', () => {
  it('does not remap two-digit years and normalises overflow', () => {
    expect(new Date(utc(5, 0, 1)).getUTCFullYear()).toBe(5)
    expect(utc(2026, 0, 32)).toBe(Date.UTC(2026, 1, 1))
    expect(utc(2026, 11, 31, 24)).toBe(Date.UTC(2027, 0, 1))
  })
})

describe('time zones', () => {
  const ms = T * 1000

  it('computes offsets, including half-hour and DST zones', () => {
    expect(zoneOffsetMinutes(ms, 'UTC')).toBe(0)
    expect(zoneOffsetMinutes(ms, 'Asia/Kolkata')).toBe(330)
    expect(zoneOffsetMinutes(ms, 'Europe/Rome')).toBe(60) // before DST starts on 29 March 2026
    expect(zoneOffsetMinutes(Date.UTC(2026, 6, 1), 'Europe/Rome')).toBe(120)
    expect(zoneOffsetMinutes(Date.UTC(2026, 6, 1), 'America/New_York')).toBe(-240)
    expect(zoneOffsetMinutes(Date.UTC(2026, 0, 15), 'Australia/Lord_Howe')).toBe(660)
  })

  it('formats ISO 8601 with the zone offset', () => {
    expect(formatInZone(ms, 'UTC')).toBe('2026-03-20T09:46:40Z')
    expect(formatInZone(ms, 'Asia/Kolkata')).toBe('2026-03-20T15:16:40+05:30')
    expect(formatInZone(ms, 'America/Los_Angeles')).toBe('2026-03-20T02:46:40-07:00')
  })

  it('formats offsets', () => {
    expect(formatOffset(0)).toBe('+00:00')
    expect(formatOffset(-570)).toBe('-09:30')
    expect(formatOffset(345)).toBe('+05:45')
  })

  it('reads wall clock fields', () => {
    expect(wallClock(ms, 'Asia/Tokyo')).toEqual({ year: 2026, month: 3, day: 20, hour: 18, minute: 46, second: 40 })
  })

  it('validates zone names', () => {
    expect(isValidZone('Europe/Rome')).toBe(true)
    expect(isValidZone('Mars/Olympus_Mons')).toBe(false)
  })
})

describe('zonedToInstant', () => {
  it('converts an ordinary wall-clock time', () => {
    expect(zonedToInstant(parseWallClock('2026-07-01T12:00'), 'Europe/Rome')).toEqual({ kind: 'exact', ms: Date.UTC(2026, 6, 1, 10) })
    expect(zonedToInstant(parseWallClock('2026-07-01T12:00:30'), 'UTC')).toEqual({ kind: 'exact', ms: Date.UTC(2026, 6, 1, 12, 0, 30) })
  })

  it('detects the spring-forward gap (02:30 does not exist in Rome on 29 March 2026)', () => {
    const r = zonedToInstant(parseWallClock('2026-03-29T02:30'), 'Europe/Rome')
    expect(r.kind).toBe('gap')
    if (r.kind === 'gap') {
      expect(new Date(r.after).toISOString()).toBe('2026-03-29T00:30:00.000Z')
      expect(new Date(r.before).toISOString()).toBe('2026-03-29T01:30:00.000Z')
    }
  })

  it('detects the fall-back overlap (02:30 happens twice in Rome on 25 October 2026)', () => {
    expect(zonedToInstant(parseWallClock('2026-10-25T02:30'), 'Europe/Rome')).toEqual({
      kind: 'ambiguous',
      earlier: Date.UTC(2026, 9, 25, 0, 30),
      later: Date.UTC(2026, 9, 25, 1, 30),
    })
  })

  it('handles New York DST transitions', () => {
    expect(zonedToInstant(parseWallClock('2026-03-08T02:15'), 'America/New_York').kind).toBe('gap')
    expect(zonedToInstant(parseWallClock('2026-11-01T01:15'), 'America/New_York').kind).toBe('ambiguous')
  })

  it('rejects incomplete wall-clock input', () => {
    expect(() => parseWallClock('2026-07-01')).toThrow(/date and time/)
  })
})
