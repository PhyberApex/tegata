// https://github.com/antfu/eslint-config
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
    typescript: true,
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
    ],
  },
  // Backend: Nest-injected classes stay value imports — DI needs the class
  // reference at runtime, which a type-only import erases.
  {
    files: ['backend/**/*.ts'],
    rules: {
      'ts/consistent-type-imports': 'off',
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      'ts/no-require-imports': 'off',
      'style/max-statements-per-line': 'off',
    },
  },
)
