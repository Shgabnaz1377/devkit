import { describe, expect, it } from 'vitest'
import {
  EncodeError,
  base64Decode,
  base64DecodeBytes,
  base64Encode,
  base64EncodeBytes,
  bytesToHex,
  htmlDecode,
  htmlEncode,
  urlDecode,
  urlEncode,
} from './encode'

describe('base64', () => {
  // RFC 4648 section 10 test vectors
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ])('encodes %j as %j (RFC 4648)', (plain, encoded) => {
    expect(base64Encode(plain)).toBe(encoded)
    expect(base64Decode(encoded)).toEqual({ kind: 'text', text: plain })
  })

  it('encodes UTF-8 text', () => {
    expect(base64Encode('héllo \u{1F44B}')).toBe('aMOpbGxvIPCfkYs=')
    expect(base64Decode('aMOpbGxvIPCfkYs=')).toEqual({ kind: 'text', text: 'héllo \u{1F44B}' })
  })

  it('supports URL-safe output without padding', () => {
    const bytes = new Uint8Array([251, 255, 191])
    expect(base64EncodeBytes(bytes)).toBe('+/+/')
    expect(base64EncodeBytes(bytes, { urlSafe: true })).toBe('-_-_')
    expect(base64Encode('fo', { padding: false })).toBe('Zm8')
  })

  it('decodes URL-safe, unpadded and wrapped input', () => {
    expect(Array.from(base64DecodeBytes('-_-_'))).toEqual([251, 255, 191])
    expect(base64Decode('Zm8')).toEqual({ kind: 'text', text: 'fo' })
    expect(base64Decode('Zm9v\nYmFy\r\n')).toEqual({ kind: 'text', text: 'foobar' })
  })

  it('returns a hex dump for binary data', () => {
    expect(base64Decode('/wAB')).toEqual({ kind: 'binary', hex: 'ff 00 01', length: 3 })
  })

  it.each([
    ['Zm9v!', /Invalid Base64 character "!" at position 5/],
    ['Zm9vY', /Invalid Base64 length/],
    ['Zm=9v', /Padding "=" may only appear at the end/],
    ['Zg===', /Too much "=" padding/],
    ['a+b_', /mixes standard/],
  ])('rejects %j', (input, message) => {
    expect(() => base64DecodeBytes(input)).toThrow(EncodeError)
    expect(() => base64DecodeBytes(input)).toThrow(message)
  })

  it('handles large inputs', () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 256)
    expect(base64DecodeBytes(base64EncodeBytes(big))).toEqual(big)
  })
})

describe('url', () => {
  it('encodes components, full URIs and form data differently', () => {
    const s = "a b&c=d/e?f#g!'"
    expect(urlEncode(s, 'component')).toBe("a%20b%26c%3Dd%2Fe%3Ff%23g!'")
    expect(urlEncode(s, 'uri')).toBe("a%20b&c=d/e?f#g!'")
    expect(urlEncode(s, 'form')).toBe('a+b%26c%3Dd%2Fe%3Ff%23g%21%27')
  })

  it('round-trips unicode', () => {
    const s = 'café 日本 \u{1F600}'
    for (const mode of ['component', 'uri', 'form'] as const) expect(urlDecode(urlEncode(s, mode), mode)).toBe(s)
  })

  it('decodes "+" as space only in form mode', () => {
    expect(urlDecode('a+b', 'form')).toBe('a b')
    expect(urlDecode('a+b', 'component')).toBe('a+b')
  })

  it('keeps reserved characters escaped when decoding a full URI', () => {
    expect(urlDecode('a%2Fb%20c', 'uri')).toBe('a%2Fb c')
  })

  it('reports malformed escapes with their position', () => {
    expect(() => urlDecode('abc%2')).toThrow(/position 4/)
    expect(() => urlDecode('100%')).toThrow(/two hex digits/)
    expect(() => urlDecode('%E2%82')).toThrow(/valid UTF-8/)
  })

  it('rejects lone surrogates when encoding', () => {
    expect(() => urlEncode('\ud800')).toThrow(/unpaired surrogate/)
  })
})

describe('html', () => {
  it('escapes the five significant characters', () => {
    expect(htmlEncode(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;')
  })

  it('optionally encodes non-ASCII as numeric references', () => {
    expect(htmlEncode('café \u{1F600}', { nonAscii: true })).toBe('caf&#xE9; &#x1F600;')
    expect(htmlEncode('café')).toBe('café')
  })

  it('decodes named, decimal and hex references', () => {
    expect(htmlDecode('&lt;p&gt; &amp;amp; &#169; &#x1F600; &eacute;&hellip;').text).toBe('<p> &amp; © \u{1F600} é…')
  })

  it('round-trips with htmlEncode', () => {
    const s = `<script>alert("x & y")</script> — 'q'`
    expect(htmlDecode(htmlEncode(s, { nonAscii: true })).text).toBe(s)
  })

  it('replaces invalid code points with U+FFFD', () => {
    expect(htmlDecode('&#0;&#xD800;&#x110000;').text).toBe('���')
  })

  it('leaves unknown entities alone and reports them', () => {
    const r = htmlDecode('&foo; &bar; &foo; & plain')
    expect(r.text).toBe('&foo; &bar; &foo; & plain')
    expect(r.unknown).toEqual(['&foo;', '&bar;'])
  })
})

describe('bytesToHex', () => {
  it('formats bytes', () => {
    expect(bytesToHex(new Uint8Array([0, 15, 255]))).toBe('000fff')
    expect(bytesToHex(new Uint8Array([1, 2]), ':')).toBe('01:02')
  })
})
