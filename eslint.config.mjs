import header from 'eslint-plugin-header';
import importPlugin from 'eslint-plugin-import';
import neostandard, { resolveIgnoresFromGitignore } from 'neostandard';

// Disable schema checking for eslint-plugin-header
header.rules.header.meta.schema = false;

// Export the litning config
export default [
  // Standard rules with semi
  ...neostandard({
    ignores: resolveIgnoresFromGitignore(),
    languageOptions: {
      ecmaVersion: 2022,
    },
    semi: true,
  }),
  // Customizations
  {
    rules: {
      'handle-callback-err': 'off',
      strict: ['error', 'global'],
      '@stylistic/space-before-function-paren': ['error', {
        anonymous: 'never',
        named: 'never',
        asyncArrow: 'always',
      }],
    }
  },
  // Header plugin
  {
    plugins: {
      header
    },
    ignores: ['eslint.config.mjs'],
    rules: {
      'header/header': [2, 'line', [
        { pattern: '^\\ Copyright © 20\\d\\d(?:, 20\\d\\d)? IBM Corp\\. All rights reserved\\.$' },
        '',
        ' Licensed under the Apache License, Version 2.0 (the "License");',
        ' you may not use this file except in compliance with the License.',
        ' You may obtain a copy of the License at',
        '',
        ' http://www.apache.org/licenses/LICENSE-2.0',
        '',
        ' Unless required by applicable law or agreed to in writing, software',
        ' distributed under the License is distributed on an "AS IS" BASIS,',
        ' WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.',
        ' See the License for the specific language governing permissions and',
        ' limitations under the License.'
      ]]
    }
  },
  // Import plugin
  {
    ...importPlugin.flatConfigs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
    },
  }
];
