import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Build date stamped into the bundle so the app can show which version it's
  // running (Account page) — lets you verify an installed PWA picked up a deploy.
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
})
