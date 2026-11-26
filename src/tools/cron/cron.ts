/*
 * Standard 5-field cron (Vixie / POSIX semantics):
 *   minute hour day-of-month month day-of-week
 * Supports *, lists, ranges, steps, month/day names, 7 as Sunday, `?` as an
 * alias for * in the day fields, and the @hourly/@daily/... macros. When both
 * day-of-month and day-of-week are restricted, a day matches if EITHER does.
 */

export class CronError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CronError'
  }
}

export type FieldName = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek'

interface FieldSpec {
  name: FieldName
  label: string
  min: number
  max: number
  names?: readonly string[]
}

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

export const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const FIELDS: readonly FieldSpec[] = [
  { name: 'minute', label: 'minute', min: 0, max: 59 },
  { name: 'hour', label: 'hour', min: 0, max: 23 },
  { name: 'dayOfMonth', label: 'day-of-month', min: 1, max: 31 },
  { name: 'month', label: 'month', min: 1, max: 12, names: MONTH_NAMES },
  { name: 'dayOfWeek', label: 'day-of-week', min: 0, max: 7, names: DAY_NAMES },
]

export const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
}

/** One comma-separated element of a field, e.g. `1-5`, `*\/15`, `MON`. */
export interface CronPart {
  start: number
  end: number
  step: number
  /** True when written as `*` or `*\/n`. */
  wildcard: boolean
}

export interface CronField {
  raw: string
  parts: CronPart[]
  values: Set<number>
  /** The field is an unrestricted `*` (or `?`). */
  any: boolean
}

export interface CronSchedule {
  source: string
  /** The 5-field expression after macro expansion. */
  expression: string
  minute: CronField
  hour: CronField
  dayOfMonth: CronField
  month: CronField
  dayOfWeek: CronField
}

function parseNumber(token: string, spec: FieldSpec): number {
  if (/^\d+$/.test(token)) {
    const n = Number(token)
    if (n < spec.min || n > spec.max) {
      throw new CronError(`${spec.label} value ${n} is out of range (${spec.min}-${spec.max}).`)
    }
    return n
  }
  const upper = token.toUpperCase()
  const idx = spec.names?.indexOf(upper) ?? -1
  if (idx >= 0) return spec.name === 'month' ? idx + 1 : idx
  if (/[LW#]/i.test(token) && (spec.name === 'dayOfMonth' || spec.name === 'dayOfWeek')) {
    throw new CronError(`"${token}" uses Quartz-only syntax (L, W or #), which standard cron does not support.`)
  }
  const hint = spec.names ? ` Use a number or a name like ${spec.names.slice(0, 3).join(', ')}.` : ''
  throw new CronError(`Invalid ${spec.label} value "${token}".${hint}`)
}

function parseField(raw: string, spec: FieldSpec): CronField {
  const values = new Set<number>()
  const parts: CronPart[] = []
  if (raw === '') throw new CronError(`The ${spec.label} field is empty.`)
  for (const item of raw.split(',')) {
    if (item === '') throw new CronError(`The ${spec.label} field "${raw}" has an empty list item.`)
    const [rangeText, stepText, extra] = item.split('/')
    if (extra !== undefined) throw new CronError(`"${item}" in ${spec.label} has more than one "/".`)
    let step = 1
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText)) throw new CronError(`Step "${stepText}" in ${spec.label} must be a positive whole number.`)
      step = Number(stepText)
      if (step === 0) throw new CronError(`Step 0 in ${spec.label} would never advance; use 1 or more.`)
    }
    let start: number
    let end: number
    let wildcard = false
    if (rangeText === '*' || (rangeText === '?' && (spec.name === 'dayOfMonth' || spec.name === 'dayOfWeek'))) {
      start = spec.min
      end = spec.name === 'dayOfWeek' ? 6 : spec.max
      wildcard = true
    } else if (rangeText === undefined || rangeText === '') {
      throw new CronError(`"${item}" in ${spec.label} is missing a value before "/".`)
    } else if (rangeText.includes('-')) {
      const [a, b, more] = rangeText.split('-')
      if (more !== undefined || !a || !b) throw new CronError(`Invalid range "${rangeText}" in ${spec.label}.`)
      start = parseNumber(a, spec)
      end = parseNumber(b, spec)
      if (start > end) {
        throw new CronError(`Range ${rangeText} in ${spec.label} goes backwards; write it as ${b}-${a} or split it into a list.`)
      }
    } else {
      start = parseNumber(rangeText, spec)
      // `5/15` means "from 5 to the end, every 15".
      end = stepText !== undefined ? (spec.name === 'dayOfWeek' ? 6 : spec.max) : start
    }
    parts.push({ start, end, step, wildcard })
    for (let v = start; v <= end; v += step) values.add(spec.name === 'dayOfWeek' && v === 7 ? 0 : v)
  }
  const any = parts.length === 1 && parts[0]!.wildcard && parts[0]!.step === 1
  return { raw, parts, values, any }
}

export function parseCron(source: string): CronSchedule {
  const trimmed = source.trim().replace(/\s+/g, ' ')
  if (trimmed === '') throw new CronError('Enter a cron expression, e.g. "*/15 9-17 * * MON-FRI".')
  let expression = trimmed
  if (trimmed.startsWith('@')) {
    const macro = MACROS[trimmed.toLowerCase()]
    if (trimmed.toLowerCase() === '@reboot') throw new CronError('@reboot runs once at startup; it has no time-based schedule.')
    if (!macro) throw new CronError(`Unknown macro "${trimmed}". Supported: ${Object.keys(MACROS).join(', ')}.`)
    expression = macro
  }
  const tokens = expression.split(' ')
  if (tokens.length !== 5) {
    const extra =
      tokens.length === 6
        ? ' Six fields usually means a seconds (Quartz/Spring) or year field, which standard cron does not have.'
        : ''
    throw new CronError(`Expected 5 fields (minute hour day-of-month month day-of-week) but found ${tokens.length}.${extra}`)
  }
  const fields = tokens.map((t, i) => parseField(t, FIELDS[i]!))
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [CronField, CronField, CronField, CronField, CronField]
  const schedule: CronSchedule = { source: trimmed, expression, minute, hour, dayOfMonth, month, dayOfWeek }
  assertCanRun(schedule)
  return schedule
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Reject schedules like "0 0 30 2 *" that can never fire. */
function assertCanRun(s: CronSchedule): void {
  if (!s.dayOfMonth.any && s.dayOfWeek.any) {
    const possible = [...s.month.values].some((m) => [...s.dayOfMonth.values].some((d) => d <= DAYS_IN_MONTH[m - 1]!))
    if (!possible) {
      throw new CronError('This schedule never runs: none of the selected days exist in the selected months.')
    }
  }
}

/* ----------------------------- next runs ----------------------------- */

export type CronZone = 'local' | 'UTC'

interface Clock {
  get(d: Date): { y: number; mo: number; d: number; h: number; mi: number; dow: number }
  make(y: number, mo: number, d: number, h: number, mi: number): Date
}

const clocks: Record<CronZone, Clock> = {
  UTC: {
    get: (d) => ({ y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() }),
    make: (y, mo, d, h, mi) => new Date(Date.UTC(y, mo, d, h, mi)),
  },
  local: {
    get: (d) => ({ y: d.getFullYear(), mo: d.getMonth(), d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), dow: d.getDay() }),
    make: (y, mo, d, h, mi) => new Date(y, mo, d, h, mi),
  },
}

function dayMatches(s: CronSchedule, dom: number, dow: number): boolean {
  const domOk = s.dayOfMonth.values.has(dom)
  const dowOk = s.dayOfWeek.values.has(dow)
  // A field counts as restricted unless it starts with "*" (Vixie cron rule).
  const domRestricted = !s.dayOfMonth.parts[0]!.wildcard
  const dowRestricted = !s.dayOfWeek.parts[0]!.wildcard
  if (domRestricted && dowRestricted) return domOk || dowOk
  return domOk && dowOk
}

/**
 * The next `count` run times strictly after `from`. Advances by whole
 * months/days/hours when a coarser field does not match, so even rare
 * schedules (Feb 29 on a Monday) resolve quickly.
 */
export function nextRuns(s: CronSchedule, from: Date, count: number, zone: CronZone = 'local'): Date[] {
  const clock = clocks[zone]
  const runs: Date[] = []
  const start = clock.get(new Date(from.getTime() + 60_000))
  let t = clock.make(start.y, start.mo, start.d, start.h, start.mi)
  const limit = from.getTime() + 28 * 366 * 86400_000 // a full leap-year/weekday cycle
  let guard = 0
  while (runs.length < count && t.getTime() <= limit && guard++ < 500_000) {
    const c = clock.get(t)
    if (!s.month.values.has(c.mo + 1)) {
      t = clock.make(c.y, c.mo + 1, 1, 0, 0)
      continue
    }
    if (!dayMatches(s, c.d, c.dow)) {
      t = clock.make(c.y, c.mo, c.d + 1, 0, 0)
      continue
    }
    if (!s.hour.values.has(c.h)) {
      const next = clock.make(c.y, c.mo, c.d, c.h + 1, 0)
      // Guard against DST: never move backwards.
      t = next.getTime() > t.getTime() ? next : new Date(t.getTime() + 3600_000)
      continue
    }
    if (!s.minute.values.has(c.mi)) {
      t = new Date(t.getTime() + 60_000)
      continue
    }
    if (runs.length === 0 || runs[runs.length - 1]!.getTime() !== t.getTime()) runs.push(t)
    t = new Date(t.getTime() + 60_000)
  }
  return runs
}

/* ----------------------------- description --------------------------- */

function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

function joinList(items: string[], conj = 'and'): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`
}

const pad = (n: number) => String(n).padStart(2, '0')

function valueLabel(name: FieldName, v: number): string {
  if (name === 'month') return MONTH_LABELS[v - 1] ?? String(v)
  if (name === 'dayOfWeek') return DAY_LABELS[v % 7] ?? String(v)
  return String(v)
}

function describePart(name: FieldName, p: CronPart, unit: string): string {
  const fullRange = p.wildcard
  if (p.step > 1) {
    const every = `every ${ordinal(p.step)} ${unit}`
    if (fullRange) return every
    const max = name === 'dayOfWeek' ? 6 : FIELDS.find((f) => f.name === name)!.max
    return p.end === max && p.start !== p.end
      ? `${every} from ${valueLabel(name, p.start)}`
      : `${every} from ${valueLabel(name, p.start)} through ${valueLabel(name, p.end)}`
  }
  if (fullRange) return `every ${unit}`
  if (p.start === p.end) return valueLabel(name, p.start)
  return `every ${unit} from ${valueLabel(name, p.start)} through ${valueLabel(name, p.end)}`
}

function describeField(field: CronField, name: FieldName, unit: string, prefix: string): string {
  const singles = field.parts.every((p) => p.start === p.end && p.step === 1 && !p.wildcard)
  if (singles) {
    const labels = field.parts.map((p) => valueLabel(name, p.start))
    const noun = name === 'dayOfWeek' || name === 'month' ? '' : `${unit}${labels.length > 1 && name !== 'dayOfMonth' ? 's' : ''} `
    return `${prefix} ${noun}${joinList(labels)}`
  }
  return `${prefix} ${joinList(field.parts.map((p) => describePart(name, p, unit)))}`
}

/** Plain-English explanation, e.g. "At 09:00 on Monday through Friday". */
export function describeCron(s: CronSchedule): string {
  const { minute, hour, dayOfMonth, month, dayOfWeek } = s
  const singleValues = (f: CronField) => f.parts.every((p) => p.start === p.end && !p.wildcard)
  let time: string

  if (singleValues(minute) && singleValues(hour) && minute.values.size === 1) {
    const m = [...minute.values][0]!
    const hours = [...hour.values].sort((a, b) => a - b)
    time = `At ${joinList(hours.map((h) => `${pad(h)}:${pad(m)}`))}`
  } else {
    const minutePart = minute.any ? 'Every minute' : describeField(minute, 'minute', 'minute', 'At')
    const hourPart = hour.any ? '' : ` ${describeField(hour, 'hour', 'hour', 'past')}`
    time = minutePart + hourPart
  }

  const dayBits: string[] = []
  const domRestricted = !dayOfMonth.parts[0]!.wildcard || !dayOfMonth.any
  const dowRestricted = !dayOfWeek.parts[0]!.wildcard || !dayOfWeek.any
  const domText = domRestricted ? describeField(dayOfMonth, 'dayOfMonth', 'day-of-month', 'on') : ''
  const dowText = dowRestricted
    ? describeField(dayOfWeek, 'dayOfWeek', 'day-of-week', 'on').replace(/every day-of-week from (\w+) through (\w+)/, '$1 through $2')
    : ''
  if (domText && dowText && !dayOfMonth.parts[0]!.wildcard && !dayOfWeek.parts[0]!.wildcard) {
    dayBits.push(`${domText} or ${dowText}`)
  } else {
    if (domText) dayBits.push(domText)
    if (dowText) dayBits.push(dowText)
  }
  const monthText = month.any ? '' : describeField(month, 'month', 'month', 'in').replace(/every month from (\w+) through (\w+)/, '$1 through $2')
  return [time, ...dayBits, monthText].filter(Boolean).join(' ') + '.'
}

export const CRON_EXAMPLES: readonly { expr: string; label: string }[] = [
  { expr: '*/15 * * * *', label: 'Every 15 minutes' },
  { expr: '0 9 * * MON-FRI', label: 'Weekdays at 09:00' },
  { expr: '30 2 1 * *', label: 'Monthly, 1st at 02:30' },
  { expr: '0 */6 * * *', label: 'Every 6 hours' },
  { expr: '0 0 29 2 *', label: 'Leap days only' },
  { expr: '@weekly', label: '@weekly macro' },
]
