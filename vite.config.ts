import { defineConfig } from 'vitest/config'
import { loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const REQUIRED_FIREBASE_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

/** Fail production builds when Firebase env is missing (empty keys ship as broken sign-in). */
function requireFirebaseEnv(): Plugin {
  return {
    name: 'require-firebase-env',
    configResolved(config) {
      if (config.command !== 'build' || config.mode === 'test') return
      const env = loadEnv(config.mode, config.envDir, 'VITE_')
      const missing = REQUIRED_FIREBASE_ENV.filter((key) => {
        const value = env[key]?.trim() ?? ''
        return !value || value.startsWith('YOUR_')
      })
      if (missing.length > 0) {
        throw new Error(
          `Production build blocked: missing Firebase env (${missing.join(', ')}).\n` +
            `Copy .env.example to .env.local and fill in credentials before building.`,
        )
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), requireFirebaseEnv()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('firebase')) return 'firebase'
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) {
            return 'react'
          }
          if (id.includes('qrcode.react')) return 'qrcode'
          if (id.includes('lucide-react')) return 'icons'
          return 'vendor'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
})
