<script setup lang="ts">
import { computed } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import { useToolState } from '../../composables/useToolState'
import { diffJson, parseJson, type JsonChange } from './json'

const { state, shareUrl, reset } = useToolState('json-diff', {
  left: '{\n  "name": "devkit",\n  "version": "1.0.0",\n  "tools": ["jwt", "json"],\n  "build": { "minify": true }\n}',
  right: '{\n  "name": "devkit",\n  "version": "1.1.0",\n  "tools": ["jwt", "json", "cron"],\n  "build": {},\n  "license": "MIT"\n}',
})

const left = computed(() => parseJson(state.left))
const right = computed(() => parseJson(state.right))
const changes = computed<JsonChange[] | null>(() =>
  left.value.ok && right.value.ok ? diffJson(left.value.value, right.value.value) : null,
)
const counts = computed(() => {
  const c = { added: 0, removed: 0, changed: 0 }
  for (const ch of changes.value ?? []) c[ch.kind]++
  return c
})

const show = (v: unknown) => JSON.stringify(v)

function swap(): void {
  ;[state.left, state.right] = [state.right, state.left]
}
</script>

<template>
  <ToolLayout tool-id="json-diff" :share-url="shareUrl" :reset="reset">
    <div class="grid-2">
      <label class="field">
        Original
        <textarea v-model="state.left" class="mono" rows="12" spellcheck="false" :aria-invalid="!left.ok"></textarea>
      </label>
      <label class="field">
        Changed
        <textarea v-model="state.right" class="mono" rows="12" spellcheck="false" :aria-invalid="!right.ok"></textarea>
      </label>
    </div>
    <div class="row actions">
      <button type="button" class="btn ghost" @click="swap">Swap sides</button>
      <span class="muted">Objects are compared by key (order does not matter), arrays by position.</span>
    </div>

    <p v-if="!left.ok" class="error" role="alert">
      Original, line {{ left.error.line }} column {{ left.error.column }}: {{ left.error.message }}
    </p>
    <p v-if="!right.ok" class="error" role="alert">
      Changed, line {{ right.error.line }} column {{ right.error.column }}: {{ right.error.message }}
    </p>

    <section v-if="changes" class="panel" aria-live="polite">
      <h2 class="panel-title">
        <span v-if="changes.length === 0" class="ok">The documents are structurally identical</span>
        <span v-else>{{ changes.length }} difference{{ changes.length === 1 ? '' : 's' }}</span>
        <span v-if="changes.length" class="muted counts">
          +{{ counts.added }} added, -{{ counts.removed }} removed, ~{{ counts.changed }} changed
        </span>
      </h2>
      <ul v-if="changes.length" class="changes">
        <li v-for="c in changes" :key="c.kind + c.path" :class="c.kind">
          <span class="badge">{{ c.kind === 'added' ? '+' : c.kind === 'removed' ? '-' : '~' }}</span>
          <code class="path">{{ c.path }}</code>
          <span v-if="c.kind === 'added'" class="mono">{{ show(c.after) }}</span>
          <span v-else-if="c.kind === 'removed'" class="mono">{{ show(c.before) }}</span>
          <span v-else class="mono"><del>{{ show(c.before) }}</del> &rarr; <ins>{{ show(c.after) }}</ins></span>
        </li>
      </ul>
    </section>
  </ToolLayout>
</template>

<style scoped>
.actions {
  margin: 12px 0;
}
.counts {
  font-weight: 400;
  font-size: 0.88rem;
}
.changes {
  list-style: none;
  margin: 0;
  padding: 0;
}
.changes li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: baseline;
  padding: 6px 8px;
  border-radius: 6px;
  margin-bottom: 4px;
  word-break: break-all;
}
.changes li.added {
  background: var(--add-bg);
}
.changes li.removed {
  background: var(--del-bg);
}
.changes li.changed {
  background: var(--surface-2);
}
.badge {
  font-family: var(--mono);
  font-weight: 700;
  width: 1ch;
}
.path {
  font-weight: 600;
}
del {
  background: var(--del-bg);
}
ins {
  background: var(--add-bg);
  text-decoration: none;
}
</style>
