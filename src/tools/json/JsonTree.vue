<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{ value: unknown; label?: string; depth?: number }>(), {
  label: '',
  depth: 0,
})

const PAGE = 200
const limit = ref(PAGE)

const isArray = computed(() => Array.isArray(props.value))
const isObject = computed(() => props.value !== null && typeof props.value === 'object')
const entries = computed<[string, unknown][]>(() =>
  isArray.value
    ? (props.value as unknown[]).map((v, i) => [String(i), v])
    : isObject.value
      ? Object.entries(props.value as Record<string, unknown>)
      : [],
)
const summary = computed(() =>
  isArray.value ? `Array(${entries.value.length})` : `{${entries.value.length} ${entries.value.length === 1 ? 'key' : 'keys'}}`,
)
const scalarClass = computed(() => (props.value === null ? 'null' : typeof props.value))
const scalarText = computed(() => (typeof props.value === 'string' ? JSON.stringify(props.value) : String(props.value)))
</script>

<template>
  <details v-if="isObject" class="node" :open="depth < 2">
    <summary>
      <span v-if="label !== ''" class="key">{{ label }}:</span>
      <span class="summary">{{ summary }}</span>
    </summary>
    <div class="children">
      <JsonTree v-for="[k, v] in entries.slice(0, limit)" :key="k" :value="v" :label="isArray ? `[${k}]` : k" :depth="depth + 1" />
      <button v-if="entries.length > limit" type="button" class="btn small ghost more" @click="limit += PAGE">
        Show {{ Math.min(PAGE, entries.length - limit) }} more of {{ entries.length - limit }}
      </button>
    </div>
  </details>
  <div v-else class="leaf">
    <span v-if="label !== ''" class="key">{{ label }}:</span>
    <span :class="['val', scalarClass]">{{ scalarText }}</span>
  </div>
</template>

<style scoped>
.node,
.leaf {
  font-family: var(--mono);
  font-size: 0.88rem;
  line-height: 1.6;
}
summary {
  cursor: pointer;
  list-style-position: outside;
  margin-left: 14px;
}
.children {
  margin-left: 18px;
  border-left: 1px dashed var(--border);
  padding-left: 10px;
}
.leaf {
  margin-left: 14px;
  word-break: break-word;
}
.key {
  color: var(--accent);
  margin-right: 6px;
}
.summary {
  color: var(--muted);
}
.val.string {
  color: #15803d;
}
.val.number {
  color: #b45309;
}
.val.boolean,
.val.null {
  color: #7c3aed;
}
:root[data-theme='dark'] .val.string {
  color: #86efac;
}
:root[data-theme='dark'] .val.number {
  color: #fcd34d;
}
:root[data-theme='dark'] .val.boolean,
:root[data-theme='dark'] .val.null {
  color: #c4b5fd;
}
.more {
  margin: 4px 0 4px 14px;
}
</style>
