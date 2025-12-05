import { tanstackConfig } from '@tanstack/eslint-config'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: [
      '**/node_modules/**',
      'dist/**',
      '.wrangler/**',
      'src/race/worker/.wrangler/**',
      'eslint.config.js',
      'prettier.config.js',
    ],
  },
  ...tanstackConfig,
  {
    ...reactPlugin.configs.flat.recommended,
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  reactPlugin.configs.flat['jsx-runtime'],
  reactHooksPlugin.configs.flat.recommended,
  eslintPluginPrettierRecommended,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
]
