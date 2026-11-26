import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Relative base + hash routing lets the build run from any static host or sub-path.
  base: './',
  plugins: [vue()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
