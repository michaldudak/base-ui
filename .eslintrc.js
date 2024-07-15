const baseline = require('@mui/monorepo/.eslintrc');
const path = require('path');

const OneLevelImportMessage = [
  'Prefer one level nested imports to avoid bundling everything in dev mode or breaking CJS/ESM split.',
  'See https://github.com/mui/material-ui/pull/24147 for the kind of win it can unlock.',
].join('\n');

module.exports = {
  ...baseline,
  settings: {
    'import/resolver': {
      webpack: {
        config: path.join(__dirname, './webpackBaseConfig.js'),
      },
    },
  },
  /**
   * Sorted alphanumerically within each group. built-in and each plugin form
   * their own groups.
   */
  rules: {
    ...baseline.rules,
    // TODO move to @mui/monorepo, codebase is moving away from default exports
    'import/prefer-default-export': 'off',
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '@mui/*/*/*',
              '@pigment-css/*/*/*',
              '@base_ui/react/*/*',
              '!@base_ui/react/legacy/*',
              // Allow any import depth with any internal packages
              '!@mui/internal-*/**',
              // TODO delete, @mui/docs should be @mui/internal-docs
              '!@mui/docs/**',
            ],
            message: OneLevelImportMessage,
          },
        ],
      },
    ],
  },
  overrides: [
    ...baseline.overrides,
    {
      files: ['packages/mui-base/src/**/*{.ts,.tsx}'],
      parserOptions: {
        project: [
          path.join(__dirname, './packages/mui-base/tsconfig.build.json'),
          path.join(__dirname, './packages/mui-base/tsconfig.test.json'),
        ],
      },
      rules: {
        '@typescript-eslint/await-thenable': 'error',
        '@typescript-eslint/ban-ts-comment': 'error',
        '@typescript-eslint/ban-types': 'error',
        'no-array-constructor': 'off',
        '@typescript-eslint/no-array-constructor': 'error',
        '@typescript-eslint/no-base-to-string': 'error',
        '@typescript-eslint/no-duplicate-enum-values': 'error',
        '@typescript-eslint/no-duplicate-type-constituents': 'error',
        '@typescript-eslint/no-extra-non-null-assertion': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-for-in-array': 'error',
        'no-implied-eval': 'off',
        '@typescript-eslint/no-implied-eval': 'error',
        'no-loss-of-precision': 'off',
        '@typescript-eslint/no-loss-of-precision': 'error',
        '@typescript-eslint/no-misused-new': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/no-namespace': 'error',
        '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
        '@typescript-eslint/no-redundant-type-constituents': 'error',
        '@typescript-eslint/no-this-alias': 'error',
        '@typescript-eslint/no-unnecessary-type-assertion': 'error',
        '@typescript-eslint/no-unnecessary-type-constraint': 'error',
        '@typescript-eslint/no-unsafe-argument': 'error',
        '@typescript-eslint/no-unsafe-assignment': 'error',
        '@typescript-eslint/no-unsafe-call': 'error',
        '@typescript-eslint/no-unsafe-declaration-merging': 'error',
        '@typescript-eslint/no-unsafe-enum-comparison': 'error',
        '@typescript-eslint/no-unsafe-member-access': 'error',
        '@typescript-eslint/no-unsafe-return': 'error',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': 'error',
        '@typescript-eslint/no-var-requires': 'error',
        '@typescript-eslint/prefer-as-const': 'error',
        'require-await': 'off',
        '@typescript-eslint/require-await': 'error',
        '@typescript-eslint/restrict-plus-operands': 'error',
        '@typescript-eslint/restrict-template-expressions': 'error',
        '@typescript-eslint/triple-slash-reference': 'error',
        '@typescript-eslint/unbound-method': 'error',
      },
    },
    {
      files: ['docs/pages/experiments/**/*{.tsx,.js}', 'docs/pages/playground/**/*{.tsx,.js}'],
      rules: {
        '@typescript-eslint/no-use-before-define': 'off',
        'react/prop-types': 'off',
        'no-alert': 'off',
        'no-console': 'off',
      },
    },
  ],
};
