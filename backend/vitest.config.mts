import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2023',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    testTimeout: 10000,
    maxWorkers: 8,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.spec.ts',
        'src/**/mock-*.ts',
        'src/**/*.dto.ts',
      ],
    },
  },
})
