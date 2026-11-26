<script setup lang="ts">
import { computed, ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import CopyButton from '../../components/CopyButton.vue'
import JsonTree from './JsonTree.vue'
import { useToolState } from '../../composables/useToolState'
import { findUnsafeIntegers, formatJson, jsonStats, parseJson, type Indent } from './json'

const SAMPLE = '{"name":"devkit","private":true,"tools":["jwt","json","cron"],"limits":{"maxInput":1048576,"ratio":0.75},"owner":null}'

const { state, shareUrl, reset } = useToolState('json', {
  input: SAMPLE,
  indent: 2 as Indent,
  sortKeys: false,
  view: 'text' as 'text' | 'tree',
})

const textarea = ref<HTMLTextAreaElement | null>(null)
const parsed = computed(() => (state.input.trim() === '' ? null : parseJson(state.input)))
const output = computed(() => (parsed.value?.ok ? formatJson(parsed.value.value, state.indent, state.sortKeys) : ''))
const stats = computed(() => (parsed.value?.ok ? jsonStats(parsed.value.value) : null))
const unsafe = computed(() => (parsed.value?.ok ? findUnsafeIntegers(state.input) : []))

const indents: { label: string; value: Indent }[] = [
  { label: '2 spaces', value: 2 },
  { label: '4 spaces', value: 4 },
  { label: 'Tab', value: '\t' },
  { label: 'Minify', value: 0 },
]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function applyToInput(): void {
  if (output.value) state.input = output.value
}

function jumpToError(): void {
  const r = parsed.value
  if (!r || r.ok || !textarea.value) return
  textarea.value.focus()
  textarea.value.setSelectionRange(r.error.offset, r.error.offset + 1)
}
</script>

<template>
  <ToolLayout tool-id="json" :share-url="shareUrl" :reset="reset">
    <div class="row controls">
      <div class="segmented" role="group" aria-label="Indentation">
        <button v-for="o in indents" :key="o.label" type="button" :aria-pressed="state.indent === o.value" @click="state.indent = o.value">
          {{ o.label }}
        </button>
      </div>
      <label class="toggle"><input v-model="state.sortKeys" type="checkbox" /> Sort keys</label>
      <div class="segmented" role="group" aria-label="Output view">
        <button type="button" :aria-pressed="state.view === 'text'" @click="state.view = 'text'">Text</button>
        <button type="button" :aria-pressed="state.view === 'tree'" @click="state.view = 'tree'">Tree</button>
      </div>
    </div>

    <div class="grid-2">
      <label class="field">
        Input
        <textarea
          ref="textarea"
          v-model="state.input"
          class="mono tall"
          spellcheck="false"
          :aria-invalid="parsed !== null && !parsed.ok"
          aria-describedby="json-status"
        ></textarea>
      </label>

      <section class="stack" aria-label="Result">
        <div id="json-status">
          <p v-if="parsed === null" class="muted">Paste JSON to validate and format it.</p>
          <div v-else-if="!parsed.ok" class="error" role="alert">
            <strong>Line {{ parsed.error.line }}, column {{ parsed.error.column }}:</strong> {{ parsed.error.message }}.
            <template v-if="parsed.error.hint"><br />{{ parsed.error.hint }}</template>
            <br /><button type="button" class="btn small ghost jump" @click="jumpToError">Select it in the input</button>
          </div>
          <p v-else class="ok">
            Valid JSON
            <span v-if="stats" class="muted stats">
              {{ plural(stats.objects, 'object') }}, {{ plural(stats.arrays, 'array') }}, {{ plural(stats.keys, 'key') }}, depth {{ stats.maxDepth }}
            </span>
          </p>
          <p v-if="unsafe.length" class="warn">
            {{ unsafe.length }} integer(s) exceed 2^53 and lose precision when parsed (e.g. {{ unsafe[0] }}).
          </p>
        </div>

        <div v-if="parsed?.ok" class="panel">
          <h2 class="panel-title">
            Output
            <span class="row">
              <button type="button" class="btn small ghost" @click="applyToInput">Replace input</button>
              <CopyButton :text="output" />
            </span>
          </h2>
          <pre v-if="state.view === 'text'" class="output">{{ output }}</pre>
          <div v-else class="output tree"><JsonTree :value="parsed.value" /></div>
        </div>
      </section>
    </div>
  </ToolLayout>
</template>

<style scoped>
.controls {
  margin-bottom: 14px;
}
.tall {
  min-height: 440px;
}
.stats {
  font-weight: 400;
  margin-left: 8px;
}
.jump {
  margin-top: 6px;
}
.tree {
  white-space: normal;
}
</style>
