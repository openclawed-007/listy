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
        // Long-lived vendor chunks cache across deploys. Firestore (and the
        // re2js engine only it uses) gets its own chunk so pages that never
        // touch the database — landing, sign-in, guest list — skip ~600 kB.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined
          if (/@?firebase[\\/](firestore|webchannel-wrapper)|[\\/]re2js[\\/]/.test(id)) {
            return 'firestore'
          }
          if (/[\\/](@?firebase|idb)[\\/]/.test(id)) return 'firebase'
          if (/[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react'
          return undefined
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Rules tests need the Firestore emulator (`npm run test:rules` sets this host).
    exclude: process.env.FIRESTORE_EMULATOR_HOST ? [] : ['src/firestore.rules.test.ts'],
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
})
