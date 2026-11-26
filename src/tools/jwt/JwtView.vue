<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import CopyButton from '../../components/CopyButton.vue'
import { useToolState } from '../../composables/useToolState'
import { decodeJwt, summarizeClaims, verifyHmac, type SecretEncoding, type VerifyResult } from './jwt'

const EXAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

// The secret is deliberately excluded from localStorage and share links.
const { state, shareUrl, reset } = useToolState(
  'jwt',
  { token: EXAMPLE, secret: '', encoding: 'utf8' as SecretEncoding, leeway: 0 },
  { privateKeys: ['secret'] },
)
const showSecret = ref(false)

const decoded = computed(() => {
  try {
    return { ok: true as const, value: decodeJwt(state.token) }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const now = ref(Math.floor(Date.now() / 1000))
const clock = setInterval(() => (now.value = Math.floor(Date.now() / 1000)), 1000)
onBeforeUnmount(() => clearInterval(clock))

const claims = computed(() =>
  decoded.value.ok ? summarizeClaims(decoded.value.value.payload, now.value, state.leeway) : null,
)

const statusText = {
  valid: 'Within its validity window',
  expired: 'Expired',
  'not-yet-valid': 'Not valid yet (nbf is in the future)',
  'no-expiry': 'No expiry (exp) claim',
} as const

const verification = ref<VerifyResult | null>(null)
let seq = 0
watch(
  () => [state.token, state.secret, state.encoding] as const,
  async ([token, secret, encoding]) => {
    const mine = ++seq
    if (!secret) {
      verification.value = null
      return
    }
    const result = await verifyHmac(token, secret, encoding)
    if (mine === seq) verification.value = result
  },
  { immediate: true },
)

const pretty = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2))
</script>

<template>
  <ToolLayout tool-id="jwt" :share-url="shareUrl" :reset="reset">
    <div class="grid-2">
      <section class="stack">
        <label class="field">
          Encoded token
          <textarea
            v-model="state.token"
            class="mono token"
            rows="8"
            spellcheck="false"
            :aria-invalid="!decoded.ok"
            aria-describedby="jwt-error"
          ></textarea>
        </label>
        <p v-if="!decoded.ok" id="jwt-error" class="error" role="alert">{{ decoded.error }}</p>
        <div v-else class="output colored" aria-label="Token segments">
          <span class="seg-h">{{ decoded.value.parts[0] }}</span>.<span class="seg-p">{{ decoded.value.parts[1] }}</span>.<span class="seg-s">{{ decoded.value.parts[2] }}</span>
        </div>

        <fieldset class="panel stack">
          <legend>Verify HMAC signature</legend>
          <div class="field">
            <label for="jwt-secret">Shared secret</label>
            <span id="jwt-secret-hint" class="hint">Never stored or put in share links.</span>
            <div class="row nowrap">
              <input
                id="jwt-secret"
                v-model="state.secret"
                :type="showSecret ? 'text' : 'password'"
                autocomplete="off"
                spellcheck="false"
                aria-describedby="jwt-secret-hint"
              />
              <button type="button" class="btn ghost small" :aria-pressed="showSecret" @click="showSecret = !showSecret">
                {{ showSecret ? 'Hide' : 'Show' }}
              </button>
            </div>
          </div>
          <div class="row">
            <label class="field inline">
              Secret encoding
              <select v-model="state.encoding">
                <option value="utf8">UTF-8 text</option>
                <option value="base64">Base64</option>
                <option value="base64url">Base64url</option>
                <option value="hex">Hex</option>
              </select>
            </label>
          </div>
          <p v-if="verification?.ok" class="ok" role="status">Signature verified ({{ verification.alg }}).</p>
          <p v-else-if="verification" class="error" role="status">{{ verification.reason }}</p>
          <p v-else class="muted">Enter the secret to check the signature with Web Crypto.</p>
        </fieldset>
      </section>

      <section v-if="decoded.ok" class="stack">
        <div class="panel">
          <h2 class="panel-title">Header <CopyButton :text="pretty(decoded.value.header)" /></h2>
          <pre class="output seg-h-text">{{ pretty(decoded.value.header) }}</pre>
        </div>
        <div class="panel">
          <h2 class="panel-title">Payload <CopyButton :text="pretty(decoded.value.payload)" /></h2>
          <pre class="output seg-p-text">{{ pretty(decoded.value.payload) }}</pre>
        </div>
        <div v-if="claims" class="panel">
          <h2 class="panel-title">
            Validity
            <span :class="claims.status === 'expired' || claims.status === 'not-yet-valid' ? 'error-inline' : 'ok'">
              {{ statusText[claims.status] }}
            </span>
          </h2>
          <table v-if="claims.timeClaims.length" class="kv">
            <tbody>
              <tr v-for="c in claims.timeClaims" :key="c.name">
                <th scope="row">{{ c.label }} ({{ c.name }})</th>
                <td>{{ c.iso }}<br /><span class="muted">{{ c.relative }}</span></td>
              </tr>
            </tbody>
          </table>
          <label class="field inline leeway">
            Clock-skew leeway (seconds)
            <input v-model.number="state.leeway" type="number" min="0" step="1" />
          </label>
          <ul v-if="claims.warnings.length" class="warn">
            <li v-for="w in claims.warnings" :key="w">{{ w }}</li>
          </ul>
        </div>
      </section>
    </div>
  </ToolLayout>
</template>

<style scoped>
.token {
  min-height: 180px;
  word-break: break-all;
}
.colored {
  word-break: break-all;
}
.seg-h,
.seg-h-text {
  color: #c2410c;
}
.seg-p,
.seg-p-text {
  color: #7c3aed;
}
.seg-s {
  color: #0369a1;
}
:root[data-theme='dark'] .seg-h,
:root[data-theme='dark'] .seg-h-text {
  color: #fdba74;
}
:root[data-theme='dark'] .seg-p,
:root[data-theme='dark'] .seg-p-text {
  color: #c4b5fd;
}
:root[data-theme='dark'] .seg-s {
  color: #7dd3fc;
}
fieldset {
  margin: 0;
}
legend {
  font-weight: 700;
  padding: 0 4px;
}
.nowrap {
  flex-wrap: nowrap;
}
.field.inline {
  max-width: 260px;
}
.leeway {
  margin-top: 10px;
}
.error-inline {
  color: var(--danger);
  font-weight: 600;
}
</style>
