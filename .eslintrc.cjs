module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "no-constant-condition": ["error", { checkLoops: false }],
  },
  ignorePatterns: [
    "node_modules/",
    ".wrangler/",
    "dist/",
    "*.json",
    "*.csv",
    "reports/",
  ],
};
