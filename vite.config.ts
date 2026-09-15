import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ffmpeg.wasm (single-threaded core) needs no special cross-origin headers,
// so the dev server can stay with Vite's defaults.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@huggingface/transformers'],
  },
  worker: {
    format: 'es',
  },
})
