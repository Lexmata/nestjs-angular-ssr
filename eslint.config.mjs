import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import nodePlugin from 'eslint-plugin-n';
import perfectionistPlugin from 'eslint-plugin-perfectionist';
import promisePlugin from 'eslint-plugin-promise';
import regexpPlugin from 'eslint-plugin-regexp';
import securityPlugin from 'eslint-plugin-security';
import sonarjsPlugin from 'eslint-plugin-sonarjs';
import unicornPlugin from 'eslint-plugin-unicorn';

export default tseslint.config(
  // Base configs
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Global ignores
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.js',
      '*.mjs',
      '*.d.ts',
    ],
  },

  // Main source files configuration
  {
    files: ['lib/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'import-x': importPlugin,
      jsdoc: jsdocPlugin,
      n: nodePlugin,
      perfectionist: perfectionistPlugin,
      promise: promisePlugin,
      regexp: regexpPlugin,
      security: securityPlugin,
      sonarjs: sonarjsPlugin,
      unicorn: unicornPlugin,
    },
    rules: {
      // ============================================
      // TypeScript ESLint Rules
      // ============================================
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/return-await': ['error', 'always'],
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        { ignoreArrowShorthand: true },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase'],
        },
        {
          selector: 'class',
          format: ['PascalCase'],
        },
        {
          selector: 'typeAlias',
          format: ['PascalCase'],
        },
        {
          selector: 'enum',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['PascalCase', 'UPPER_CASE'],
        },
      ],
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: [
            'static-field',
            'instance-field',
            'constructor',
            'static-method',
            'instance-method',
          ],
        },
      ],

      // ============================================
      // Core ESLint Rules
      // ============================================
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-template': 'error',
      'prefer-spread': 'error',
      'prefer-rest-params': 'error',
      'prefer-arrow-callback': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'object-shorthand': 'error',
      'no-param-reassign': ['error', { props: false }],
      'no-nested-ternary': 'error',
      'no-unneeded-ternary': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'],
      'default-case-last': 'error',
      'grouped-accessor-pairs': ['error', 'getBeforeSet'],
      'no-constructor-return': 'error',
      'no-duplicate-imports': 'off', // Handled by import-x
      'no-empty-function': 'off', // Handled by @typescript-eslint
      'no-eval': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-implicit-coercion': 'error',
      'no-implied-eval': 'error',
      'no-invalid-this': 'off', // Handled by @typescript-eslint
      'no-iterator': 'error',
      'no-labels': 'error',
      'no-lone-blocks': 'error',
      'no-multi-str': 'error',
      'no-new': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-octal-escape': 'error',
      'no-proto': 'error',
      'no-return-assign': 'error',
      'no-script-url': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'off', // Handled by @typescript-eslint
      'no-useless-call': 'error',
      'no-useless-concat': 'error',
      'no-useless-return': 'error',
      'no-void': ['error', { allowAsStatement: true }],
      'prefer-promise-reject-errors': 'error',
      radix: 'error',
      yoda: 'error',

      // ============================================
      // Import Plugin Rules
      // ============================================
      'import-x/no-unresolved': 'off', // TypeScript handles this
      'import-x/named': 'off', // TypeScript handles this
      'import-x/namespace': 'off', // TypeScript handles this
      'import-x/default': 'off', // TypeScript handles this
      'import-x/export': 'error',
      'import-x/no-named-as-default': 'warn',
      'import-x/no-named-as-default-member': 'warn',
      'import-x/no-duplicates': 'error',
      'import-x/no-mutable-exports': 'error',
      'import-x/no-self-import': 'error',
      'import-x/no-cycle': ['error', { maxDepth: 10 }],
      'import-x/no-useless-path-segments': 'error',
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-anonymous-default-export': 'warn',
      'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],

      // ============================================
      // Node Plugin Rules
      // ============================================
      'n/no-deprecated-api': 'error',
      'n/no-extraneous-import': 'off', // Handled by TypeScript
      'n/no-missing-import': 'off', // Handled by TypeScript
      'n/no-unpublished-import': 'off', // Handled by TypeScript
      'n/no-unsupported-features/es-syntax': 'off', // Using TypeScript
      'n/no-unsupported-features/node-builtins': [
        'error',
        { version: '>=20.0.0' },
      ],
      'n/prefer-global/buffer': ['error', 'always'],
      'n/prefer-global/console': ['error', 'always'],
      'n/prefer-global/process': ['error', 'always'],
      'n/prefer-global/url': ['error', 'always'],
      'n/prefer-global/url-search-params': ['error', 'always'],
      'n/prefer-promises/dns': 'error',
      'n/prefer-promises/fs': 'error',

      // ============================================
      // Promise Plugin Rules
      // ============================================
      'promise/always-return': 'off', // Too strict for many use cases
      'promise/no-return-wrap': 'error',
      'promise/param-names': 'error',
      'promise/catch-or-return': ['error', { allowFinally: true }],
      'promise/no-native': 'off',
      'promise/no-nesting': 'warn',
      'promise/no-promise-in-callback': 'warn',
      'promise/no-callback-in-promise': 'warn',
      'promise/no-new-statics': 'error',
      'promise/no-return-in-finally': 'error',
      'promise/valid-params': 'error',
      'promise/prefer-await-to-then': 'warn',
      'promise/prefer-await-to-callbacks': 'warn',

      // ============================================
      // Security Plugin Rules
      // ============================================
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-object-injection': 'off', // Too many false positives
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-bidi-characters': 'error',

      // ============================================
      // Unicorn Plugin Rules
      // ============================================
      'unicorn/better-regex': 'error',
      'unicorn/catch-error-name': ['error', { name: 'error' }],
      'unicorn/consistent-destructuring': 'error',
      'unicorn/consistent-function-scoping': 'warn',
      'unicorn/custom-error-definition': 'error',
      'unicorn/error-message': 'error',
      'unicorn/escape-case': 'error',
      'unicorn/expiring-todo-comments': 'warn',
      'unicorn/explicit-length-check': 'error',
      'unicorn/filename-case': [
        'error',
        { case: 'kebabCase', ignore: ['^\\[.*\\]\\.ts$'] },
      ],
      'unicorn/new-for-builtins': 'error',
      'unicorn/no-abusive-eslint-disable': 'error',
      'unicorn/no-array-callback-reference': 'off', // Too strict
      'unicorn/no-array-for-each': 'warn',
      'unicorn/no-array-method-this-argument': 'error',
      'unicorn/no-array-push-push': 'error',
      'unicorn/no-array-reduce': 'off', // Reduce is fine when used properly
      'unicorn/no-await-expression-member': 'error',
      'unicorn/no-console-spaces': 'error',
      'unicorn/no-document-cookie': 'error',
      'unicorn/no-empty-file': 'error',
      'unicorn/no-for-loop': 'error',
      'unicorn/no-hex-escape': 'error',
      'unicorn/no-instanceof-array': 'error',
      'unicorn/no-invalid-remove-event-listener': 'error',
      'unicorn/no-keyword-prefix': 'off',
      'unicorn/no-lonely-if': 'error',
      'unicorn/no-negated-condition': 'error',
      'unicorn/no-nested-ternary': 'error',
      'unicorn/no-new-array': 'error',
      'unicorn/no-new-buffer': 'error',
      'unicorn/no-null': 'off', // null is fine
      'unicorn/no-object-as-default-parameter': 'error',
      'unicorn/no-process-exit': 'error',
      'unicorn/no-static-only-class': 'error',
      'unicorn/no-thenable': 'error',
      'unicorn/no-this-assignment': 'error',
      'unicorn/no-typeof-undefined': 'error',
      'unicorn/no-unnecessary-await': 'error',
      'unicorn/no-unnecessary-polyfills': 'error',
      'unicorn/no-unreadable-array-destructuring': 'error',
      'unicorn/no-unreadable-iife': 'error',
      'unicorn/no-unused-properties': 'warn',
      'unicorn/no-useless-fallback-in-spread': 'error',
      'unicorn/no-useless-length-check': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/no-useless-spread': 'error',
      'unicorn/no-useless-switch-case': 'error',
      'unicorn/no-useless-undefined': 'error',
      'unicorn/no-zero-fractions': 'error',
      'unicorn/number-literal-case': 'error',
      'unicorn/numeric-separators-style': 'error',
      'unicorn/prefer-add-event-listener': 'error',
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-array-flat': 'error',
      'unicorn/prefer-array-flat-map': 'error',
      'unicorn/prefer-array-index-of': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-at': 'error',
      'unicorn/prefer-code-point': 'error',
      'unicorn/prefer-date-now': 'error',
      'unicorn/prefer-default-parameters': 'error',
      'unicorn/prefer-export-from': 'error',
      'unicorn/prefer-includes': 'error',
      'unicorn/prefer-json-parse-buffer': 'off', // Not always better
      'unicorn/prefer-logical-operator-over-ternary': 'error',
      'unicorn/prefer-math-trunc': 'error',
      'unicorn/prefer-modern-dom-apis': 'error',
      'unicorn/prefer-modern-math-apis': 'error',
      'unicorn/prefer-module': 'off', // We're using CommonJS output
      'unicorn/prefer-native-coercion-functions': 'error',
      'unicorn/prefer-negative-index': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-number-properties': 'error',
      'unicorn/prefer-object-from-entries': 'error',
      'unicorn/prefer-optional-catch-binding': 'error',
      'unicorn/prefer-prototype-methods': 'error',
      'unicorn/prefer-query-selector': 'error',
      'unicorn/prefer-reflect-apply': 'error',
      'unicorn/prefer-regexp-test': 'error',
      'unicorn/prefer-set-has': 'error',
      'unicorn/prefer-set-size': 'error',
      'unicorn/prefer-spread': 'error',
      'unicorn/prefer-string-replace-all': 'error',
      'unicorn/prefer-string-slice': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
      'unicorn/prefer-string-trim-start-end': 'error',
      'unicorn/prefer-switch': 'error',
      'unicorn/prefer-ternary': 'off', // Sometimes if-else is clearer
      'unicorn/prefer-top-level-await': 'off', // CommonJS compatibility
      'unicorn/prefer-type-error': 'error',
      'unicorn/prevent-abbreviations': 'off', // Too aggressive
      'unicorn/relative-url-style': ['error', 'never'],
      'unicorn/require-array-join-separator': 'error',
      'unicorn/require-number-to-fixed-digits-argument': 'error',
      'unicorn/require-post-message-target-origin': 'error',
      'unicorn/string-content': 'off',
      'unicorn/switch-case-braces': ['error', 'avoid'],
      'unicorn/template-indent': 'error',
      'unicorn/text-encoding-identifier-case': 'error',
      'unicorn/throw-new-error': 'error',

      // ============================================
      // SonarJS Plugin Rules (Code Quality)
      // ============================================
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/no-duplicate-string': ['warn', { threshold: 3 }],
      'sonarjs/no-duplicated-branches': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-inverted-boolean-check': 'error',
      'sonarjs/no-nested-switch': 'error',
      'sonarjs/no-nested-template-literals': 'warn',
      'sonarjs/no-redundant-boolean': 'error',
      'sonarjs/no-redundant-jump': 'error',
      'sonarjs/no-small-switch': 'error',
      'sonarjs/no-useless-catch': 'error',
      'sonarjs/prefer-immediate-return': 'error',
      'sonarjs/prefer-object-literal': 'error',
      'sonarjs/prefer-single-boolean-return': 'error',
      'sonarjs/prefer-while': 'error',

      // ============================================
      // Regexp Plugin Rules
      // ============================================
      'regexp/confusing-quantifier': 'warn',
      'regexp/control-character-escape': 'error',
      'regexp/negation': 'error',
      'regexp/no-contradiction-with-assertion': 'error',
      'regexp/no-control-character': 'error',
      'regexp/no-dupe-characters-character-class': 'error',
      'regexp/no-dupe-disjunctions': 'error',
      'regexp/no-empty-alternative': 'warn',
      'regexp/no-empty-capturing-group': 'error',
      'regexp/no-empty-character-class': 'error',
      'regexp/no-empty-group': 'error',
      'regexp/no-empty-lookarounds-assertion': 'error',
      'regexp/no-escape-backspace': 'error',
      'regexp/no-extra-lookaround-assertions': 'error',
      'regexp/no-invalid-regexp': 'error',
      'regexp/no-invisible-character': 'error',
      'regexp/no-lazy-ends': 'warn',
      'regexp/no-legacy-features': 'error',
      'regexp/no-misleading-capturing-group': 'error',
      'regexp/no-misleading-unicode-character': 'error',
      'regexp/no-missing-g-flag': 'error',
      'regexp/no-non-standard-flag': 'error',
      'regexp/no-obscure-range': 'error',
      'regexp/no-optional-assertion': 'error',
      'regexp/no-potentially-useless-backreference': 'warn',
      'regexp/no-super-linear-backtracking': 'error',
      'regexp/no-trivially-nested-assertion': 'error',
      'regexp/no-trivially-nested-quantifier': 'error',
      'regexp/no-unused-capturing-group': 'warn',
      'regexp/no-useless-assertions': 'error',
      'regexp/no-useless-backreference': 'error',
      'regexp/no-useless-character-class': 'error',
      'regexp/no-useless-dollar-replacements': 'error',
      'regexp/no-useless-escape': 'error',
      'regexp/no-useless-flag': 'error',
      'regexp/no-useless-lazy': 'error',
      'regexp/no-useless-non-capturing-group': 'error',
      'regexp/no-useless-quantifier': 'error',
      'regexp/no-useless-range': 'error',
      'regexp/no-useless-set-operand': 'error',
      'regexp/no-useless-string-literal': 'error',
      'regexp/no-useless-two-nums-quantifier': 'error',
      'regexp/no-zero-quantifier': 'error',
      'regexp/optimal-lookaround-quantifier': 'warn',
      'regexp/optimal-quantifier-concatenation': 'warn',
      'regexp/prefer-character-class': 'error',
      'regexp/prefer-d': 'error',
      'regexp/prefer-escape-replacement-dollar-char': 'error',
      'regexp/prefer-named-backreference': 'error',
      'regexp/prefer-named-capture-group': 'off', // Too strict for simple cases
      'regexp/prefer-named-replacement': 'off',
      'regexp/prefer-plus-quantifier': 'error',
      'regexp/prefer-predefined-assertion': 'error',
      'regexp/prefer-quantifier': 'error',
      'regexp/prefer-question-quantifier': 'error',
      'regexp/prefer-range': 'error',
      'regexp/prefer-regexp-exec': 'error',
      'regexp/prefer-regexp-test': 'error',
      'regexp/prefer-result-array-groups': 'error',
      'regexp/prefer-set-operation': 'error',
      'regexp/prefer-star-quantifier': 'error',
      'regexp/prefer-unicode-codepoint-escapes': 'error',
      'regexp/prefer-w': 'error',
      'regexp/require-unicode-regexp': 'off', // Not always needed
      'regexp/simplify-set-operations': 'error',
      'regexp/sort-alternatives': 'off',
      'regexp/sort-character-class-elements': 'off',
      'regexp/sort-flags': 'error',
      'regexp/strict': 'error',
      'regexp/unicode-escape': 'error',
      'regexp/use-ignore-case': 'error',

      // ============================================
      // JSDoc Plugin Rules
      // ============================================
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-indentation': 'off',
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/check-types': 'off', // TypeScript handles types
      'jsdoc/require-description': 'off',
      'jsdoc/require-jsdoc': 'off', // Too strict for all functions
      'jsdoc/require-param': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-param-name': 'error',
      'jsdoc/require-param-type': 'off', // TypeScript handles types
      'jsdoc/require-returns': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/require-returns-type': 'off', // TypeScript handles types
      'jsdoc/valid-types': 'off', // TypeScript handles types

      // ============================================
      // Perfectionist Plugin Rules (Sorting)
      // ============================================
      'perfectionist/sort-imports': [
        'error',
        {
          type: 'natural',
          order: 'asc',
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'type',
            'unknown',
          ],
          newlinesBetween: 0,
          internalPattern: ['^@/', '^~/', '^\\.\\./'],
        },
      ],
      'perfectionist/sort-named-imports': [
        'error',
        { type: 'natural', order: 'asc' },
      ],
      'perfectionist/sort-named-exports': [
        'error',
        { type: 'natural', order: 'asc' },
      ],
      'perfectionist/sort-exports': [
        'error',
        { type: 'natural', order: 'asc' },
      ],
    },
  },

  // Test files configuration - more relaxed rules
  {
    files: ['lib/**/*.spec.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Relax rules for test files
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      'no-console': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-identical-functions': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/no-null': 'off',
    },
  },
);

