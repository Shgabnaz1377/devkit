import { describe, expect, it } from 'vitest'
import { jsonToYaml, yamlToJson } from './yaml'

function ok(r: ReturnType<typeof yamlToJson>) {
  if (!r.ok) throw new Error(`unexpected error: ${r.error.message}`)
  return r
}

describe('yamlToJson', () => {
  it('converts mappings, sequences and scalars', () => {
    const r = ok(yamlToJson('name: devkit\nversion: 1.2\ntags:\n  - a\n  - b\nnested:\n  on: true\n  nothing: null\n', 0))
    expect(JSON.parse(r.output)).toEqual({ name: 'devkit', version: 1.2, tags: ['a', 'b'], nested: { on: true, nothing: null } })
  })

  it('uses YAML 1.2 semantics: yes/no and leading-zero values stay strings', () => {
    const r = ok(yamlToJson('a: yes\nb: no\nc: 0755\nd: "007"', 0))
    expect(JSON.parse(r.output)).toEqual({ a: 'yes', b: 'no', c: 755, d: '007' })
  })

  it('expands anchors and merge-free aliases', () => {
    const r = ok(yamlToJson('base: &b {x: 1}\ncopy: *b', 0))
    expect(JSON.parse(r.output)).toEqual({ base: { x: 1 }, copy: { x: 1 } })
  })

  it('combines multiple documents into an array, with a note', () => {
    const r = ok(yamlToJson('a: 1\n---\nb: 2\n', 0))
    expect(JSON.parse(r.output)).toEqual([{ a: 1 }, { b: 2 }])
    expect(r.notes.join(' ')).toMatch(/2 documents/)
  })

  it('stringifies non-string keys and maps .inf to null with notes', () => {
    const r = ok(yamlToJson('? [1, 2]\n: pair\nbig: .inf\n', 0))
    expect(JSON.parse(r.output)).toEqual({ '[1,2]': 'pair', big: null })
    expect(r.notes.join(' ')).toMatch(/non-string keys/)
    expect(r.notes.join(' ')).toMatch(/\.inf/)
  })

  it('reports syntax errors with line and column', () => {
    const r = yamlToJson('key: [1, 2\nother: 3\n')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.line).toBe(2)
      expect(r.error.message.length).toBeGreaterThan(5)
    }
  })

  it('rejects duplicate keys', () => {
    const r = yamlToJson('a: 1\na: 2\n')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/unique|duplicate/i)
  })

  it('rejects empty and comment-only input', () => {
    expect(yamlToJson('  ').ok).toBe(false)
    const r = yamlToJson('# only a comment\n')
    expect(!r.ok && r.error.message).toMatch(/no YAML documents/)
  })

  it('stops alias bombs', () => {
    const bomb = ['a: &a ["x","x","x","x","x","x","x","x","x"]']
    for (let i = 0; i < 8; i++) {
      const prev = String.fromCharCode(97 + i)
      const next = String.fromCharCode(98 + i)
      bomb.push(`${next}: &${next} [*${prev},*${prev},*${prev},*${prev},*${prev},*${prev},*${prev},*${prev},*${prev}]`)
    }
    const r = yamlToJson(bomb.join('\n'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/alias/i)
  })
})

describe('jsonToYaml', () => {
  it('converts JSON to block YAML', () => {
    const r = jsonToYaml('{"name":"devkit","tags":["a","b"],"n":{"x":1}}')
    expect(r.ok && r.output).toBe('name: devkit\ntags:\n  - a\n  - b\nn:\n  x: 1\n')
  })

  it('quotes strings that would otherwise change type', () => {
    const r = jsonToYaml('{"a":"true","b":"123","c":"null"}')
    expect(r.ok && r.output).toBe('a: "true"\nb: "123"\nc: "null"\n')
  })

  it('round-trips through yamlToJson', () => {
    const src = { list: [1, 'two', { three: [3] }], empty: {}, s: 'multi\nline', u: '\u00fc\u{1F600}' }
    const y = jsonToYaml(JSON.stringify(src))
    if (!y.ok) throw new Error('jsonToYaml failed')
    expect(JSON.parse(ok(yamlToJson(y.output, 0)).output)).toEqual(src)
  })

  it('supports 4-space indentation', () => {
    const r = jsonToYaml('{"a":{"b":1}}', 4)
    expect(r.ok && r.output).toBe('a:\n    b: 1\n')
  })

  it('passes JSON errors through with position', () => {
    const r = jsonToYaml('{"a":1,}')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.message).toMatch(/Trailing comma/)
      expect(r.error.column).toBe(7)
    }
  })
})
