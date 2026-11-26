import { parseAllDocuments, stringify, YAMLError } from 'yaml'
import { parseJson, type Indent } from '../json/json'

export interface ConvertError {
  message: string
  line?: number
  column?: number
}

export type ConvertResult = { ok: true; output: string; notes: string[] } | { ok: false; error: ConvertError }

function firstLine(message: string): string {
  return message.split('\n')[0] ?? message
}

/**
 * YAML -> JSON. Uses the YAML 1.2 core schema (so `yes`/`no` stay strings,
 * unlike YAML 1.1). Multiple `---` documents become a JSON array.
 */
export function yamlToJson(text: string, indent: Indent = 2): ConvertResult {
  if (text.trim() === '') return { ok: false, error: { message: 'The input is empty.' } }
  const docs = parseAllDocuments(text, { prettyErrors: true, uniqueKeys: true })
  // parseAllDocuments returns an EmptyStream when there are no documents.
  const list = Array.isArray(docs) ? docs : []
  for (const doc of list) {
    const e = doc.errors[0]
    if (e) {
      const pos = e.linePos?.[0]
      return { ok: false, error: { message: firstLine(e.message), line: pos?.line, column: pos?.col } }
    }
  }
  const notes: string[] = []
  const values: unknown[] = []
  for (const doc of list) {
    for (const w of doc.warnings) notes.push(firstLine(w.message))
    try {
      values.push(doc.toJS({ maxAliasCount: 1000, mapAsMap: true }))
    } catch (e) {
      const message = e instanceof YAMLError || e instanceof Error ? firstLine(e.message) : String(e)
      return { ok: false, error: { message: /alias/i.test(message) ? `${message} (possible alias expansion attack)` : message } }
    }
  }
  if (values.length === 0) return { ok: false, error: { message: 'The input contains no YAML documents.' } }
  if (values.length > 1) notes.push(`${values.length} documents found; they were combined into a JSON array.`)
  const value = values.length === 1 ? values[0] : values
  let output: string
  try {
    output = JSON.stringify(value, jsonReplacer(notes), indent === 0 ? undefined : indent) ?? 'null'
  } catch (e) {
    return { ok: false, error: { message: `Cannot represent this YAML as JSON: ${(e as Error).message}` } }
  }
  return { ok: true, output, notes: [...new Set(notes)] }
}

function jsonReplacer(notes: string[]) {
  return function (this: unknown, _key: string, value: unknown): unknown {
    if (value instanceof Map) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of value) {
        if (typeof k !== 'string') notes.push('A mapping with non-string keys was converted to an object; keys were stringified.')
        out[typeof k === 'string' ? k : k !== null && typeof k === 'object' ? JSON.stringify(k, jsonReplacer([])) : String(k)] = v
      }
      return out
    }
    if (value instanceof Set) return [...value]
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'number' && !Number.isFinite(value)) {
      notes.push('.inf / .nan have no JSON equivalent and became null.')
      return null
    }
    return value
  }
}

/** JSON -> YAML (block style). */
export function jsonToYaml(text: string, indent: 2 | 4 = 2): ConvertResult {
  const parsed = parseJson(text)
  if (!parsed.ok) {
    const { message, line, column, hint } = parsed.error
    return { ok: false, error: { message: hint ? `${message}. ${hint}` : message, line, column } }
  }
  const output = stringify(parsed.value, { indent, lineWidth: 0, aliasDuplicateObjects: false })
  return { ok: true, output, notes: [] }
}
