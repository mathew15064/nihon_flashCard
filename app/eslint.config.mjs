import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
export default [
  { ignores: ["dist/**","node_modules/**","data/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["scripts/**/*.mjs"], languageOptions:{globals:{...globals.node,...globals.browser}} },
  { files: ["**/*.{ts,tsx}"], languageOptions:{globals:{...globals.node,...globals.browser}},
    rules:{"@typescript-eslint/no-explicit-any":"error"} }
];
