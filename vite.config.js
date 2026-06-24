import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { makeBuildId, stampServiceWorker } from './scripts/sw-stamp.mjs'

// One id per build: stamped into sw.js (cache key + update trigger) AND shown in the
// UI (Preferences/Account) so web vs an installed PWA can be compared at a glance.
const BUILD_ID = makeBuildId()

// After the bundle is written, replace __SW_VERSION__ in the emitted dist/sw.js with
// BUILD_ID — so every deploy ships a byte-different service worker the browser detects.
function stampSwPlugin() {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    closeBundle() {
      const swPath = resolve('dist/sw.js')
      try {
        const src = readFileSync(swPath, 'utf8')
        writeFileSync(swPath, stampServiceWorker(src, BUILD_ID))
      } catch { /* no sw.js in output → nothing to stamp */ }
    },
  }
}

export default defineConfig({
  plugins: [react(), stampSwPlugin()],
  // Human-readable build stamp (UTC, minute precision) for the Preferences/Account
  // version line — lets you confirm an installed PWA picked up a deploy.
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
})
