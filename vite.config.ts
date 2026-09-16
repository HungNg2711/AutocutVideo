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
  server: {
    watch: {
      // Large local test files dropped in public/ (e.g. a real video for manual testing)
      // can crash the whole dev server on Windows/OneDrive: the file is still syncing/
      // locked when Vite's watcher tries to register it, throwing an uncaught EBUSY that
      // kills the Node process outright rather than just failing to watch that one file.
      ignored: ['**/public/_test_*'],
    },
  },
})
