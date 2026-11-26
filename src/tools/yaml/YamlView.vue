<script setup lang="ts">
import { computed } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import CopyButton from '../../components/CopyButton.vue'
import { useToolState } from '../../composables/useToolState'
import { jsonToYaml, yamlToJson } from './yaml'

const SAMPLE = `# CI pipeline
name: build
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`

const { state, shareUrl, reset } = useToolState('yaml', {
  direction: 'yaml-to-json' as 'yaml-to-json' | 'json-to-yaml',
  input: SAMPLE,
  indent: 2 as 2 | 4,
})

const result = computed(() => {
  if (state.input.trim() === '') return null
  return state.direction === 'yaml-to-json' ? yamlToJson(state.input, state.indent) : jsonToYaml(state.input, state.indent)
})
const fromLabel = computed(() => (state.direction === 'yaml-to-json' ? 'YAML' : 'JSON'))
const toLabel = computed(() => (state.direction === 'yaml-to-json' ? 'JSON' : 'YAML'))

function flip(): void {
  const r = result.value
  state.direction = state.direction === 'yaml-to-json' ? 'json-to-yaml' : 'yaml-to-json'
  if (r?.ok) state.input = r.output
}
</script>

<template>
  <ToolLayout tool-id="yaml" :share-url="shareUrl" :reset="reset">
    <div class="row controls">
      <div class="segmented" role="group" aria-label="Direction">
        <button type="button" :aria-pressed="state.direction === 'yaml-to-json'" @click="state.direction = 'yaml-to-json'">YAML to JSON</button>
        <button type="button" :aria-pressed="state.direction === 'json-to-yaml'" @click="state.direction = 'json-to-yaml'">JSON to YAML</button>
      </div>
      <div class="segmented" role="group" aria-label="Indentation">
        <button type="button" :aria-pressed="state.indent === 2" @click="state.indent = 2">2 spaces</button>
        <button type="button" :aria-pressed="state.indent === 4" @click="state.indent = 4">4 spaces</button>
      </div>
      <button type="button" class="btn ghost" :disabled="!result?.ok" @click="flip">Use output as input</button>
    </div>

    <div class="grid-2">
      <label class="field">
        {{ fromLabel }} input
        <textarea v-model="state.input" class="mono tall" spellcheck="false" :aria-invalid="result !== null && !result.ok"></textarea>
      </label>
      <section class="stack" :aria-label="`${toLabel} output`">
        <p v-if="result === null" class="muted">Paste {{ fromLabel }} to convert it.</p>
        <p v-else-if="!result.ok" class="error" role="alert">
          <template v-if="result.error.line">Line {{ result.error.line }}, column {{ result.error.column }}: </template>{{ result.error.message }}
        </p>
        <template v-else>
          <ul v-if="result.notes.length" class="warn notes">
            <li v-for="n in result.notes" :key="n">{{ n }}</li>
          </ul>
          <div class="panel">
            <h2 class="panel-title">{{ toLabel }} <CopyButton :text="result.output" /></h2>
            <pre class="output">{{ result.output }}</pre>
          </div>
        </template>
      </section>
    </div>
  </ToolLayout>
</template>

<style scoped>
.controls {
  margin-bottom: 14px;
}
.tall {
  min-height: 420px;
}
.notes {
  margin: 0;
  padding-left: 20px;
}
</style>
