import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { farmAiPlugin } from '../local-tools/farm-ai.mjs'

// https://vite.dev/config/
export default defineConfig({
  base: '/admin/',
  plugins: [react(), farmAiPlugin({ envFile: path.resolve(process.cwd(), '../.env.local'), frontendEnvFile: path.resolve(process.cwd(), '.env.local') })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 3000,
    fs: {
      allow: [
        path.resolve(__dirname, '../shared'),
        path.resolve(__dirname, '..'),
      ],
    },
  },
})
