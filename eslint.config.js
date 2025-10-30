import { tanstackConfig } from '@tanstack/eslint-config'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'

export default [
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
]
