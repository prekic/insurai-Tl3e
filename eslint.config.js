import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  // Ignore patterns
  {
    ignores: ['dist/**', 'dist-server/**', 'node_modules/**', '*.config.js', '*.config.ts', 'supabase/functions/**'],
  },

  // Base JavaScript recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // React and React Hooks configuration
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // React rules
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+
      'react/prop-types': 'off', // Using TypeScript for prop validation
      'react/jsx-uses-react': 'off',
      'react/jsx-uses-vars': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/jsx-key': 'error',
      'react/no-unescaped-entities': 'warn',

      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // TypeScript rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Flag `as unknown as X` double-casts. They bypass TypeScript's structural
      // checks and have hidden contract bugs (see CLAUDE.md gotchas #48, #84).
      // Set to 'warn' because the codebase has pre-existing occurrences in
      // ~17 production files; new code should avoid the pattern, existing
      // call sites are tracked as remediation debt. The sanctioned exception
      // at src/lib/ai/providers/claude.ts (proxy boundary, gotcha #84) is
      // disabled inline at the call site.
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
          message:
            "'as unknown as X' is a code smell — construct a complete safe-default (see createSafeDefaultBundle in src/lib/analysis/engine.ts) or use schema validation. CLAUDE.md gotchas #48 and #84.",
        },
      ],

      // General rules
      'no-console': ['warn', { allow: ['warn', 'error', 'group', 'groupEnd'] }],
      'no-debugger': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // Test files configuration
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
      // Tests legitimately need `as unknown as` for mock construction —
      // e.g. casting partial Supabase mocks to the full client type.
      'no-restricted-syntax': 'off',
    },
  },

  // Scripts directory - CLI tools need console.log, Node globals, and more lenient rules
  {
    files: ['scripts/**/*.{ts,js,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Environment config - development logging is intentional
  {
    files: ['src/lib/env.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Backend server - Node.js environment with relaxed rules
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Prettier integration (must be last to override other formatting rules)
  prettier
)
