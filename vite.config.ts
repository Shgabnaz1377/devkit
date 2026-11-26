import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Relative base + hash routing lets the build run from any static host or sub-path.
  base: './',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered from src/pwa.ts so the UI can report offline readiness
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'devkit: local developer tools',
        short_name: 'devkit',
        description: 'A fast, privacy-first toolbox for developers. Everything runs locally in your browser.',
        theme_color: '#4f46e5',
        background_color: '#0f1117',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole app (including lazily loaded tool chunks and the regex worker)
        // so every tool works offline after the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
