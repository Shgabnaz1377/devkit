import { describe, expect, it } from 'vitest'
import { toBase64Url } from '../../lib/share'
import {
  JwtError,
  decodeJwt,
  describeRelative,
  normalizeToken,
  secretToBytes,
  signHmac,
  summarizeClaims,
  verifyHmac,
  type HmacAlg,
} from './jwt'

// The well-known example token from RFC-style docs (secret: "your-256-bit-secret").
const SAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
const SAMPLE_SECRET = 'your-256-bit-secret'

const b64 = (s: string) => toBase64Url(new TextEncoder().encode(s))

async function makeToken(header: object, payload: object, secret: string, alg: HmacAlg): Promise<string> {
  const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`
  return `${input}.${await signHmac(input, new TextEncoder().encode(secret), alg)}`
}

describe('decodeJwt', () => {
  it('decodes header and payload of a valid token', () => {
    const d = decodeJwt(SAMPLE)
    expect(d.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(d.payload).toEqual({ sub: '1234567890', name: 'John Doe', iat: 1516239022 })
    expect(d.signature).toBe('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')
  })

  it('accepts a "Bearer " prefix and stray whitespace', () => {
    expect(decodeJwt(`  Bearer ${SAMPLE.slice(0, 40)}\n${SAMPLE.slice(40)}  `).header.alg).toBe('HS256')
    expect(normalizeToken('bearer   a.b.c')).toBe('a.b.c')
  })

  it('decodes UTF-8 payloads', () => {
    const t = `${b64('{"alg":"HS256"}')}.${b64('{"name":"Zoë \u{1F680}"}')}.sig`
    expect(decodeJwt(t).payload).toEqual({ name: 'Zoë \u{1F680}' })
  })

  it('keeps non-JSON payloads as text', () => {
    const t = `${b64('{"alg":"HS256"}')}.${b64('hello')}.x`
    expect(decodeJwt(t).payload).toBe('hello')
  })

  it.each([
    ['', /Paste a token/],
    ['abc', /3 segments.*this has 1/],
    ['a.b', /this has 2/],
    ['a.b.c.d', /this has 4/],
    ['a.b.c.d.e', /encrypted JWE/],
    ['.e30.x', /header segment is empty/],
    ['e30.e30.x', /no "alg"/],
    ['W10.e30.x', /must be a JSON object/],
    ['eyJhbGciOi+.e30.x', /unexpected character "\+"/],
    ['eyJhbGciOiJIUzI1NiJ9.a.x', /payload is not valid base64url: its length/],
    [`${b64('{"alg":')}.e30.x`, /header is not valid JSON/],
    ['_w.e30.x', /not valid UTF-8/],
  ])('rejects %j with a helpful message', (token, message) => {
    expect(() => decodeJwt(token)).toThrow(JwtError)
    expect(() => decodeJwt(token)).toThrow(message)
  })
})

describe('summarizeClaims', () => {
  const now = 1_700_000_000

  it('reports valid, expired and not-yet-valid tokens', () => {
    expect(summarizeClaims({ exp: now + 60 }, now).status).toBe('valid')
    expect(summarizeClaims({ exp: now - 1 }, now).status).toBe('expired')
    expect(summarizeClaims({ exp: now }, now).status).toBe('expired')
    expect(summarizeClaims({ nbf: now + 10, exp: now + 100 }, now).status).toBe('not-yet-valid')
    expect(summarizeClaims({ sub: 'x' }, now).status).toBe('no-expiry')
  })

  it('applies leeway for clock skew', () => {
    expect(summarizeClaims({ exp: now - 20 }, now, 30).status).toBe('valid')
    expect(summarizeClaims({ nbf: now + 20, exp: now + 100 }, now, 30).status).toBe('valid')
  })

  it('formats claim dates as ISO strings with relative descriptions', () => {
    const s = summarizeClaims({ iat: 1516239022, exp: now + 7200 }, now)
    expect(s.timeClaims.map((c) => c.name)).toEqual(['iat', 'exp'])
    expect(s.timeClaims[0]!.iso).toBe('2018-01-18T01:30:22.000Z')
    expect(s.timeClaims[1]!.relative).toBe('in 2 hours')
  })

  it('warns about wrong types, milliseconds and inconsistent times', () => {
    expect(summarizeClaims({ exp: '123' }, now).warnings[0]).toMatch(/should be a number/)
    expect(summarizeClaims({ exp: now * 1000 }, now).warnings[0]).toMatch(/milliseconds/)
    expect(summarizeClaims({ iat: now + 100, exp: now + 50 }, now).warnings.join(' ')).toMatch(/expired before it was issued/)
    expect(summarizeClaims('text', now).warnings[0]).toMatch(/not a JSON object/)
  })
})

describe('describeRelative', () => {
  it.each([
    [0, 'now'],
    [1, 'in 1 second'],
    [-59, '59 seconds ago'],
    [3600, 'in 1 hour'],
    [-86400 * 3, '3 days ago'],
    [86400 * 400, 'in 1 year'],
  ])('%i -> %s', (delta, text) => {
    expect(describeRelative(delta)).toBe(text)
  })
})

describe('secretToBytes', () => {
  it('decodes hex, base64 and base64url secrets', () => {
    expect(Array.from(secretToBytes('00ff10', 'hex'))).toEqual([0, 255, 16])
    expect(Array.from(secretToBytes('+/8=', 'base64'))).toEqual([251, 255])
    expect(Array.from(secretToBytes('-_8', 'base64url'))).toEqual([251, 255])
  })

  it('rejects malformed secrets', () => {
    expect(() => secretToBytes('abc', 'hex')).toThrow(/not valid hex/)
    expect(() => secretToBytes('zz', 'hex')).toThrow(/not valid hex/)
    expect(() => secretToBytes('a*b', 'base64')).toThrow(/not valid base64/)
  })
})

describe('verifyHmac', () => {
  it('verifies the reference HS256 token against a known signature', async () => {
    expect(await verifyHmac(SAMPLE, SAMPLE_SECRET)).toEqual({ ok: true, alg: 'HS256' })
  })

  it('reproduces the reference signature byte for byte', async () => {
    const d = decodeJwt(SAMPLE)
    expect(await signHmac(d.signingInput, new TextEncoder().encode(SAMPLE_SECRET), 'HS256')).toBe(d.signature)
  })

  it('rejects a wrong secret', async () => {
    const r = await verifyHmac(SAMPLE, 'not-the-secret')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toMatch(/Invalid signature/)
  })

  it('rejects a tampered payload', async () => {
    const [h, , s] = SAMPLE.split('.')
    const forged = `${h}.${b64('{"sub":"1234567890","name":"John Doe","admin":true}')}.${s}`
    expect((await verifyHmac(forged, SAMPLE_SECRET)).ok).toBe(false)
  })

  it.each(['HS256', 'HS384', 'HS512'] as const)('round-trips %s', async (alg) => {
    const token = await makeToken({ alg, typ: 'JWT' }, { sub: 'u1' }, 's3cret', alg)
    expect(await verifyHmac(token, 's3cret')).toEqual({ ok: true, alg })
  })

  it('supports binary secrets via hex encoding', async () => {
    const secretHex = '0102030405060708090a0b0c0d0e0f10'
    const input = `${b64('{"alg":"HS256"}')}.${b64('{}')}`
    const sig = await signHmac(input, secretToBytes(secretHex, 'hex'), 'HS256')
    expect((await verifyHmac(`${input}.${sig}`, secretHex, 'hex')).ok).toBe(true)
    expect((await verifyHmac(`${input}.${sig}`, secretHex, 'utf8')).ok).toBe(false)
  })

  it('refuses alg "none" and asymmetric algorithms with a clear reason', async () => {
    const none = `${b64('{"alg":"none"}')}.${b64('{}')}.`
    const rs = `${b64('{"alg":"RS256"}')}.${b64('{}')}.abc`
    const r1 = await verifyHmac(none, 'x')
    const r2 = await verifyHmac(rs, 'x')
    expect(!r1.ok && r1.reason).toMatch(/unsigned/)
    expect(!r2.ok && r2.reason).toMatch(/RS256.*public\/private key/)
  })

  it('explains missing secrets and malformed tokens', async () => {
    const r1 = await verifyHmac(SAMPLE, '')
    const r2 = await verifyHmac('nope', 'x')
    expect(!r1.ok && r1.reason).toMatch(/Enter the shared secret/)
    expect(!r2.ok && r2.reason).toMatch(/3 segments/)
  })
})
