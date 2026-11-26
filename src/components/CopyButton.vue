<script setup lang="ts">
import { ref } from 'vue'
import { copyText } from '../lib/clipboard'

const props = withDefaults(defineProps<{ text: string; label?: string }>(), { label: 'Copy' })
const copied = ref<'idle' | 'ok' | 'fail'>('idle')
let timer: ReturnType<typeof setTimeout> | undefined

async function copy(): Promise<void> {
  copied.value = (await copyText(props.text)) ? 'ok' : 'fail'
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = 'idle'), 1500)
}
</script>

<template>
  <button type="button" class="btn small ghost" :disabled="text === ''" :aria-label="`${label} to clipboard`" @click="copy">
    {{ copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Blocked' : label }}
  </button>
</template>
