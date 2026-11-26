<script setup lang="ts">
import { toolsByCategory, tools } from '../tools/registry'

const groups = toolsByCategory()
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
</script>

<template>
  <section class="home">
    <h1>Developer tools that never leave your browser</h1>
    <p class="muted lead">
      {{ tools.length }} tools for everyday debugging and data wrangling. No accounts, no tracking, no network
      calls: your tokens, payloads and secrets stay on this device. Press
      <kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd> <kbd>K</kbd> to jump to any tool.
    </p>

    <div v-for="group in groups" :key="group.category" class="group">
      <h2>{{ group.category }}</h2>
      <ul class="cards">
        <li v-for="tool in group.tools" :key="tool.id">
          <RouterLink :to="`/${tool.id}`" class="card">
            <strong>{{ tool.name }}</strong>
            <span class="muted">{{ tool.description }}</span>
          </RouterLink>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.home h1 {
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  margin: 0 0 8px;
}
.lead {
  max-width: 62ch;
  margin: 0 0 28px;
}
.group h2 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 24px 0 10px;
}
.cards {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100%;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  transition: border-color 0.15s, transform 0.15s;
}
.card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}
.card span {
  font-size: 0.9rem;
}
</style>
