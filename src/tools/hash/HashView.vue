<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import CopyButton from '../../components/CopyButton.vue'
import { useToolState } from '../../composables/useToolState'
import {
  ALGORITHM_NOTES,
  HASH_ALGORITHMS,
  digestBytes,
  digestMatches,
  formatDigest,
  hmac,
  type DigestFormat,
  type HashAlgorithm,
} from './hash'

// The HMAC key is private: never persisted or shared.
const { state, shareUrl, reset } = useToolState(
  'hash',
  { input: 'The quick brown fox jumps over the lazy dog', format: 'hex' as DigestFormat, useHmac: false, key: '', expected: '' },
  { privateKeys: ['key'] },
)

const MAX_FILE = 512 * 1024 * 1024
const file = shallowRef<{ name: string; bytes: Uint8Array } | null>(null)
const fileError = ref('')
const results = ref<{ alg: HashAlgorithm; bytes: Uint8Array }[]>([])
const error = ref('')
const busy = ref(false)

async function onFile(e: Event): Promise<void> {
  const f = (e.target as HTMLInputElement).files?.[0]
  fileError.value = ''
  if (!f) return
  if (f.size > MAX_FILE) {
    fileError.value = `"${f.name}" is ${(f.size / 1048576).toFixed(0)} MB; the limit is 512 MB because the file is hashed in memory.`
    return
  }
  file.value = { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }
}

function clearFile(): void {
  file.value = null
}

let seq = 0
watch(
  () => [state.input, state.useHmac, state.key, file.value] as const,
  async () => {
    const mine = ++seq
    const data = file.value?.bytes ?? new TextEncoder().encode(state.input)
    busy.value = true
    try {
      const out = await Promise.all(
        HASH_ALGORITHMS.map(async (alg) => ({
          alg,
          bytes: state.useHmac ? await hmac(data, new TextEncoder().encode(state.key), alg) : await digestBytes(data, alg),
        })),
      )
      if (mine === seq) {
        results.value = out
        error.value = ''
      }
    } catch (e) {
      if (mine === seq) {
        results.value = []
        error.value = (e as Error).message
      }
    } finally {
      if (mine === seq) busy.value = false
    }
  },
  { immediate: true },
)

function matchState(bytes: Uint8Array): boolean | null {
  return digestMatches(formatDigest(bytes, 'hex'), state.expected)
}
</script>

<template>
  <ToolLayout tool-id="hash" :share-url="shareUrl" :reset="reset">
    <div class="grid-2">
      <section class="stack">
        <label class="field">
          Text
          <textarea v-model="state.input" class="mono" rows="7" spellcheck="false" :disabled="!!file"></textarea>
        </label>
        <div class="field">
          <label for="hash-file">Or hash a file (read locally, never uploaded)</label>
          <div class="row">
            <input id="hash-file" type="file" @change="onFile" />
            <button v-if="file" type="button" class="btn small ghost" @click="clearFile">Use text instead</button>
          </div>
          <p v-if="file" class="muted">Hashing <strong>{{ file.name }}</strong> ({{ file.bytes.length.toLocaleString() }} bytes)</p>
          <p v-if="fileError" class="error" role="alert">{{ fileError }}</p>
        </div>
        <label class="toggle"><input v-model="state.useHmac" type="checkbox" /> HMAC with a secret key</label>
        <label v-if="state.useHmac" class="field">
          Key (UTF-8, never stored)
          <input v-model="state.key" type="password" autocomplete="off" spellcheck="false" />
        </label>
        <label class="field">
          Compare with an expected digest (hex)
          <input v-model="state.expected" class="mono" type="text" spellcheck="false" placeholder="paste a checksum to verify" />
        </label>
      </section>

      <section class="stack" aria-live="polite">
        <div class="row">
          <div class="segmented" role="group" aria-label="Output format">
            <button type="button" :aria-pressed="state.format === 'hex'" @click="state.format = 'hex'">hex</button>
            <button type="button" :aria-pressed="state.format === 'HEX'" @click="state.format = 'HEX'">HEX</button>
            <button type="button" :aria-pressed="state.format === 'base64'" @click="state.format = 'base64'">Base64</button>
          </div>
          <span v-if="busy" class="muted">Hashing...</span>
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div v-for="r in results" :key="r.alg" class="panel digest" :class="{ match: matchState(r.bytes) === true }">
          <h2 class="panel-title">
            <span>{{ state.useHmac ? 'HMAC-' : '' }}{{ r.alg }} <span class="muted bits">{{ r.bytes.length * 8 }} bits</span></span>
            <span class="row">
              <span v-if="matchState(r.bytes) === true" class="ok">Matches</span>
              <CopyButton :text="formatDigest(r.bytes, state.format)" />
            </span>
          </h2>
          <code class="value">{{ formatDigest(r.bytes, state.format) }}</code>
          <p class="muted note">{{ ALGORITHM_NOTES[r.alg] }}</p>
        </div>
        <p v-if="state.expected.trim() && results.length && !results.some((r) => matchState(r.bytes))" class="error">
          The expected digest does not match any algorithm.
        </p>
      </section>
    </div>
  </ToolLayout>
</template>

<style scoped>
.digest.match {
  border-color: var(--success);
}
.value {
  display: block;
  word-break: break-all;
  font-size: 0.9rem;
}
.bits {
  font-weight: 400;
  font-size: 0.82rem;
}
.note {
  font-size: 0.8rem;
  margin: 6px 0 0;
}
</style>
