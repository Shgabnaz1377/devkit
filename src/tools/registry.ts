import type { Component } from 'vue'

export type ToolCategory = 'Data' | 'Encoding' | 'Security' | 'Generators' | 'Time' | 'Text' | 'Design'

export const CATEGORY_ORDER: readonly ToolCategory[] = [
  'Data',
  'Encoding',
  'Security',
  'Generators',
  'Time',
  'Text',
  'Design',
]

export interface ToolDefinition {
  /** URL slug, also the localStorage key suffix. */
  id: string
  name: string
  description: string
  category: ToolCategory
  keywords: readonly string[]
  component: () => Promise<Component>
}

/**
 * Every tool registers itself here; routes, the sidebar, the home grid and
 * the command palette are all derived from this list.
 */
export const tools: readonly ToolDefinition[] = [
  {
    id: 'json',
    name: 'JSON formatter',
    description: 'Validate, pretty-print, minify and explore JSON as a tree, with exact error positions.',
    category: 'Data',
    keywords: ['pretty print', 'validate', 'lint', 'minify', 'beautify', 'tree'],
    component: () => import('./json/JsonView.vue'),
  },
  {
    id: 'json-diff',
    name: 'JSON diff',
    description: 'Compare two JSON documents structurally and list every added, removed and changed path.',
    category: 'Data',
    keywords: ['compare', 'difference', 'changes', 'jsonpath'],
    component: () => import('./json/JsonDiffView.vue'),
  },
  {
    id: 'yaml',
    name: 'YAML / JSON converter',
    description: 'Convert YAML to JSON and back (YAML 1.2), with multi-document and anchor support.',
    category: 'Data',
    keywords: ['yml', 'convert', 'kubernetes', 'config'],
    component: () => import('./yaml/YamlView.vue'),
  },
  {
    id: 'encode',
    name: 'Encode / decode',
    description: 'Base64 (standard or URL-safe), URL percent-encoding and HTML entities, both directions.',
    category: 'Encoding',
    keywords: ['base64', 'url encode', 'percent', 'html entities', 'escape', 'unescape'],
    component: () => import('./encode/EncodeView.vue'),
  },
  {
    id: 'hash',
    name: 'Hash generator',
    description: 'SHA-1, SHA-256, SHA-384 and SHA-512 digests and HMACs of text or files, via Web Crypto.',
    category: 'Security',
    keywords: ['sha256', 'sha1', 'sha512', 'checksum', 'digest', 'hmac'],
    component: () => import('./hash/HashView.vue'),
  },
  {
    id: 'uuid',
    name: 'UUID / ULID generator',
    description: 'Generate UUID v4, time-ordered UUID v7 and ULIDs in bulk, and inspect existing IDs.',
    category: 'Generators',
    keywords: ['guid', 'uuidv7', 'ulid', 'random id', 'identifier'],
    component: () => import('./ids/IdsView.vue'),
  },
  {
    id: 'timestamp',
    name: 'Unix timestamp converter',
    description: 'Convert Unix timestamps (s, ms, us, ns) and ISO dates across time zones, DST-aware.',
    category: 'Time',
    keywords: ['epoch', 'date', 'time zone', 'unix time', 'iso 8601', 'dst'],
    component: () => import('./timestamp/TimestampView.vue'),
  },
  {
    id: 'color',
    name: 'Color converter',
    description: 'Convert between HEX, RGB, HSL and OKLCH, and check WCAG contrast with fix suggestions.',
    category: 'Design',
    keywords: ['colour', 'hex', 'rgb', 'hsl', 'oklch', 'contrast', 'wcag', 'accessibility', 'a11y'],
    component: () => import('./color/ColorView.vue'),
  },
  {
    id: 'cron',
    name: 'Cron explainer',
    description: 'Explain a cron expression in plain English and list its next 10 run times.',
    category: 'Time',
    keywords: ['crontab', 'schedule', 'job', 'next run'],
    component: () => import('./cron/CronView.vue'),
  },
  {
    id: 'regex',
    name: 'Regex tester',
    description: 'Test JavaScript regular expressions with live highlighting, capture groups and replace.',
    category: 'Text',
    keywords: ['regular expression', 'regexp', 'match', 'capture group', 'replace'],
    component: () => import('./regex/RegexView.vue'),
  },
  {
    id: 'jwt',
    name: 'JWT decoder',
    description: 'Decode JSON Web Tokens, check exp/nbf, and verify HS256/384/512 signatures.',
    category: 'Security',
    keywords: ['json web token', 'bearer', 'hs256', 'signature', 'claims'],
    component: () => import('./jwt/JwtView.vue'),
  },
]

export function findTool(id: string): ToolDefinition | undefined {
  return tools.find((t) => t.id === id)
}

export function toolsByCategory(): { category: ToolCategory; tools: ToolDefinition[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    tools: tools.filter((t) => t.category === category),
  })).filter((g) => g.tools.length > 0)
}
