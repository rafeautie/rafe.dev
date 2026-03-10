import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import path from 'node:path';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default tseslint.config(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		settings: { react: { version: 'detect' } },
		plugins: {
			react,
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh
		},
		rules: {
			// React
			...reactHooks.configs.recommended.rules,
			'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

			// TypeScript
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ prefer: 'type-imports', fixStyle: 'inline-type-imports' }
			],
			'@typescript-eslint/no-explicit-any': 'warn',

			// Code quality
			'prefer-const': 'error',
			'no-var': 'error',
			eqeqeq: ['error', 'always'],
			'no-console': ['warn', { allow: ['warn', 'error'] }],
			'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0, maxBOF: 0 }],
			'no-undef': 'off'
		}
	}
);
