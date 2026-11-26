<script setup lang="ts">
import { computed, ref } from 'vue'
import { findTool } from '../tools/registry'
import { copyText } from '../lib/clipboard'

const props = defineProps<{
  toolId: string
  shareUrl?: () => string
  reset?: () => void
}>()

const tool = computed(() => findTool(props.toolId))
const status = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

function flash(message: string): void {
  status.value = message
  clearTimeout(timer)
  timer = setTimeout(() => (status.value = ''), 2500)
}

async function share(): Promise<void> {
  if (!props.shareUrl) return
  const ok = await copyText(props.shareUrl())
  flash(ok ? 'Share link copied to clipboard' : 'Could not access the clipboard')
}

function doReset(): void {
  props.reset?.()
  flash('Input reset')
}
</script>

<template>
  <article class="tool">
    <header class="tool-header">
      <div>
        <h1>{{ tool?.name }}</h1>
        <p class="muted">{{ tool?.description }}</p>
      </div>
      <div class="tool-actions">
        <button v-if="reset" type="button" class="btn ghost" @click="doReset">Reset</button>
        <button v-if="shareUrl" type="button" class="btn" @click="share">Copy share link</button>
      </div>
    </header>
    <p class="sr-status" role="status" aria-live="polite">{{ status }}</p>
    <slot />
  </article>
</template>

<style scoped>
.tool-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px 24px;
  margin-bottom: 8px;
}
.tool-header h1 {
  margin: 0 0 4px;
  font-size: 1.6rem;
}
.tool-header p {
  margin: 0;
}
.tool-actions {
  display: flex;
  gap: 8px;
}
.sr-status {
  min-height: 1.4em;
  margin: 0 0 8px;
  font-size: 0.9rem;
  color: var(--success);
}
</style>
