import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the API is `wrangler dev` on :8787; in production one Worker serves both.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
})
