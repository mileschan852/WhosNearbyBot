import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Keep asset URLs relative so the app also works from GitHub Pages subpaths.
// Let Vite/Rolldown choose safe chunk boundaries; manual vendor splitting
// caused an import interop error before React could mount.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // The 844.72 kB entry bundle compresses to about 249 kB. Keep this
    // threshold close to the measured output; manual vendor splitting caused
    // a startup/import interop failure in the Telegram app.
    chunkSizeWarningLimit: 860,
  },
})
