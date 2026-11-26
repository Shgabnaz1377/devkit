<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import CommandPalette from './components/CommandPalette.vue'
import { cycleTheme, settings } from './composables/useSettings'
import { toolsByCategory } from './tools/registry'

const paletteOpen = ref(false)
const navOpen = ref(false)
const route = useRoute()
const groups = toolsByCategory()
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

watch(
  () => route.fullPath,
  () => {
    navOpen.value = false
  },
)

function onGlobalKeydown(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    paletteOpen.value = !paletteOpen.value
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))

function focusMain(): void {
  // Hash routing owns the URL fragment, so move focus manually instead of using #main.
  document.getElementById('main')?.focus()
}

const logoUrl = `${import.meta.env.BASE_URL}favicon.svg`
const themeLabel = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' } as const
</script>

<template>
  <a class="skip-link" href="#main" @click.prevent="focusMain">Skip to content</a>
  <header class="topbar">
    <button
      type="button"
      class="btn ghost nav-toggle"
      :aria-expanded="navOpen"
      aria-controls="sidebar"
      @click="navOpen = !navOpen"
    >
      Menu
    </button>
    <RouterLink to="/" class="brand" aria-label="devkit home">
      <img :src="logoUrl" alt="" width="26" height="26" />
      <span>devkit</span>
    </RouterLink>
    <button type="button" class="search-trigger" data-testid="open-palette" @click="paletteOpen = true">
      <span>Search tools...</span>
      <span class="keys" aria-hidden="true"><kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd><kbd>K</kbd></span>
    </button>
    <div class="topbar-actions">
      <label class="toggle" title="Save each tool's last input in this browser">
        <input v-model="settings.remember" type="checkbox" data-testid="remember-toggle" />
        <span>Remember input</span>
      </label>
      <button type="button" class="btn ghost" :aria-label="`${themeLabel[settings.theme]}. Click to change.`" @click="cycleTheme">
        {{ themeLabel[settings.theme] }}
      </button>
    </div>
  </header>

  <div class="layout">
    <nav id="sidebar" class="sidebar" :class="{ open: navOpen }" aria-label="Tools">
      <RouterLink to="/" class="side-link">All tools</RouterLink>
      <div v-for="group in groups" :key="group.category">
        <h2 class="side-heading">{{ group.category }}</h2>
        <RouterLink v-for="tool in group.tools" :key="tool.id" :to="`/${tool.id}`" class="side-link">
          {{ tool.name }}
        </RouterLink>
      </div>
    </nav>
    <main id="main" tabindex="-1">
      <RouterView />
    </main>
  </div>

  <footer class="footer muted">
    Runs entirely in your browser. Nothing you type is sent anywhere.
  </footer>

  <CommandPalette v-model:open="paletteOpen" />
</template>
