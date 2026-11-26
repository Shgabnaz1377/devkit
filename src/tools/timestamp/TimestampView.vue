<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import CopyButton from '../../components/CopyButton.vue'
import { useToolState } from '../../composables/useToolState'
import { describeRelative } from '../../lib/relative'
import {
  UNIT_LABELS,
  formatInZone,
  formatOffset,
  isValidZone,
  parseInstant,
  parseWallClock,
  zoneOffsetMinutes,
  zonedToInstant,
  type TimeUnit,
} from './timestamp'

const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const allZones: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

const { state, shareUrl, reset } = useToolState('timestamp', {
  input: String(Math.floor(Date.now() / 1000)),
  unit: 'auto' as TimeUnit | 'auto',
  zones: ['UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo'],
  wall: '2026-03-29T02:30',
  wallZone: localZone,
})

const nowMs = ref(Date.now())
const tick = setInterval(() => (nowMs.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(tick))

const parsed = computed(() => {
  try {
    return { ok: true as const, value: parseInstant(state.input, state.unit) }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const rows = computed(() => {
  if (!parsed.value.ok) return []
  const ms = parsed.value.value.ms
  const whole = Math.floor(ms)
  return [
    { label: 'Unix seconds', value: String(Math.floor(whole / 1000)) },
    { label: 'Unix milliseconds', value: String(whole) },
    { label: 'ISO 8601 (UTC)', value: new Date(whole).toISOString() },
    { label: `Local (${localZone})`, value: formatInZone(whole, localZone) },
    { label: 'Relative', value: describeRelative((whole - nowMs.value) / 1000) },
    { label: 'RFC 7231 (HTTP date)', value: new Date(whole).toUTCString() },
  ]
})

const zoneRows = computed(() => {
  if (!parsed.value.ok) return []
  const ms = Math.floor(parsed.value.value.ms)
  return state.zones.filter(isValidZone).map((z) => ({ zone: z, iso: formatInZone(ms, z), offset: formatOffset(zoneOffsetMinutes(ms, z)) }))
})

const newZone = ref('')
const zoneError = ref('')
function addZone(): void {
  const z = newZone.value.trim()
  zoneError.value = ''
  if (!z) return
  if (!isValidZone(z)) {
    zoneError.value = `"${z}" is not a time zone this browser knows. Use an IANA name like Europe/Paris.`
    return
  }
  if (!state.zones.includes(z)) state.zones.push(z)
  newZone.value = ''
}
function removeZone(z: string): void {
  state.zones = state.zones.filter((x) => x !== z)
}

const wallResult = computed(() => {
  if (!isValidZone(state.wallZone)) return { ok: false as const, error: `Unknown time zone "${state.wallZone}".` }
  try {
    return { ok: true as const, value: zonedToInstant(parseWallClock(state.wall), state.wallZone) }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

function useNow(): void {
  state.input = String(Math.floor(Date.now() / 1000))
}
const units: { id: TimeUnit | 'auto'; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  ...(Object.keys(UNIT_LABELS) as TimeUnit[]).map((u) => ({ id: u, label: u })),
]
</script>

<template>
  <ToolLayout tool-id="timestamp" :share-url="shareUrl" :reset="reset">
    <div class="stack">
      <div class="row">
        <label class="field grow">
          Unix timestamp or ISO 8601 date
          <input v-model="state.input" class="mono big" type="text" spellcheck="false" autocomplete="off" :aria-invalid="!parsed.ok" />
        </label>
        <div class="segmented" role="group" aria-label="Unit">
          <button v-for="u in units" :key="u.id" type="button" :aria-pressed="state.unit === u.id" @click="state.unit = u.id">{{ u.label }}</button>
        </div>
        <button type="button" class="btn ghost" @click="useNow">Now</button>
      </div>
      <p v-if="!parsed.ok" class="error" role="alert">{{ parsed.error }}</p>
      <p v-else-if="parsed.value.note" class="muted">{{ parsed.value.note }}</p>

      <div v-if="parsed.ok" class="grid-2">
        <section class="panel">
          <h2 class="panel-title">Formats</h2>
          <table class="kv">
            <tbody>
              <tr v-for="r in rows" :key="r.label">
                <th scope="row">{{ r.label }}</th>
                <td class="with-copy">{{ r.value }} <CopyButton :text="r.value" /></td>
              </tr>
            </tbody>
          </table>
        </section>
        <section class="panel">
          <h2 class="panel-title">Time zones</h2>
          <table class="kv">
            <tbody>
              <tr v-for="z in zoneRows" :key="z.zone">
                <th scope="row">{{ z.zone }}<br /><span class="muted">UTC{{ z.offset }}</span></th>
                <td class="with-copy">
                  {{ z.iso }}
                  <button type="button" class="btn small ghost" :aria-label="`Remove ${z.zone}`" @click="removeZone(z.zone)">Remove</button>
                </td>
              </tr>
            </tbody>
          </table>
          <form class="row add-zone" @submit.prevent="addZone">
            <input v-model="newZone" list="tz-list" type="text" placeholder="Add a zone, e.g. Europe/Paris" aria-label="Time zone to add" />
            <datalist id="tz-list">
              <option v-for="z in allZones" :key="z" :value="z" />
            </datalist>
            <button type="submit" class="btn ghost">Add</button>
          </form>
          <p v-if="zoneError" class="error" role="alert">{{ zoneError }}</p>
        </section>
      </div>

      <section class="panel stack">
        <h2 class="panel-title">Date and time in a zone to timestamp</h2>
        <div class="row">
          <label class="field">
            Wall-clock time
            <input v-model="state.wall" type="datetime-local" step="1" />
          </label>
          <label class="field">
            Time zone
            <input v-model="state.wallZone" list="tz-list" type="text" spellcheck="false" />
          </label>
        </div>
        <p v-if="!wallResult.ok" class="error" role="alert">{{ wallResult.error }}</p>
        <template v-else>
          <p v-if="wallResult.value.kind === 'exact'" class="mono result">
            {{ Math.floor(wallResult.value.ms / 1000) }} <span class="muted">({{ new Date(wallResult.value.ms).toISOString() }})</span>
          </p>
          <div v-else-if="wallResult.value.kind === 'ambiguous'" class="warn">
            This time happens twice (clocks go back). Earlier:
            <code>{{ Math.floor(wallResult.value.earlier / 1000) }}</code> ({{ formatInZone(wallResult.value.earlier, state.wallZone) }}), later:
            <code>{{ Math.floor(wallResult.value.later / 1000) }}</code> ({{ formatInZone(wallResult.value.later, state.wallZone) }}).
          </div>
          <p v-else class="warn">
            This time does not exist in {{ state.wallZone }} (clocks jump forward). Nearest valid instants:
            <code>{{ formatInZone(wallResult.value.after, state.wallZone) }}</code> and
            <code>{{ formatInZone(wallResult.value.before, state.wallZone) }}</code>.
          </p>
        </template>
      </section>
    </div>
  </ToolLayout>
</template>

<style scoped>
.grow {
  flex: 1;
  min-width: 240px;
}
.big {
  font-size: 1.15rem;
}
.with-copy {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.add-zone {
  margin-top: 10px;
  flex-wrap: nowrap;
}
.result {
  font-size: 1.1rem;
  margin: 0;
}
.field {
  min-width: 200px;
}
</style>
