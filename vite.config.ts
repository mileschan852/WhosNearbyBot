import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// I am forcing relative paths here so GitHub Pages can actually find your files.
export default defineConfig({
  plugins: [react()],
  base: './', 
})
