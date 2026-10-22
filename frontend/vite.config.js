import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the API is `wrangler dev` on :8787; in production one Worker serves both.
// The proxy tells the worker which device the request really came from (the worker otherwise
// sees every proxied request as localhost), so dev sign-in can refuse other devices on the
// network unless DEV_LOGIN_LAN=on (npm run dev:lan).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        configure: (proxy) => proxy.on('proxyReq', (proxyReq, req) => proxyReq.setHeader('X-Dev-Client-Address', req.socket.remoteAddress || 'unknown')),
      },
    },
  },
})
