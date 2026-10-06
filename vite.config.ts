import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// I am forcing relative paths here so GitHub Pages can actually find your files.
export default defineConfig({
  plugins: [react()],
  base: './', 
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 20_000,
          maxSize: 400_000,
          groups: [
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              maxSize: 400_000,
              entriesAware: true,
            },
          ],
        },
      },
    },
  },
})
