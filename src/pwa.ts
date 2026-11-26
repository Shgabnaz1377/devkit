import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

/** True once the service worker has precached the app and it can run offline. */
export const offlineReady = ref(false)

export function setupServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  registerSW({
    immediate: true,
    onOfflineReady() {
      offlineReady.value = true
    },
    onRegisteredSW(_url, registration) {
      // A page loaded while a worker already controls it is offline-capable too.
      if (registration?.active && navigator.serviceWorker.controller) offlineReady.value = true
    },
  })
}
