export default [
  {
    files: ["**/*.{js,mjs}"],
    ignores: [
      "node_modules/**",
      ".wrangler/**",
      "dist/**",
      "reports/**",
      "**/*.json",
      "**/*.csv",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        URL: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-constant-condition": ["error", { checkLoops: false }],
    },
  },
];
