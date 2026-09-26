import js from '@eslint/js'
import angular from 'angular-eslint'
import prettier from 'eslint-config-prettier'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import ts from 'typescript-eslint'

export default defineConfig([
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ts.configs.recommended, angular.configs.tsRecommended],
    // Lints the inline templates too, with the template rules below
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },
  {
    // Templates are parsed in full, so a field only the markup reads is never
    // reported as unused, and the accessibility rules see every element
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  // Formatting is left to Prettier, so the rules about layout are turned off
  prettier,
  {
    ignores: ['dist/', '.angular/'],
  },
])
