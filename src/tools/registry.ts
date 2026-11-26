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
export const tools: readonly ToolDefinition[] = []

export function findTool(id: string): ToolDefinition | undefined {
  return tools.find((t) => t.id === id)
}

export function toolsByCategory(): { category: ToolCategory; tools: ToolDefinition[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    tools: tools.filter((t) => t.category === category),
  })).filter((g) => g.tools.length > 0)
}
