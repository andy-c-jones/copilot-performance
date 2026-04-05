const js = require("@eslint/js");
const prettierConfig = require("eslint-config-prettier");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "eslint.config.js"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" }
      ]
    }
  }
);
