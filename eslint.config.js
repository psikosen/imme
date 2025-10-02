import js from "@eslint/js";

const { languageOptions, rules } = js.configs.recommended;

export default [
  {
    ignores: ["node_modules", "dist"]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ...languageOptions,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ...languageOptions?.parserOptions,
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          ...languageOptions?.parserOptions?.ecmaFeatures,
          importAssertions: true
        }
      },
      globals: {
        ...languageOptions?.globals,
        console: "readonly"
      }
    },
    rules: {
      ...rules,
      "no-console": "off"
    }
  }
];
