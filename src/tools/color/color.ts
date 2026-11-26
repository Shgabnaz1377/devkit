/*
 * Colour parsing/formatting (HEX, RGB, HSL, OKLCH) and WCAG 2.x contrast.
 * Colours are held as gamma-encoded sRGB channels in [0, 1] plus alpha.
 */

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

export interface Hsl {
  h: number
  s: number
  l: number
}

export interface Oklch {
  l: number
  c: number
  h: number
}

export class ColorError extends Error {}

const NAMED: Record<string, string> = {
  black: '#000000', silver: '#c0c0c0', gray: '#808080', grey: '#808080', white: '#ffffff', maroon: '#800000',
  red: '#ff0000', purple: '#800080', fuchsia: '#ff00ff', magenta: '#ff00ff', green: '#008000', lime: '#00ff00',
  olive: '#808000', yellow: '#ffff00', navy: '#000080', blue: '#0000ff', teal: '#008080', aqua: '#00ffff',
  cyan: '#00ffff', orange: '#ffa500', rebeccapurple: '#663399', transparent: '#00000000',
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/* -------------------------------- parse -------------------------------- */

function parseHex(hex: string): Rgba {
  const h = hex.slice(1)
  if (!/^[0-9a-f]+$/i.test(h) || ![3, 4, 6, 8].includes(h.length)) {
    throw new ColorError(`"${hex}" is not a valid hex colour; use #rgb, #rgba, #rrggbb or #rrggbbaa.`)
  }
  const full = h.length <= 4 ? [...h].map((c) => c + c).join('') : h
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255
  return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) : 1 }
}

function splitArgs(body: string, fn: string): { parts: string[]; alpha?: string } {
  const trimmed = body.trim()
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((s) => s.trim())
    if (parts.length !== 3 && parts.length !== 4) throw new ColorError(`${fn}() needs 3 values (plus optional alpha), got ${parts.length}.`)
    return { parts: parts.slice(0, 3), alpha: parts[3] }
  }
  const [main = '', alpha, extra] = trimmed.split('/').map((s) => s.trim())
  if (extra !== undefined) throw new ColorError(`${fn}() has more than one "/".`)
  const parts = main.split(/\s+/).filter(Boolean)
  if (parts.length !== 3) throw new ColorError(`${fn}() needs 3 values (plus optional "/ alpha"), got ${parts.length}.`)
  return { parts, alpha }
}

function num(token: string, what: string): number {
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(token)) throw new ColorError(`Invalid number "${token}" for ${what}.`)
  return Number(token)
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1
  const v = token.endsWith('%') ? num(token.slice(0, -1), 'alpha') / 100 : num(token, 'alpha')
  if (v < 0 || v > 1) throw new ColorError(`Alpha ${token} is out of range (0-1 or 0%-100%).`)
  return v
}

function parseHue(token: string): number {
  const m = /^(.*?)(deg|turn|rad|grad)?$/i.exec(token)!
  const v = num(m[1]!, 'hue')
  const unit = (m[2] ?? 'deg').toLowerCase()
  const deg = unit === 'turn' ? v * 360 : unit === 'rad' ? (v * 180) / Math.PI : unit === 'grad' ? v * 0.9 : v
  return ((deg % 360) + 360) % 360
}

function parsePercent(token: string, what: string): number {
  if (!token.endsWith('%')) throw new ColorError(`${what} must be a percentage like 50%.`)
  const v = num(token.slice(0, -1), what)
  if (v < 0 || v > 100) throw new ColorError(`${what} ${token} is out of range (0%-100%).`)
  return v / 100
}

let lastInGamut = true

/** Like parseColor, but also reports whether an oklch() input had to be clipped into sRGB. */
export function parseColorInfo(input: string): { color: Rgba; inGamut: boolean } {
  lastInGamut = true
  const color = parseColor(input)
  return { color, inGamut: lastInGamut }
}

export function parseColor(input: string): Rgba {
  const s = input.trim().toLowerCase()
  if (s === '') throw new ColorError('Enter a colour, e.g. #4f46e5, rgb(79 70 229) or oklch(0.51 0.23 277).')
  if (s.startsWith('#')) return parseHex(s)
  if (/^[0-9a-f]{6}$/.test(s) || /^[0-9a-f]{3}$/.test(s)) return parseHex(`#${s}`)
  if (NAMED[s]) return parseHex(NAMED[s]!)

  const fn = /^([a-z]+)\((.*)\)$/.exec(s)
  if (!fn) {
    if (/^[a-z]+$/.test(s)) throw new ColorError(`Unknown colour name "${s}". Only the basic CSS names are supported; use hex for others.`)
    throw new ColorError(`Cannot parse "${input.trim()}". Supported: hex, rgb(), hsl(), oklch() and basic colour names.`)
  }
  const [, name, body = ''] = fn
  const { parts, alpha } = splitArgs(body, name!)
  const a = parseAlpha(alpha)
  const [p0, p1, p2] = parts as [string, string, string]

  switch (name) {
    case 'rgb':
    case 'rgba': {
      const pct = parts.map((p) => p.endsWith('%'))
      if (pct.some((x) => x !== pct[0])) throw new ColorError('rgb() values must be all numbers or all percentages.')
      const ch = (t: string, label: string) => {
        const v = pct[0] ? num(t.slice(0, -1), label) / 100 : num(t, label) / 255
        if (v < 0 || v > 1) throw new ColorError(`${label} ${t} is out of range (${pct[0] ? '0%-100%' : '0-255'}).`)
        return v
      }
      return { r: ch(p0, 'Red'), g: ch(p1, 'Green'), b: ch(p2, 'Blue'), a }
    }
    case 'hsl':
    case 'hsla':
      return { ...hslToRgb({ h: parseHue(p0), s: parsePercent(p1, 'Saturation'), l: parsePercent(p2, 'Lightness') }), a }
    case 'oklch': {
      const l = p0.endsWith('%') ? num(p0.slice(0, -1), 'lightness') / 100 : num(p0, 'lightness')
      if (l < 0 || l > 1) throw new ColorError(`OKLCH lightness ${p0} is out of range (0-1 or 0%-100%).`)
      const c = p1.endsWith('%') ? (num(p1.slice(0, -1), 'chroma') / 100) * 0.4 : num(p1, 'chroma')
      if (c < 0) throw new ColorError('OKLCH chroma cannot be negative.')
      const converted = oklchToRgb({ l, c, h: parseHue(p2) })
      lastInGamut = converted.inGamut
      return { ...converted.rgb, a }
    }
    default:
      throw new ColorError(`Unsupported colour function "${name}()". Supported: rgb(), hsl(), oklch().`)
  }
}

/* ------------------------------- convert ------------------------------- */

export function rgbToHsl({ r, g, b }: Omit<Rgba, 'a'>): Hsl {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: ((h * 60) + 360) % 360, s, l }
}

export function hslToRgb({ h, s, l }: Hsl): Omit<Rgba, 'a'> {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return { r: f(0), g: f(8), b: f(4) }
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

export function rgbToOklch({ r, g, b }: Omit<Rgba, 'a'>): Oklch {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.hypot(A, B)
  // Hue is meaningless for achromatic colours; report 0.
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return { l: L, c: c < 1e-4 ? 0 : c, h }
}

export function oklchToRgb({ l: L, c, h }: Oklch): { rgb: Omit<Rgba, 'a'>; inGamut: boolean } {
  const A = c * Math.cos((h * Math.PI) / 180)
  const B = c * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const eps = 1e-4
  const inGamut = lin.every((v) => v >= -eps && v <= 1 + eps)
  const [r, g, b] = lin.map((v) => clamp01(toGamma(clamp01(v)))) as [number, number, number]
  return { rgb: { r, g, b }, inGamut }
}

/* ------------------------------- format -------------------------------- */

const round = (x: number, digits: number) => {
  const f = 10 ** digits
  return Math.round(x * f) / f
}
const byte = (x: number) => Math.round(clamp01(x) * 255)

export function toHex(c: Rgba): string {
  const hex = [c.r, c.g, c.b].map((x) => byte(x).toString(16).padStart(2, '0')).join('')
  return `#${hex}${c.a < 1 ? byte(c.a).toString(16).padStart(2, '0') : ''}`
}

const alphaSuffix = (a: number) => (a < 1 ? ` / ${round(a, 3)}` : '')

export function toRgbString(c: Rgba): string {
  return `rgb(${byte(c.r)} ${byte(c.g)} ${byte(c.b)}${alphaSuffix(c.a)})`
}

export function toHslString(c: Rgba): string {
  const { h, s, l } = rgbToHsl(c)
  return `hsl(${round(h, 1)} ${round(s * 100, 1)}% ${round(l * 100, 1)}%${alphaSuffix(c.a)})`
}

export function toOklchString(c: Rgba): string {
  const { l, c: ch, h } = rgbToOklch(c)
  return `oklch(${round(l, 4)} ${round(ch, 4)} ${round(h, 2)}${alphaSuffix(c.a)})`
}

/* ------------------------------- contrast ------------------------------ */

/** WCAG 2.x relative luminance. */
export function relativeLuminance({ r, g, b }: Omit<Rgba, 'a'>): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** Composite a translucent colour over an opaque backdrop. */
export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 }
}

const WHITE: Rgba = { r: 1, g: 1, b: 1, a: 1 }

/** WCAG contrast ratio (1-21). Translucent colours are composited first (background over white). */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const opaqueBg = bg.a < 1 ? composite(bg, WHITE) : bg
  const opaqueFg = fg.a < 1 ? composite(fg, opaqueBg) : fg
  const l1 = relativeLuminance(opaqueFg)
  const l2 = relativeLuminance(opaqueBg)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

export interface WcagResult {
  ratio: number
  aaNormal: boolean
  aaLarge: boolean
  aaaNormal: boolean
  aaaLarge: boolean
  uiComponents: boolean
}

export function wcag(fg: Rgba, bg: Rgba): WcagResult {
  const ratio = contrastRatio(fg, bg)
  // WCAG compares the unrounded ratio against the thresholds.
  return { ratio, aaNormal: ratio >= 4.5, aaLarge: ratio >= 3, aaaNormal: ratio >= 7, aaaLarge: ratio >= 4.5, uiComponents: ratio >= 3 }
}

/**
 * Smallest OKLCH-lightness change to `fg` (keeping hue and chroma) that
 * reaches `target` contrast against `bg`; null if impossible.
 */
export function suggestForeground(fg: Rgba, bg: Rgba, target: number): Rgba | null {
  if (contrastRatio(fg, bg) >= target) return fg
  const base = rgbToOklch(fg)
  const candidates: Rgba[] = []
  for (const dir of [-1, 1]) {
    let lo = base.l
    let hi = dir < 0 ? 0 : 1
    const at = (l: number): Rgba => ({ ...oklchToRgb({ ...base, l }).rgb, a: fg.a })
    if (contrastRatio(at(hi), bg) < target) continue
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (contrastRatio(at(mid), bg) >= target) hi = mid
      else lo = mid
    }
    // Round to whole bytes, then nudge until the rounded colour really passes.
    let c = parseHex(toHex(at(hi)))
    let l = hi
    for (let i = 0; i < 50 && contrastRatio(c, bg) < target; i++) {
      l = clamp01(l + dir * 0.002)
      c = parseHex(toHex(at(l)))
    }
    if (contrastRatio(c, bg) >= target) candidates.push({ ...c, a: fg.a })
  }
  if (candidates.length === 0) return null
  const dist = (c: Rgba) => Math.abs(rgbToOklch(c).l - base.l)
  return candidates.sort((a, b) => dist(a) - dist(b))[0]!
}
