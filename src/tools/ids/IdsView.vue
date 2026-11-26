<script setup lang="ts">
import { computed, ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import CopyButton from '../../components/CopyButton.vue'
import { useToolState } from '../../composables/useToolState'
import { createUlidGenerator, createUuidV7Generator, inspectId, uuidv4 } from './ids'

type Kind = 'v4' | 'v7' | 'ulid'

const { state, shareUrl, reset } = useToolState('uuid', {
  kind: 'v7' as Kind,
  count: 5,
  uppercase: false,
  hyphens: true,
  inspect: '017f22e2-79b0-7cc3-98c4-dc0c0c07398f',
})

const v7 = createUuidV7Generator()
const ulid = createUlidGenerator()
const generated = ref<string[]>([])
const countError = computed(() =>
  Number.isInteger(state.count) && state.count >= 1 && state.count <= 1000 ? '' : 'Choose a whole number between 1 and 1000.',
)

function generate(): void {
  if (countError.value) return
  const make = state.kind === 'v4' ? () => uuidv4() : state.kind === 'v7' ? v7 : ulid
  generated.value = Array.from({ length: state.count }, make)
}
generate()

const display = computed(() =>
  generated.value.map((id) => {
    let s = id
    if (state.kind !== 'ulid' && !state.hyphens) s = s.replace(/-/g, '')
    return state.kind === 'ulid' ? s : state.uppercase ? s.toUpperCase() : s
  }),
)
const allText = computed(() => display.value.join('\n'))

const inspected = computed(() => {
  if (state.inspect.trim() === '') return null
  try {
    return { ok: true as const, info: inspectId(state.inspect) }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const kinds: { id: Kind; label: string; hint: string }[] = [
  { id: 'v7', label: 'UUID v7', hint: 'Time-ordered: sorts by creation time. Good database keys.' },
  { id: 'v4', label: 'UUID v4', hint: '122 random bits. No embedded information.' },
  { id: 'ulid', label: 'ULID', hint: '26-character, time-ordered, Crockford base32.' },
]
</script>

<template>
  <ToolLayout tool-id="uuid" :share-url="shareUrl" :reset="reset">
    <div class="grid-2">
      <section class="stack">
        <div class="segmented" role="group" aria-label="ID type">
          <button v-for="k in kinds" :key="k.id" type="button" :aria-pressed="state.kind === k.id" @click="state.kind = k.id">{{ k.label }}</button>
        </div>
        <p class="muted hint">{{ kinds.find((k) => k.id === state.kind)?.hint }}</p>
        <div class="row">
          <label class="field count">
            How many
            <input v-model.number="state.count" type="number" min="1" max="1000" :aria-invalid="!!countError" />
          </label>
          <template v-if="state.kind !== 'ulid'">
            <label class="toggle"><input v-model="state.uppercase" type="checkbox" /> Uppercase</label>
            <label class="toggle"><input v-model="state.hyphens" type="checkbox" /> Hyphens</label>
          </template>
        </div>
        <p v-if="countError" class="error" role="alert">{{ countError }}</p>
        <div class="row">
          <button type="button" class="btn" :disabled="!!countError" @click="generate">Generate</button>
          <CopyButton :text="allText" label="Copy all" />
        </div>
        <ol class="output ids" aria-label="Generated IDs" aria-live="polite">
          <li v-for="(id, i) in display" :key="i">{{ id }}</li>
        </ol>
      </section>

      <section class="panel stack">
        <h2 class="panel-title">Inspect an ID</h2>
        <label class="field">
          UUID or ULID
          <input v-model="state.inspect" class="mono" type="text" spellcheck="false" autocomplete="off" />
        </label>
        <p v-if="inspected && !inspected.ok" class="error" role="alert">{{ inspected.error }}</p>
        <table v-else-if="inspected?.ok" class="kv">
          <tbody>
            <tr><th scope="row">Type</th><td>{{ inspected.info.kind === 'ulid' ? 'ULID' : 'UUID' }}</td></tr>
            <tr><th scope="row">Canonical</th><td>{{ inspected.info.canonical }}</td></tr>
            <tr v-if="inspected.info.version !== undefined"><th scope="row">Version</th><td>{{ inspected.info.version }}</td></tr>
            <tr v-if="inspected.info.variant"><th scope="row">Variant</th><td>{{ inspected.info.variant }}</td></tr>
            <tr v-if="inspected.info.time">
              <th scope="row">Created</th>
              <td>{{ inspected.info.time.toISOString() }}<br /><span class="muted">{{ inspected.info.time.toLocaleString() }} local</span></td>
            </tr>
          </tbody>
        </table>
        <ul v-if="inspected?.ok && inspected.info.notes.length" class="muted notes">
          <li v-for="n in inspected.info.notes" :key="n">{{ n }}</li>
        </ul>
      </section>
    </div>
  </ToolLayout>
</template>

<style scoped>
.hint {
  margin: 0;
}
.count {
  max-width: 140px;
}
.ids {
  padding-left: 44px;
  line-height: 1.8;
  max-height: 460px;
}
.notes {
  margin: 0;
  padding-left: 20px;
}
</style>
