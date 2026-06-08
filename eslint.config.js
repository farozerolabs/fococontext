import js from "@eslint/js";
import tseslint from "typescript-eslint";

const tsconfigRootDir = import.meta.dirname;
const tseslintRecommended = tseslint.configs.recommended.map((config) => ({
  ...config,
  languageOptions: {
    ...config.languageOptions,
    parserOptions: {
      ...config.languageOptions?.parserOptions,
      tsconfigRootDir,
    },
  },
}));

export default [
  {
    ignores: [
      "node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/tmp/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "ReferenceDocs-*/**",
      "docs/**",
      "openspec/**",
      "docs/opencode/**",
      "docs/llm_wiki/**",
      "docs/pi-mono/**",
      "apps/docs-site/docs/.vitepress/cache/**",
      "local-knowledge-demos/**",
    ],
  },
  js.configs.recommended,
  ...tseslintRecommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        tsconfigRootDir,
      },
    },
  },
  {
    files: ["apps/admin-web/public/**/*.js"],
    languageOptions: {
      globals: {
        window: "readonly",
      },
    },
  },
  {
    files: ["apps/admin-web/server.mjs"],
    languageOptions: {
      globals: {
        URL: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["apps/docs-site/**/*.{js,mjs,ts}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["tests/manual/**/*.mjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
      },
    },
  },
];
