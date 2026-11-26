<script setup lang="ts">
import { computed } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import { useToolState } from '../../composables/useToolState'
import { CRON_EXAMPLES, describeCron, nextRuns, parseCron, type CronSchedule, type CronZone } from './cron'

const { state, shareUrl, reset } = useToolState('cron', { expr: '0 9 * * MON-FRI', zone: 'local' as CronZone })

const result = computed<{ ok: true; schedule: CronSchedule } | { ok: false; error: string }>(() => {
  try {
    return { ok: true, schedule: parseCron(state.expr) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})

const runs = computed(() => (result.value.ok ? nextRuns(result.value.schedule, new Date(), 10, state.zone) : []))
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone

function format(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: state.zone === 'UTC' ? 'UTC' : undefined,
    timeZoneName: 'short',
  }).format(d)
}

const fieldRows = computed(() => {
  if (!result.value.ok) return []
  const s = result.value.schedule
  const tokens = s.expression.split(' ')
  return [
    { name: 'Minute', raw: tokens[0], values: s.minute.values },
    { name: 'Hour', raw: tokens[1], values: s.hour.values },
    { name: 'Day of month', raw: tokens[2], values: s.dayOfMonth.values },
    { name: 'Month', raw: tokens[3], values: s.month.values },
    { name: 'Day of week', raw: tokens[4], values: s.dayOfWeek.values },
  ].map((r) => ({ ...r, list: [...r.values].sort((a, b) => a - b).join(', ') }))
})
</script>

<template>
  <ToolLayout tool-id="cron" :share-url="shareUrl" :reset="reset">
    <div class="stack">
      <label class="field">
        Cron expression
        <input
          v-model="state.expr"
          class="mono expr"
          type="text"
          spellcheck="false"
          autocomplete="off"
          :aria-invalid="!result.ok"
          aria-describedby="cron-result"
        />
      </label>
      <div class="row examples" aria-label="Examples">
        <span class="muted">Examples:</span>
        <button v-for="ex in CRON_EXAMPLES" :key="ex.expr" type="button" class="btn small ghost" :title="ex.label" @click="state.expr = ex.expr">
          <code>{{ ex.expr }}</code>
        </button>
      </div>

      <div id="cron-result" aria-live="polite">
        <p v-if="!result.ok" class="error" role="alert">{{ result.error }}</p>
        <p v-else class="sentence">{{ describeCron(result.schedule) }}</p>
      </div>

      <div v-if="result.ok" class="grid-2">
        <section class="panel">
          <h2 class="panel-title">
            Next 10 runs
            <span class="segmented" role="group" aria-label="Time zone">
              <button type="button" :aria-pressed="state.zone === 'local'" @click="state.zone = 'local'">Local ({{ localZone }})</button>
              <button type="button" :aria-pressed="state.zone === 'UTC'" @click="state.zone = 'UTC'">UTC</button>
            </span>
          </h2>
          <ol v-if="runs.length" class="runs mono">
            <li v-for="r in runs" :key="r.getTime()">{{ format(r) }}</li>
          </ol>
          <p v-else class="muted">No runs in the next 28 years.</p>
        </section>
        <section class="panel">
          <h2 class="panel-title">Fields</h2>
          <table class="kv">
            <tbody>
              <tr v-for="f in fieldRows" :key="f.name">
                <th scope="row">{{ f.name }}</th>
                <td><strong>{{ f.raw }}</strong><br /><span class="muted">{{ f.list }}</span></td>
              </tr>
            </tbody>
          </table>
          <p class="muted note">
            Standard 5-field cron. When both day fields are restricted, a day matches if either one does.
          </p>
        </section>
      </div>
    </div>
  </ToolLayout>
</template>

<style scoped>
.expr {
  font-size: 1.3rem;
  padding: 10px 14px;
}
.sentence {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0;
}
.runs {
  margin: 0;
  padding-left: 28px;
  line-height: 1.9;
}
.note {
  font-size: 0.85rem;
  margin: 10px 0 0;
}
.panel-title {
  flex-wrap: wrap;
}
</style>
