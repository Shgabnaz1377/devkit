<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fuzzyRank } from '../lib/fuzzy'
import { tools } from '../tools/registry'
import { cycleTheme, settings } from '../composables/useSettings'

const open = defineModel<boolean>('open', { required: true })

interface Command {
  id: string
  label: string
  hint: string
  keywords: readonly string[]
  run: () => void
}

const router = useRouter()
const query = ref('')
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLUListElement | null>(null)
let returnFocus: HTMLElement | null = null

const commands = computed<Command[]>(() => [
  ...tools.map((t) => ({
    id: `tool-${t.id}`,
    label: t.name,
    hint: t.category,
    keywords: [...t.keywords, t.description],
    run: () => void router.push(`/${t.id}`),
  })),
  {
    id: 'home',
    label: 'Go to home',
    hint: 'Navigate',
    keywords: ['all tools', 'index'],
    run: () => void router.push('/'),
  },
  {
    id: 'theme',
    label: `Switch theme (now: ${settings.theme})`,
    hint: 'Settings',
    keywords: ['dark mode', 'light mode', 'appearance'],
    run: cycleTheme,
  },
  {
    id: 'remember',
    label: settings.remember ? 'Stop remembering tool input' : 'Remember tool input',
    hint: 'Privacy',
    keywords: ['localstorage', 'persist', 'history', 'forget'],
    run: () => {
      settings.remember = !settings.remember
    },
  },
])

const results = computed(() => fuzzyRank(query.value, commands.value))

watch(results, () => {
  active.value = 0
})

watch(open, async (isOpen) => {
  if (isOpen) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    query.value = ''
    active.value = 0
    await nextTick()
    input.value?.focus()
  } else {
    returnFocus?.focus()
  }
})

function close(): void {
  open.value = false
}

function runAt(index: number): void {
  const cmd = results.value[index]?.item
  if (!cmd) return
  close()
  cmd.run()
}

function move(delta: number): void {
  const n = results.value.length
  if (n === 0) return
  active.value = (active.value + delta + n) % n
  void nextTick(() => {
    list.value?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)?.scrollIntoView({ block: 'nearest' })
  })
}

function onKeydown(e: KeyboardEvent): void {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      move(-1)
      break
    case 'Home':
      if (e.ctrlKey) {
        e.preventDefault()
        active.value = 0
      }
      break
    case 'Enter':
      e.preventDefault()
      runAt(active.value)
      break
    case 'Escape':
      e.preventDefault()
      close()
      break
    case 'Tab':
      // Keep focus inside the dialog; the input is the only tab stop.
      e.preventDefault()
      break
  }
}

function highlight(label: string, indices: number[]): { text: string; hit: boolean }[] {
  if (indices.length === 0) return [{ text: label, hit: false }]
  const set = new Set(indices)
  const parts: { text: string; hit: boolean }[] = []
  for (let i = 0; i < label.length; i++) {
    const hit = set.has(i)
    const last = parts[parts.length - 1]
    if (last && last.hit === hit) last.text += label[i]
    else parts.push({ text: label[i] ?? '', hit })
  }
  return parts
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="palette-backdrop" data-testid="palette" @mousedown.self="close">
      <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette" @keydown="onKeydown">
        <input
          ref="input"
          v-model="query"
          class="palette-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-autocomplete="list"
          :aria-activedescendant="results.length ? `palette-opt-${active}` : undefined"
          placeholder="Search tools and actions..."
          spellcheck="false"
          autocomplete="off"
        />
        <ul id="palette-list" ref="list" class="palette-list" role="listbox" aria-label="Results">
          <li
            v-for="(r, i) in results"
            :id="`palette-opt-${i}`"
            :key="r.item.id"
            :data-index="i"
            role="option"
            :aria-selected="i === active"
            :class="{ active: i === active }"
            @mousemove="active = i"
            @click="runAt(i)"
          >
            <span class="label">
              <template v-for="(part, pi) in highlight(r.item.label, r.indices)" :key="pi">
                <mark v-if="part.hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template>
              </template>
            </span>
            <span class="hint">{{ r.item.hint }}</span>
          </li>
          <li v-if="results.length === 0" class="empty" role="presentation">No matches for "{{ query }}"</li>
        </ul>
        <div class="palette-footer" aria-hidden="true">
          <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> move</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 0.45);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 16px 16px;
  z-index: 100;
}
.palette {
  width: min(640px, 100%);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 24px 64px rgb(0 0 0 / 0.35);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}
.palette-input {
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  padding: 16px 18px;
  font-size: 1.05rem;
  background: transparent;
}
.palette-input:focus-visible {
  outline: none;
  box-shadow: none;
}
.palette-list {
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
}
.palette-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.palette-list li.active {
  background: var(--accent-soft);
}
.palette-list mark {
  background: none;
  color: var(--accent);
  font-weight: 700;
}
.hint {
  color: var(--muted);
  font-size: 0.85rem;
  white-space: nowrap;
}
.empty {
  color: var(--muted);
  cursor: default !important;
}
.palette-footer {
  display: flex;
  gap: 16px;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  font-size: 0.8rem;
  color: var(--muted);
}
</style>
