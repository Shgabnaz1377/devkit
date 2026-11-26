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
