/** Human-friendly relative time, e.g. "in 2 hours" or "3 days ago". */
export function describeRelative(deltaSeconds: number): string {
  const abs = Math.abs(deltaSeconds)
  const units: [number, string][] = [
    [365 * 86400, 'year'],
    [30 * 86400, 'month'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ]
  if (abs < 1) return 'now'
  for (const [size, unit] of units) {
    if (abs >= size) {
      const n = Math.floor(abs / size)
      const text = `${n} ${unit}${n === 1 ? '' : 's'}`
      return deltaSeconds < 0 ? `${text} ago` : `in ${text}`
    }
  }
  return 'now'
}
