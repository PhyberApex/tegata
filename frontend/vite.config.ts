import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    vue(),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['json'],
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.d.ts', 'src/**/*.spec.ts'],
    },
    environment: 'happy-dom',
  },
})
