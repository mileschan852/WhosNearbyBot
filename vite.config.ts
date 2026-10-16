import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Keep asset URLs relative so the app also works from GitHub Pages subpaths.
// Let Vite/Rolldown choose safe chunk boundaries; manual vendor splitting
// caused an import interop error before React could mount.
export default defineConfig({
  plugins: [react()],
  base: './',
})
