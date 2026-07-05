import js from "@eslint/js";
import tseslint from "typescript-eslint";

const nodeGlobals = {
  AbortController: "readonly",
  Buffer: "readonly",
  console: "readonly",
  clearTimeout: "readonly",
  fetch: "readonly",
  process: "readonly",
  Response: "readonly",
  setTimeout: "readonly",
  URL: "readonly",
};

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "node_modules/**", "coverage/**", "opencode/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      globals: nodeGlobals,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    files: ["scripts/**/*.mjs", "*.js", "*.mjs"],
    languageOptions: {
      globals: nodeGlobals,
    },
  },
];
