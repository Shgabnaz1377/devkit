import { describe, expect, it } from 'vitest'
import {
  ColorError,
  contrastRatio,
  hslToRgb,
  oklchToRgb,
  parseColor,
  parseColorInfo,
  relativeLuminance,
  rgbToHsl,
  rgbToOklch,
  suggestForeground,
  toHex,
  toHslString,
  toOklchString,
  toRgbString,
  wcag,
} from './color'

const hex = (s: string) => toHex(parseColor(s))

describe('parseColor', () => {
  it.each([
    ['#4f46e5', '#4f46e5'],
    ['#ABC', '#aabbcc'],
    ['#abcd', '#aabbccdd'],
    ['#4f46e580', '#4f46e580'],
    ['4f46e5', '#4f46e5'],
    ['rgb(79, 70, 229)', '#4f46e5'],
    ['rgb(79 70 229)', '#4f46e5'],
    ['rgba(79, 70, 229, 0.5)', '#4f46e580'],
    ['rgb(79 70 229 / 50%)', '#4f46e580'],
    ['rgb(100% 0% 0%)', '#ff0000'],
    ['hsl(120, 100%, 50%)', '#00ff00'],
    ['hsl(0.5turn 100% 50%)', '#00ffff'],
    ['hsl(-120deg 100% 50%)', '#0000ff'],
    ['hsl(3.14159265rad 100% 50%)', '#00ffff'],
    ['oklch(0.62796 0.25768 29.2339)', '#ff0000'],
    ['oklch(100% 0 0)', '#ffffff'],
    ['RebeccaPurple', '#663399'],
    ['transparent', '#00000000'],
    ['  white  ', '#ffffff'],
  ])('%s -> %s', (input, expected) => {
    expect(hex(input)).toBe(expected)
  })

  it.each([
    ['', /Enter a colour/],
    ['#12', /not a valid hex/],
    ['#ggg', /not a valid hex/],
    ['rgb(300, 0, 0)', /Red 300 is out of range \(0-255\)/],
    ['rgb(10%, 0, 0)', /all numbers or all percentages/],
    ['rgb(1, 2)', /needs 3 values/],
    ['rgb(1 2 3 / 0.5 / 1)', /more than one/],
    ['rgba(1, 2, 3, 1.5)', /Alpha 1.5 is out of range/],
    ['hsl(10, 50, 50%)', /Saturation must be a percentage/],
    ['hsl(10, 50%, 150%)', /Lightness 150% is out of range/],
    ['oklch(1.5 0.1 20)', /lightness 1.5 is out of range/],
    ['oklch(0.5 -0.1 20)', /chroma cannot be negative/],
    ['lab(50 20 30)', /Unsupported colour function "lab\(\)"/],
    ['chartreuse', /Unknown colour name/],
    ['rgb(a, b, c)', /Invalid number "a"/],
    ['not a colour!', /Cannot parse/],
  ])('rejects %j', (input, message) => {
    expect(() => parseColor(input)).toThrow(ColorError)
    expect(() => parseColor(input)).toThrow(message)
  })
})

describe('HSL conversion', () => {
  it('round-trips primary, secondary and grey colours', () => {
    for (const h of ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#808080', '#4f46e5', '#000000', '#ffffff']) {
      const c = parseColor(h)
      expect(toHex({ ...hslToRgb(rgbToHsl(c)), a: 1 })).toBe(h)
    }
  })

  it('formats known values', () => {
    expect(toHslString(parseColor('#ff0000'))).toBe('hsl(0 100% 50%)')
    expect(toHslString(parseColor('#808080'))).toBe('hsl(0 0% 50.2%)')
    expect(toHslString(parseColor('#4f46e580'))).toBe('hsl(243.4 75.4% 58.6% / 0.502)')
  })
})

describe('OKLCH conversion', () => {
  it('matches reference values for sRGB red (Ottosson)', () => {
    const { l, c, h } = rgbToOklch(parseColor('#ff0000'))
    expect(l).toBeCloseTo(0.62796, 4)
    expect(c).toBeCloseTo(0.25768, 4)
    expect(h).toBeCloseTo(29.2339, 2)
  })

  it('maps white and black to L=1 and L=0 with zero chroma', () => {
    expect(rgbToOklch(parseColor('#fff'))).toEqual({ l: expect.closeTo(1, 4), c: 0, h: 0 })
    expect(rgbToOklch(parseColor('#000'))).toEqual({ l: expect.closeTo(0, 4), c: 0, h: 0 })
  })

  it('round-trips through OKLCH', () => {
    for (const h of ['#4f46e5', '#10b981', '#f59e0b', '#123456', '#fefefe']) {
      expect(toHex({ ...oklchToRgb(rgbToOklch(parseColor(h))).rgb, a: 1 })).toBe(h)
    }
  })

  it('reports out-of-gamut colours and clips them', () => {
    const r = oklchToRgb({ l: 0.7, c: 0.4, h: 150 })
    expect(r.inGamut).toBe(false)
    for (const v of Object.values(r.rgb)) expect(v).toBeGreaterThanOrEqual(0)
    expect(oklchToRgb({ l: 0.5, c: 0.05, h: 200 }).inGamut).toBe(true)
  })

  it('flags oklch() input that had to be clipped', () => {
    expect(parseColorInfo('oklch(0.7 0.4 150)').inGamut).toBe(false)
    expect(parseColorInfo('oklch(0.5 0.05 200)').inGamut).toBe(true)
    expect(parseColorInfo('#ff0000').inGamut).toBe(true)
  })

  it('formats as a CSS oklch() string', () => {
    expect(toOklchString(parseColor('#ff0000'))).toBe('oklch(0.628 0.2577 29.23)')
  })
})

describe('rgb formatting', () => {
  it('uses space-separated syntax with optional alpha', () => {
    expect(toRgbString(parseColor('#4f46e5'))).toBe('rgb(79 70 229)')
    expect(toRgbString(parseColor('rgba(0,0,0,.25)'))).toBe('rgb(0 0 0 / 0.25)')
  })
})

describe('WCAG contrast', () => {
  it('computes relative luminance at the extremes', () => {
    expect(relativeLuminance(parseColor('#fff'))).toBeCloseTo(1, 10)
    expect(relativeLuminance(parseColor('#000'))).toBe(0)
  })

  it.each([
    ['#000000', '#ffffff', 21],
    ['#ffffff', '#ffffff', 1],
    ['#767676', '#ffffff', 4.54], // the classic lightest grey that passes AA on white
    ['#777777', '#ffffff', 4.48], // ... and the one that just fails
    ['#595959', '#ffffff', 7.0],
    ['#ff0000', '#ffffff', 4.0],
    ['#0000ff', '#ffffff', 8.59],
    ['#ffff00', '#000000', 19.56],
  ])('%s on %s = %f', (fg, bg, ratio) => {
    expect(contrastRatio(parseColor(fg), parseColor(bg))).toBeCloseTo(ratio, 2)
  })

  it('is symmetric', () => {
    const a = parseColor('#4f46e5')
    const b = parseColor('#f0f0f0')
    expect(contrastRatio(a, b)).toBe(contrastRatio(b, a))
  })

  it('applies the AA/AAA thresholds without rounding up', () => {
    expect(wcag(parseColor('#767676'), parseColor('#fff'))).toMatchObject({ aaNormal: true, aaaNormal: false, aaLarge: true })
    expect(wcag(parseColor('#777777'), parseColor('#fff'))).toMatchObject({ aaNormal: false, aaLarge: true, uiComponents: true })
    expect(wcag(parseColor('#595959'), parseColor('#fff')).aaaNormal).toBe(true)
  })

  it('composites translucent foregrounds over the background', () => {
    const half = contrastRatio(parseColor('rgb(0 0 0 / 0.5)'), parseColor('#fff'))
    expect(half).toBeCloseTo(contrastRatio(parseColor('#808080'), parseColor('#fff')), 1)
    expect(contrastRatio(parseColor('transparent'), parseColor('#fff'))).toBeCloseTo(1, 10)
  })
})

describe('suggestForeground', () => {
  it('returns the colour unchanged when it already passes', () => {
    const fg = parseColor('#000')
    expect(suggestForeground(fg, parseColor('#fff'), 4.5)).toBe(fg)
  })

  it('finds a nearby colour that reaches the target', () => {
    const bg = parseColor('#ffffff')
    for (const target of [3, 4.5, 7]) {
      const s = suggestForeground(parseColor('#8b8bf5'), bg, target)!
      expect(contrastRatio(s, bg)).toBeGreaterThanOrEqual(target)
      expect(contrastRatio(s, bg)).toBeLessThan(target + 0.5)
    }
  })

  it('can go lighter on dark backgrounds', () => {
    const bg = parseColor('#111111')
    const s = suggestForeground(parseColor('#444444'), bg, 4.5)!
    expect(relativeLuminance(s)).toBeGreaterThan(relativeLuminance(parseColor('#444444')))
    expect(contrastRatio(s, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('returns null when no lightness can reach the target', () => {
    expect(suggestForeground(parseColor('#777'), parseColor('#777'), 22)).toBeNull()
  })
})
