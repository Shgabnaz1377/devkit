<script setup lang="ts">
import { computed } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import CopyButton from '../../components/CopyButton.vue'
import { useToolState } from '../../composables/useToolState'
import { base64Decode, base64Encode, htmlDecode, htmlEncode, urlDecode, urlEncode, type UrlMode } from './encode'

type Codec = 'base64' | 'url' | 'html'
type Direction = 'encode' | 'decode'

const { state, shareUrl, reset } = useToolState('encode', {
  codec: 'base64' as Codec,
  direction: 'encode' as Direction,
  input: 'Hello, world! \u{1F44B} <devkit> & friends',
  urlSafe: false,
  padding: true,
  urlMode: 'component' as UrlMode,
  htmlNonAscii: false,
})

interface Output {
  ok: boolean
  text: string
  note?: string
}

const output = computed<Output>(() => {
  const input = state.input
  if (input === '') return { ok: true, text: '' }
  try {
    if (state.codec === 'base64') {
      if (state.direction === 'encode') return { ok: true, text: base64Encode(input, { urlSafe: state.urlSafe, padding: state.padding }) }
      const d = base64Decode(input)
      return d.kind === 'text'
        ? { ok: true, text: d.text }
        : { ok: true, text: d.hex, note: `The decoded ${d.length} bytes are not valid UTF-8 text, so they are shown as hex.` }
    }
    if (state.codec === 'url') {
      return { ok: true, text: state.direction === 'encode' ? urlEncode(input, state.urlMode) : urlDecode(input, state.urlMode) }
    }
    if (state.direction === 'encode') return { ok: true, text: htmlEncode(input, { nonAscii: state.htmlNonAscii }) }
    const r = htmlDecode(input)
    return { ok: true, text: r.text, note: r.unknown.length ? `Left unchanged (unknown entities): ${r.unknown.join(' ')}` : undefined }
  } catch (e) {
    return { ok: false, text: '', note: (e as Error).message }
  }
})

function swap(): void {
  if (!output.value.ok) return
  state.input = output.value.text
  state.direction = state.direction === 'encode' ? 'decode' : 'encode'
}

const codecs: { id: Codec; label: string }[] = [
  { id: 'base64', label: 'Base64' },
  { id: 'url', label: 'URL' },
  { id: 'html', label: 'HTML entities' },
]
</script>

<template>
  <ToolLayout tool-id="encode" :share-url="shareUrl" :reset="reset">
    <div class="row controls">
      <div class="segmented" role="group" aria-label="Encoding">
        <button v-for="c in codecs" :key="c.id" type="button" :aria-pressed="state.codec === c.id" @click="state.codec = c.id">{{ c.label }}</button>
      </div>
      <div class="segmented" role="group" aria-label="Direction">
        <button type="button" :aria-pressed="state.direction === 'encode'" @click="state.direction = 'encode'">Encode</button>
        <button type="button" :aria-pressed="state.direction === 'decode'" @click="state.direction = 'decode'">Decode</button>
      </div>
      <template v-if="state.codec === 'base64' && state.direction === 'encode'">
        <label class="toggle"><input v-model="state.urlSafe" type="checkbox" /> URL-safe alphabet</label>
        <label class="toggle"><input v-model="state.padding" type="checkbox" /> Padding</label>
      </template>
      <label v-if="state.codec === 'url'" class="field inline">
        <span class="sr-only">URL mode</span>
        <select v-model="state.urlMode" aria-label="URL encoding mode">
          <option value="component">Component (encodeURIComponent)</option>
          <option value="uri">Full URI (encodeURI)</option>
          <option value="form">Form data (+ for spaces)</option>
        </select>
      </label>
      <label v-if="state.codec === 'html' && state.direction === 'encode'" class="toggle">
        <input v-model="state.htmlNonAscii" type="checkbox" /> Encode non-ASCII too
      </label>
    </div>

    <div class="grid-2">
      <label class="field">
        Input
        <textarea v-model="state.input" class="mono tall" spellcheck="false" :aria-invalid="!output.ok"></textarea>
      </label>
      <section class="stack" aria-label="Output">
        <p v-if="!output.ok" class="error" role="alert">{{ output.note }}</p>
        <template v-else>
          <p v-if="output.note" class="warn">{{ output.note }}</p>
          <div class="panel">
            <h2 class="panel-title">
              Output
              <span class="row">
                <button type="button" class="btn small ghost" @click="swap">Use as input</button>
                <CopyButton :text="output.text" />
              </span>
            </h2>
            <pre class="output">{{ output.text }}</pre>
            <p class="muted small">{{ [...state.input].length }} characters in, {{ [...output.text].length }} out</p>
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
  min-height: 320px;
}
.field.inline {
  width: auto;
}
.small {
  font-size: 0.82rem;
  margin: 8px 0 0;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
