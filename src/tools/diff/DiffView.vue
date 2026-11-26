<script setup lang="ts">
import { computed } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import CopyButton from '../../components/CopyButton.vue'
import { useToolState } from '../../composables/useToolState'
import { diffLines, diffStats, diffWords, toSideBySide, unifiedDiff, type DiffLine } from './diff'

const { state, shareUrl, reset } = useToolState('text-diff', {
  left: 'server:\n  port: 8080\n  host: localhost\nlogging:\n  level: info\nfeatures:\n  - search\n  - export',
  right: 'server:\n  port: 9090\n  host: localhost\nlogging:\n  level: debug\n  format: json\nfeatures:\n  - search',
  view: 'split' as 'split' | 'unified',
  ignoreWhitespace: false,
  ignoreCase: false,
})

const MAX_LINES = 50_000
const tooBig = computed(() => {
  const count = (s: string) => s.split('\n').length
  return count(state.left) > MAX_LINES || count(state.right) > MAX_LINES
})

const lines = computed(() =>
  tooBig.value ? [] : diffLines(state.left, state.right, { ignoreWhitespace: state.ignoreWhitespace, ignoreCase: state.ignoreCase }),
)
const stats = computed(() => diffStats(lines.value))
const rows = computed(() => toSideBySide(lines.value))
const patch = computed(() => unifiedDiff(lines.value, 3, 'original', 'changed'))
const identical = computed(() => !tooBig.value && stats.value.added === 0 && stats.value.removed === 0)

/** Word-level parts for a changed pair, or null to render the whole line. */
function words(left: DiffLine | undefined, right: DiffLine | undefined, side: 'left' | 'right') {
  if (!left || !right || left.op === 'equal') return null
  return diffWords(left.text, right.text).filter((p) => p.op === 'equal' || p.op === (side === 'left' ? 'delete' : 'insert'))
}

function swap(): void {
  ;[state.left, state.right] = [state.right, state.left]
}
</script>

<template>
  <ToolLayout tool-id="text-diff" :share-url="shareUrl" :reset="reset">
    <div class="grid-2">
      <label class="field">
        Original
        <textarea v-model="state.left" class="mono" rows="10" spellcheck="false"></textarea>
      </label>
      <label class="field">
        Changed
        <textarea v-model="state.right" class="mono" rows="10" spellcheck="false"></textarea>
      </label>
    </div>

    <div class="row controls">
      <div class="segmented" role="group" aria-label="View">
        <button type="button" :aria-pressed="state.view === 'split'" @click="state.view = 'split'">Side by side</button>
        <button type="button" :aria-pressed="state.view === 'unified'" @click="state.view = 'unified'">Unified</button>
      </div>
      <label class="toggle"><input v-model="state.ignoreWhitespace" type="checkbox" /> Ignore whitespace</label>
      <label class="toggle"><input v-model="state.ignoreCase" type="checkbox" /> Ignore case</label>
      <button type="button" class="btn ghost" @click="swap">Swap sides</button>
      <span v-if="!tooBig && !identical" class="stats" aria-live="polite">
        <span class="added">+{{ stats.added }}</span> <span class="removed">-{{ stats.removed }}</span> <span class="muted">{{ stats.unchanged }} unchanged</span>
      </span>
    </div>

    <p v-if="tooBig" class="error" role="alert">
      One side has more than {{ MAX_LINES.toLocaleString() }} lines. Diffing that much text in the browser would freeze the page.
    </p>
    <p v-else-if="identical" class="ok" aria-live="polite">
      No differences{{ state.ignoreWhitespace || state.ignoreCase ? ' (with the current ignore options)' : '' }}.
    </p>

    <section v-else-if="state.view === 'split'" class="panel diff-wrap" aria-label="Side-by-side diff">
      <table class="diff split">
        <tbody>
          <tr v-for="(r, i) in rows" :key="i">
            <td class="num">{{ r.left?.aLine ?? '' }}</td>
            <td :class="['code', r.left ? r.left.op : 'empty']">
              <template v-if="r.left">
                <template v-if="words(r.left, r.right, 'left')">
                  <template v-for="(p, pi) in words(r.left, r.right, 'left')" :key="pi"><span :class="{ wd: p.op === 'delete' }">{{ p.text }}</span></template>
                </template>
                <template v-else>{{ r.left.text }}</template>
              </template>
            </td>
            <td class="num">{{ r.right?.bLine ?? '' }}</td>
            <td :class="['code', r.right ? r.right.op : 'empty']">
              <template v-if="r.right">
                <template v-if="words(r.left, r.right, 'right')">
                  <template v-for="(p, pi) in words(r.left, r.right, 'right')" :key="pi"><span :class="{ wi: p.op === 'insert' }">{{ p.text }}</span></template>
                </template>
                <template v-else>{{ r.right.text }}</template>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-else class="panel" aria-label="Unified diff">
      <h2 class="panel-title">Unified diff <CopyButton :text="patch" label="Copy patch" /></h2>
      <pre class="output unified"><template v-for="(l, i) in patch.split('\n')" :key="i"><span :class="{ add: l.startsWith('+') && !l.startsWith('+++'), del: l.startsWith('-') && !l.startsWith('---'), hunk: l.startsWith('@@') }">{{ l }}</span>
</template></pre>
    </section>
  </ToolLayout>
</template>

<style scoped>
.controls {
  margin: 12px 0;
}
.stats {
  margin-left: auto;
  font-family: var(--mono);
  font-weight: 600;
}
.added {
  color: var(--success);
}
.removed {
  color: var(--danger);
}
.diff-wrap {
  overflow-x: auto;
  padding: 0;
}
table.diff {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--mono);
  font-size: 0.85rem;
  table-layout: fixed;
}
.diff .num {
  width: 3.5em;
  text-align: right;
  padding: 1px 8px;
  color: var(--muted);
  user-select: none;
  vertical-align: top;
}
.diff .code {
  white-space: pre-wrap;
  word-break: break-word;
  padding: 1px 8px;
}
.diff .delete {
  background: var(--del-bg);
}
.diff .insert {
  background: var(--add-bg);
}
.diff .empty {
  background: var(--surface-2);
}
.wd {
  background: color-mix(in srgb, var(--danger) 30%, transparent);
  border-radius: 2px;
}
.wi {
  background: color-mix(in srgb, var(--success) 30%, transparent);
  border-radius: 2px;
}
.unified .add {
  background: var(--add-bg);
  display: inline-block;
  width: 100%;
}
.unified .del {
  background: var(--del-bg);
  display: inline-block;
  width: 100%;
}
.unified .hunk {
  color: var(--accent);
}
.unified {
  white-space: pre;
}
</style>
