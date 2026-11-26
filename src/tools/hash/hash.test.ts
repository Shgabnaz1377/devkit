import { describe, expect, it } from 'vitest'
import { digestBytes, digestMatches, digestText, formatDigest, hmac, type HashAlgorithm } from './hash'

const hex = async (text: string, alg: HashAlgorithm) => formatDigest(await digestText(text, alg), 'hex')
const enc = (s: string) => new TextEncoder().encode(s)

describe('digests (FIPS 180 test vectors)', () => {
  it.each([
    ['SHA-1', 'abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    ['SHA-1', '', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['SHA-256', 'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['SHA-256', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    [
      'SHA-256',
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    ['SHA-384', 'abc', 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7'],
    [
      'SHA-512',
      'abc',
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    ],
  ] as const)('%s(%j)', async (alg, input, expected) => {
    expect(await hex(input, alg)).toBe(expected)
  })

  it('hashes text as UTF-8', async () => {
    expect(await hex('é', 'SHA-256')).toBe(formatDigest(await digestBytes(new Uint8Array([0xc3, 0xa9]), 'SHA-256'), 'hex'))
  })

  it('hashes a million "a" characters (FIPS long-message vector)', async () => {
    expect(await hex('a'.repeat(1_000_000), 'SHA-256')).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0')
  })
})

describe('formatDigest', () => {
  it('formats as lower hex, upper hex and base64', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    expect(formatDigest(bytes, 'hex')).toBe('deadbeef')
    expect(formatDigest(bytes, 'HEX')).toBe('DEADBEEF')
    expect(formatDigest(bytes, 'base64')).toBe('3q2+7w==')
  })
})

describe('hmac (RFC 4231)', () => {
  it('test case 2: key "Jefe"', async () => {
    const mac = await hmac(enc('what do ya want for nothing?'), enc('Jefe'), 'SHA-256')
    expect(formatDigest(mac, 'hex')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843')
  })

  it('test case 2 with SHA-512', async () => {
    const mac = await hmac(enc('what do ya want for nothing?'), enc('Jefe'), 'SHA-512')
    expect(formatDigest(mac, 'hex')).toBe(
      '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
    )
  })

  it('rejects an empty key', async () => {
    await expect(hmac(enc('x'), new Uint8Array(), 'SHA-256')).rejects.toThrow(/non-empty key/)
  })
})

describe('digestMatches', () => {
  it('ignores case, whitespace and colons', () => {
    expect(digestMatches('deadbeef', ' DE:AD:BE:EF ')).toBe(true)
    expect(digestMatches('deadbeef', 'deadbeee')).toBe(false)
    expect(digestMatches('deadbeef', '   ')).toBeNull()
  })
})
