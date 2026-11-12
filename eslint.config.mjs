import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "test-results/", "playwright-report/"] },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    files: ["src/**/*.ts", "e2e/**/*.ts", "playwright.config.ts"],
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
      "space-before-function-paren": ["error", { anonymous: "never", named: "never", asyncArrow: "always" }],
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
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["process", "Buffer", "global", "require", "__dirname", "__filename"].map((name) => ({
          name,
          message: "Node globals don't exist in the browser.",
        })),
        ...["setTimeout", "setInterval"].map((name) => ({
          name,
          message: "Use a TimerScope from src/core/clock.ts, so timers follow the game clock and pause.",
        })),
      ],
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "^node:", message: "Browser code can't import Node modules." }] },
      ],
    },
  },
  {
    // The state machine ticks the clock before it updates the state (state-machine.ts): a second caller would advance
    // game time twice a frame, or outside the machine's order. Matches `clock.tick(…)`, `deps.clock.tick(…)`,
    // `this.clock.tick(…)` and the like, not `audio.tick()`.
    files: ["src/**/*.ts", "e2e/**/*.ts"],
    ignores: ["src/core/state-machine.ts", "src/**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...["object.name", "object.property.name"].map((path) => ({
          selector: `CallExpression > MemberExpression.callee[property.name="tick"][${path}=/clock/i]`,
          message: "Only the StateMachine ticks the clock (src/core/state-machine.ts): call machine.update instead.",
        })),
      ],
    },
  },
  {
    files: ["src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": [
        "error",
        { allowForKnownSafeCalls: [{ from: "package", package: "node:test", name: ["describe", "it", "test"] }] },
      ],
    },
  },
  {
    files: ["eslint.config.mjs", "scripts/**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Node scripts (scripts/import-anims.mjs): plain JavaScript, run by Node, not bundled.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
);