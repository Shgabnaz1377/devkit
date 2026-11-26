<script setup lang="ts">
import { computed } from 'vue'
import ToolLayout from '../../components/ToolLayout.vue'
import CopyButton from '../../components/CopyButton.vue'
import { useToolState } from '../../composables/useToolState'
import {
  parseColor,
  parseColorInfo,
  suggestForeground,
  toHex,
  toHslString,
  toOklchString,
  toRgbString,
  wcag,
  type Rgba,
} from './color'

const { state, shareUrl, reset } = useToolState('color', {
  color: '#4f46e5',
  fg: '#6b7280',
  bg: '#ffffff',
})

function tryParse(s: string): { ok: true; c: Rgba } | { ok: false; error: string } {
  try {
    return { ok: true, c: parseColor(s) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

const main = computed(() => tryParse(state.color))
const formats = computed(() => {
  if (!main.value.ok) return []
  const c = main.value.c
  return [
    { label: 'HEX', value: toHex(c) },
    { label: 'RGB', value: toRgbString(c) },
    { label: 'HSL', value: toHslString(c) },
    { label: 'OKLCH', value: toOklchString(c) },
  ]
})
const gamutNote = computed(() => {
  if (!main.value.ok) return ''
  return parseColorInfo(state.color).inGamut ? '' : 'Outside the sRGB gamut: clipped to the nearest displayable colour.'
})

const pickerValue = computed({
  get: () => (main.value.ok ? toHex({ ...main.value.c, a: 1 }) : '#000000'),
  set: (v: string) => {
    state.color = v
  },
})

const fg = computed(() => tryParse(state.fg))
const bg = computed(() => tryParse(state.bg))
const result = computed(() => (fg.value.ok && bg.value.ok ? wcag(fg.value.c, bg.value.c) : null))
const suggestion = computed(() => {
  if (!fg.value.ok || !bg.value.ok || !result.value || result.value.aaNormal) return null
  const s = suggestForeground(fg.value.c, bg.value.c, 4.5)
  return s ? toHex(s) : null
})
const checks = computed(() =>
  result.value
    ? [
        { label: 'AA normal text', need: '4.5:1', ok: result.value.aaNormal },
        { label: 'AA large text', need: '3:1', ok: result.value.aaLarge },
        { label: 'AAA normal text', need: '7:1', ok: result.value.aaaNormal },
        { label: 'AAA large text', need: '4.5:1', ok: result.value.aaaLarge },
        { label: 'UI components', need: '3:1', ok: result.value.uiComponents },
      ]
    : [],
)
const swatch = (c: { ok: boolean; c?: Rgba }) => (c.ok && c.c ? toRgbString(c.c) : 'transparent')

function swap(): void {
  ;[state.fg, state.bg] = [state.bg, state.fg]
}
</script>

<template>
  <ToolLayout tool-id="color" :share-url="shareUrl" :reset="reset">
    <div class="grid-2">
      <section class="stack">
        <h2 class="section-title">Convert</h2>
        <div class="row nowrap">
          <input v-model="pickerValue" type="color" class="picker" aria-label="Pick a colour" />
          <label class="field grow">
            Colour (hex, rgb(), hsl(), oklch() or name)
            <input v-model="state.color" class="mono" type="text" spellcheck="false" :aria-invalid="!main.ok" />
          </label>
        </div>
        <p v-if="!main.ok" class="error" role="alert">{{ main.error }}</p>
        <template v-else>
          <div class="swatch checker" aria-hidden="true"><div :style="{ background: toRgbString(main.c) }"></div></div>
          <p v-if="gamutNote" class="warn">{{ gamutNote }}</p>
          <table class="kv">
            <tbody>
              <tr v-for="f in formats" :key="f.label">
                <th scope="row">{{ f.label }}</th>
                <td class="with-copy">{{ f.value }} <CopyButton :text="f.value" /></td>
              </tr>
            </tbody>
          </table>
        </template>
      </section>

      <section class="stack">
        <h2 class="section-title">WCAG contrast</h2>
        <div class="row nowrap">
          <label class="field grow">
            Text colour
            <input v-model="state.fg" class="mono" type="text" spellcheck="false" :aria-invalid="!fg.ok" />
          </label>
          <button type="button" class="btn ghost swap" aria-label="Swap text and background colours" @click="swap">Swap</button>
          <label class="field grow">
            Background
            <input v-model="state.bg" class="mono" type="text" spellcheck="false" :aria-invalid="!bg.ok" />
          </label>
        </div>
        <p v-if="!fg.ok" class="error" role="alert">Text colour: {{ fg.error }}</p>
        <p v-if="!bg.ok" class="error" role="alert">Background: {{ bg.error }}</p>
        <template v-if="result">
          <div class="preview" :style="{ color: swatch(fg), background: swatch(bg) }">
            <p class="large">Large text sample (24px)</p>
            <p>Normal body text sample at 16px. The quick brown fox jumps over the lazy dog.</p>
          </div>
          <p class="ratio" aria-live="polite">
            <strong>{{ (Math.floor(result.ratio * 100) / 100).toFixed(2) }}:1</strong>
            <span class="muted"> contrast ratio</span>
          </p>
          <ul class="checks">
            <li v-for="c in checks" :key="c.label" :class="c.ok ? 'pass' : 'fail'">
              <span class="badge">{{ c.ok ? 'Pass' : 'Fail' }}</span> {{ c.label }} <span class="muted">(needs {{ c.need }})</span>
            </li>
          </ul>
          <p v-if="suggestion" class="suggest">
            Closest text colour that passes AA:
            <button type="button" class="btn small ghost" @click="state.fg = suggestion"><span class="chip" :style="{ background: suggestion }"></span>{{ suggestion }}</button>
          </p>
          <p v-else-if="!result.aaNormal" class="muted">No lightness of this hue reaches 4.5:1 on this background.</p>
        </template>
      </section>
    </div>
  </ToolLayout>
</template>

<style scoped>
.section-title {
  font-size: 1.1rem;
  margin: 0;
}
.nowrap {
  flex-wrap: nowrap;
  align-items: flex-end;
}
.grow {
  flex: 1;
  min-width: 0;
}
.picker {
  width: 52px;
  height: 42px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
}
.swatch {
  height: 96px;
  border-radius: 10px;
  border: 1px solid var(--border);
  overflow: hidden;
}
.swatch > div {
  height: 100%;
}
.checker {
  background-image: conic-gradient(#ccc 25%, #fff 0 50%, #ccc 0 75%, #fff 0);
  background-size: 16px 16px;
}
.with-copy {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.swap {
  margin-bottom: 1px;
}
.preview {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 18px;
}
.preview p {
  margin: 0 0 6px;
}
.preview .large {
  font-size: 24px;
  font-weight: 400;
}
.ratio {
  font-size: 1.6rem;
  margin: 0;
}
.checks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.badge {
  display: inline-block;
  min-width: 44px;
  text-align: center;
  font-size: 0.78rem;
  font-weight: 700;
  border-radius: 999px;
  padding: 1px 8px;
  margin-right: 6px;
}
.pass .badge {
  background: var(--add-bg);
  color: var(--success);
}
.fail .badge {
  background: var(--del-bg);
  color: var(--danger);
}
.chip {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid var(--border);
}
.suggest {
  margin: 0;
}
@media (max-width: 480px) {
  .nowrap {
    flex-wrap: wrap;
  }
}
</style>
