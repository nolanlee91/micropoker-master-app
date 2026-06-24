import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Build date+time (UTC, minute precision) stamped into the bundle so the app can
  // show which version it's running (Preferences + Account). Comparing the value on
  // web vs an installed PWA tells you whether the PWA picked up the latest deploy.
  // Minute precision (not just date) so two deploys on the same day still differ.
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
})
