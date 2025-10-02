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
      ecmaVersion: 2022,
      sourceType: "module",
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
