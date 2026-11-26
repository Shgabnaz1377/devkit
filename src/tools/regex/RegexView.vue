<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import CopyButton from '../../components/CopyButton.vue'
import { useToolState } from '../../composables/useToolState'
import { FLAG_INFO, buildRegex, groupNames, segmentText, splitLiteral, type MatchResult } from './regex'
import type { RegexJob, RegexJobResult } from './regex.worker'

const TIMEOUT_MS = 1500

const { state, shareUrl, reset } = useToolState('regex', {
  pattern: '(?<user>[\\w.+-]+)@(?<domain>[\\w-]+(?:\\.[\\w-]+)+)',
  flags: 'gi',
  text: 'Contact alice@example.com or bob.smith+dev@mail.example.org.\nInvalid: carol@localhost',
  replacement: '',
  replaceOn: false,
})

const FLAGS = ['g', 'i', 'm', 's', 'u', 'y', 'd'] as const

function toggleFlag(f: string): void {
  const set = new Set(state.flags)
  if (set.has(f)) set.delete(f)
  else set.add(f)
  state.flags = FLAGS.filter((x) => set.has(x)).join('')
}

// Pasting a /literal/flags into the pattern field adopts its flags.
watch(
  () => state.pattern,
  (p) => {
    const lit = splitLiteral(p)
    if (lit.flags !== null) {
      state.pattern = lit.pattern
      state.flags = lit.flags
    }
  },
)

const syntaxError = computed(() => {
  try {
    buildRegex(state.pattern, state.flags)
    return ''
  } catch (e) {
    return (e as Error).message
  }
})

let worker: Worker | null = null
let jobId = 0
let timer: ReturnType<typeof setTimeout> | undefined
let debounce: ReturnType<typeof setTimeout> | undefined
const result = ref<MatchResult | null>(null)
const replaced = ref<string | null>(null)
const runError = ref('')
const elapsed = ref(0)

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./regex.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<RegexJobResult>) => {
      if (e.data.id !== jobId) return
      clearTimeout(timer)
      if (e.data.ok) {
        result.value = e.data.result
        replaced.value = e.data.replaced
        elapsed.value = e.data.ms
        runError.value = ''
      } else {
        runError.value = e.data.error
      }
    }
  }
  return worker
}

function run(): void {
  clearTimeout(timer)
  if (syntaxError.value) {
    result.value = null
    return
  }
  const job: RegexJob = {
    id: ++jobId,
    pattern: state.pattern,
    flags: state.flags,
    text: state.text,
    replacement: state.replaceOn ? state.replacement : null,
  }
  getWorker().postMessage(job)
  timer = setTimeout(() => {
    // The regex is stuck (catastrophic backtracking): kill the worker and start fresh next time.
    worker?.terminate()
    worker = null
    result.value = null
    runError.value = `Stopped after ${TIMEOUT_MS / 1000}s: the pattern is probably backtracking catastrophically (e.g. nested quantifiers like (a+)+). Simplify it or make it more specific.`
  }, TIMEOUT_MS)
}

watch(
  () => [state.pattern, state.flags, state.text, state.replacement, state.replaceOn],
  () => {
    clearTimeout(debounce)
    debounce = setTimeout(run, 120)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearTimeout(timer)
  clearTimeout(debounce)
  worker?.terminate()
})

const segments = computed(() => (result.value ? segmentText(state.text, result.value.matches) : []))
const groupCount = computed(() => result.value?.matches[0]?.groups.length ?? 0)
const names = computed(() => groupNames(state.pattern))
</script>

<template>
  <ToolLayout tool-id="regex" :share-url="shareUrl" :reset="reset">
    <div class="stack">
      <div class="field">
        <label for="re-pattern">Pattern</label>
        <div class="pattern-row">
          <span class="slash" aria-hidden="true">/</span>
          <input
            id="re-pattern"
            v-model="state.pattern"
            class="mono"
            type="text"
            spellcheck="false"
            autocomplete="off"
            :aria-invalid="!!syntaxError"
            aria-describedby="re-status"
          />
          <span class="slash" aria-hidden="true">/{{ state.flags }}</span>
        </div>
      </div>
      <div class="row" role="group" aria-label="Flags">
        <label v-for="f in FLAGS" :key="f" class="flag" :title="FLAG_INFO[f]">
          <input type="checkbox" :checked="state.flags.includes(f)" @change="toggleFlag(f)" />
          <code>{{ f }}</code> <span class="muted">{{ FLAG_INFO[f]?.split(':')[0] }}</span>
        </label>
      </div>

      <div id="re-status" aria-live="polite">
        <p v-if="syntaxError" class="error" role="alert">{{ syntaxError }}</p>
        <p v-else-if="runError" class="error" role="alert">{{ runError }}</p>
        <p v-else-if="result" class="muted">
          <strong :class="result.matches.length ? 'ok' : ''">
            {{ result.matches.length }}{{ result.truncated ? '+' : '' }} match{{ result.matches.length === 1 ? '' : 'es' }}
          </strong>
          <template v-if="result.truncated"> (showing the first {{ result.matches.length }})</template>
          in {{ elapsed.toFixed(1) }} ms
        </p>
      </div>

      <div class="grid-2">
        <label class="field">
          Test string
          <textarea v-model="state.text" class="mono" rows="10" spellcheck="false"></textarea>
        </label>
        <div class="panel">
          <h2 class="panel-title">Highlighted</h2>
          <pre class="output hl" aria-label="Test string with matches highlighted"><template v-for="(s, i) in segments" :key="i"><mark v-if="s.match !== null" :class="['m' + (s.match % 2), { empty: s.text === '' }]" :title="`Match ${s.match + 1}`">{{ s.text }}</mark><template v-else>{{ s.text }}</template></template></pre>
        </div>
      </div>

      <section v-if="result && result.matches.length" class="panel">
        <h2 class="panel-title">Matches and groups</h2>
        <div class="table-wrap">
          <table class="kv matches">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Range</th>
                <th scope="col">Match</th>
                <th v-for="g in groupCount" :key="g" scope="col">{{ names.get(g) ?? `Group ${g}` }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(m, i) in result.matches.slice(0, 200)" :key="i">
                <td>{{ i + 1 }}</td>
                <td>{{ m.index }}&ndash;{{ m.end }}</td>
                <td>{{ m.text === '' ? '(empty)' : m.text }}</td>
                <td v-for="(g, gi) in m.groups" :key="gi">
                  <span v-if="g === undefined" class="muted">(no match)</span><template v-else>{{ g }}</template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel stack">
        <label class="toggle"><input v-model="state.replaceOn" type="checkbox" /> Replace</label>
        <template v-if="state.replaceOn">
          <label class="field">
            Replacement <span class="hint">Use $1, $&lt;name&gt;, $&amp; for back-references.</span>
            <input v-model="state.replacement" class="mono" type="text" spellcheck="false" />
          </label>
          <div v-if="replaced !== null">
            <h3 class="panel-title">Result <CopyButton :text="replaced" /></h3>
            <pre class="output">{{ replaced }}</pre>
          </div>
        </template>
      </section>
    </div>
  </ToolLayout>
</template>

<style scoped>
.pattern-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pattern-row input {
  font-size: 1.1rem;
}
.slash {
  font-family: var(--mono);
  font-size: 1.2rem;
  color: var(--muted);
  white-space: nowrap;
}
.flag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.88rem;
  cursor: pointer;
}
.flag input {
  accent-color: var(--accent);
}
.hl {
  min-height: 200px;
}
mark {
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
}
mark.m0 {
  background: var(--hl-1);
}
mark.m1 {
  background: var(--hl-2);
}
mark.empty {
  display: inline-block;
  width: 2px;
  height: 1.1em;
  vertical-align: text-bottom;
  background: var(--accent);
  padding: 0;
}
.table-wrap {
  overflow-x: auto;
}
.matches th {
  color: var(--muted);
}
.matches td {
  white-space: pre;
}
</style>
