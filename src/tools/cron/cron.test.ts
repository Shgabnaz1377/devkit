import { describe, expect, it } from 'vitest'
import { CronError, describeCron, nextRuns, parseCron } from './cron'

const iso = (dates: Date[]) => dates.map((d) => d.toISOString())
const from = new Date('2026-03-10T10:07:30Z') // a Tuesday

function runsUTC(expr: string, count = 5, start = from): string[] {
  return iso(nextRuns(parseCron(expr), start, count, 'UTC'))
}

describe('parseCron', () => {
  it('expands lists, ranges and steps', () => {
    const s = parseCron('0,30 9-17/4 */10 JAN-MAR mon,wed')
    expect([...s.minute.values]).toEqual([0, 30])
    expect([...s.hour.values]).toEqual([9, 13, 17])
    expect([...s.dayOfMonth.values]).toEqual([1, 11, 21, 31])
    expect([...s.month.values]).toEqual([1, 2, 3])
    expect([...s.dayOfWeek.values]).toEqual([1, 3])
  })

  it('treats 7 as Sunday and "?" as any', () => {
    expect([...parseCron('0 0 ? * 7').dayOfWeek.values]).toEqual([0])
    expect(parseCron('0 0 ? * *').dayOfMonth.any).toBe(true)
  })

  it('supports "start/step" as start-to-max', () => {
    expect([...parseCron('5/20 * * * *').minute.values]).toEqual([5, 25, 45])
  })

  it('expands macros case-insensitively', () => {
    expect(parseCron('@DAILY').expression).toBe('0 0 * * *')
    expect(parseCron('@hourly').expression).toBe('0 * * * *')
  })

  it('normalizes extra whitespace', () => {
    expect(parseCron('  0   9 *  * 1 ').expression).toBe('0 9 * * 1')
  })

  it.each([
    ['', /Enter a cron expression/],
    ['* * * *', /Expected 5 fields .* found 4/],
    ['0 * * * * *', /seconds/],
    ['60 * * * *', /minute value 60 is out of range \(0-59\)/],
    ['* 24 * * *', /hour value 24 is out of range/],
    ['* * 0 * *', /day-of-month value 0 is out of range \(1-31\)/],
    ['* * * 13 *', /month value 13/],
    ['* * * * 8', /day-of-week value 8/],
    ['*/0 * * * *', /Step 0/],
    ['*/x * * * *', /positive whole number/],
    ['5-1 * * * *', /goes backwards/],
    ['1,,2 * * * *', /empty list item/],
    ['* * * FOO *', /Invalid month value "FOO"/],
    ['* * L * *', /Quartz-only/],
    ['* * * * 5#3', /Quartz-only/],
    ['@reboot', /no time-based schedule/],
    ['@fortnightly', /Unknown macro/],
    ['0 0 30 2 *', /never runs/],
    ['0 0 31 4,6,9,11 *', /never runs/],
    ['1-2-3 * * * *', /Invalid range/],
    ['1/2/3 * * * *', /more than one/],
  ])('rejects %j', (expr, message) => {
    expect(() => parseCron(expr)).toThrow(CronError)
    expect(() => parseCron(expr)).toThrow(message)
  })

  it('allows Feb 30 when a day-of-week can still match (OR semantics)', () => {
    expect(() => parseCron('0 0 30 2 MON')).not.toThrow()
  })
})

describe('nextRuns', () => {
  it('returns the next runs strictly after the start time', () => {
    expect(runsUTC('*/15 * * * *', 3)).toEqual(['2026-03-10T10:15:00.000Z', '2026-03-10T10:30:00.000Z', '2026-03-10T10:45:00.000Z'])
  })

  it('does not return the current minute even if it matches', () => {
    expect(runsUTC('7 10 * * *', 1)).toEqual(['2026-03-11T10:07:00.000Z'])
  })

  it('handles weekday schedules across a weekend', () => {
    expect(runsUTC('0 9 * * MON-FRI', 5, new Date('2026-03-12T12:00:00Z'))).toEqual([
      '2026-03-13T09:00:00.000Z', // Fri
      '2026-03-16T09:00:00.000Z', // Mon
      '2026-03-17T09:00:00.000Z',
      '2026-03-18T09:00:00.000Z',
      '2026-03-19T09:00:00.000Z',
    ])
  })

  it('returns exactly 10 runs on request', () => {
    expect(runsUTC('* * * * *', 10)).toHaveLength(10)
  })

  it('crosses month and year boundaries', () => {
    expect(runsUTC('0 0 1 * *', 2, new Date('2026-12-15T00:00:00Z'))).toEqual(['2027-01-01T00:00:00.000Z', '2027-02-01T00:00:00.000Z'])
  })

  it('skips months without a 31st', () => {
    expect(runsUTC('0 12 31 * *', 3, new Date('2026-01-31T13:00:00Z'))).toEqual([
      '2026-03-31T12:00:00.000Z',
      '2026-05-31T12:00:00.000Z',
      '2026-07-31T12:00:00.000Z',
    ])
  })

  it('finds leap days years apart', () => {
    expect(runsUTC('0 0 29 2 *', 3)).toEqual(['2028-02-29T00:00:00.000Z', '2032-02-29T00:00:00.000Z', '2036-02-29T00:00:00.000Z'])
  })

  it('uses OR when both day fields are restricted', () => {
    // the 13th of the month OR any Friday
    expect(runsUTC('0 0 13 * FRI', 4, new Date('2026-03-01T00:00:00Z'))).toEqual([
      '2026-03-06T00:00:00.000Z', // Fri
      '2026-03-13T00:00:00.000Z', // 13th (also a Friday)
      '2026-03-20T00:00:00.000Z',
      '2026-03-27T00:00:00.000Z',
    ])
  })

  it('uses AND when day-of-month is a wildcard step', () => {
    // */2 starts with "*", so it does not trigger OR semantics
    expect(runsUTC('0 0 */2 * MON', 2, new Date('2026-03-01T00:00:00Z'))).toEqual(['2026-03-09T00:00:00.000Z', '2026-03-23T00:00:00.000Z'])
  })

  it('handles the rare "Friday the 29th of February" style combinations', () => {
    const runs = runsUTC('0 0 29 2 *', 1, new Date('2096-03-01T00:00:00Z'))
    // 2100 is not a leap year, so the next one is 2104
    expect(runs).toEqual(['2104-02-29T00:00:00.000Z'])
  })
})

describe('describeCron', () => {
  it.each([
    ['* * * * *', 'Every minute.'],
    ['*/15 * * * *', 'At every 15th minute.'],
    ['0 9 * * MON-FRI', 'At 09:00 on Monday through Friday.'],
    ['30 2 1 * *', 'At 02:30 on day-of-month 1.'],
    ['0 9,17 * * *', 'At 09:00 and 17:00.'],
    ['0 */2 * * *', 'At minute 0 past every 2nd hour.'],
    ['5 9-17 * * *', 'At minute 5 past every hour from 9 through 17.'],
    ['0,30 * * * *', 'At minutes 0 and 30.'],
    ['0 0 1,15 * *', 'At 00:00 on day-of-month 1 and 15.'],
    ['0 0 * JAN,JUL *', 'At 00:00 in January and July.'],
    ['0 0 * * 0', 'At 00:00 on Sunday.'],
    ['0 0 13 * 5', 'At 00:00 on day-of-month 13 or on Friday.'],
    ['@yearly', 'At 00:00 on day-of-month 1 in January.'],
    ['10-20/5 * * * *', 'At every 5th minute from 10 through 20.'],
    ['0 12 * 3-5 *', 'At 12:00 in March through May.'],
  ])('%s -> %s', (expr, text) => {
    expect(describeCron(parseCron(expr))).toBe(text)
  })
})
