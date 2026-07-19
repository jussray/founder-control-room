// eslint.config.js — flat config (ESLint 9+)
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

const preservedNextPrototype = [
  'src/app/**',
  'src/components/**',
  'src/lib/contracts.ts',
  'src/lib/data.ts',
  'src/lib/db-types.ts',
  'src/lib/queries.ts',
  'src/lib/supabase.ts',
  'src/lib/types.ts',
  'src/worker/index.ts',
];

export default [
  {
    ignores: ['dist/**', 'node_modules/**', ...preservedNextPrototype],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Prevent unhandled promise rejections slipping through
      '@typescript-eslint/no-floating-promises': 'error',

      // Force explicit return types on public API functions
      '@typescript-eslint/explicit-module-boundary-types': 'warn',

      // Catch accidental any usage
      '@typescript-eslint/no-explicit-any': 'warn',

      // Unused vars should be errors, not warnings
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // No console.log in production code (use structured logging)
      // Set to warn so existing console.log / console.error calls don't block CI immediately
      'no-console': 'warn',
    },
  },
];
