import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/"] },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      
      "array-bracket-spacing": ["error", "never"],
      "comma-dangle": ["error", "always-multiline"],
      "comma-spacing": ["error", { before: false, after: true }],
      "eol-last": ["error", "always"],
      "indent": ["error", 2],
      "keyword-spacing": ["error", { before: true, after: true }],
      "max-len": ["error", { code: 120 }],
      "no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0, maxBOF: 0 }],
      "no-trailing-spaces": "error",
      "no-whitespace-before-property": "error",
      "space-before-blocks": ["error", "always"],
      "space-before-function-paren": ["error", "never"],
      "space-in-parens": ["error", "never"],
      "space-infix-ops": "error",

      semi: ["error", "always"],
      quotes: ["error", "double"],
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "no-console": "warn",
      "no-debugger": "error",
      "no-duplicate-imports": "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-throw-literal": "error",
    },
  },
  {
    files: ["eslint.config.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
);