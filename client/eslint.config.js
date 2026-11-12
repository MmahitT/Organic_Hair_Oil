import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  // Pin the TypeScript parser to this package so editors opened at the repo root do not see two candidate tsconfig folders.
  { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
