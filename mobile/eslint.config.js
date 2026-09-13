// https://docs.expo.dev/guides/using-eslint/
//
// The Expo app needs its own config because the repo root's is a Next.js one:
// it carries React Server Component and next/* rules that do not apply here,
// and it explicitly ignores `mobile/**` so the two toolchains cannot collide.
// Without this file the app would have no lint coverage at all — the root
// config ignores it, and nothing else was picking it up.
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      // Same three the web side enforces, so a rule a developer learns in one
      // half of the repo still holds in the other.
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
    },
  },
  { ignores: ["dist/*", ".expo/*", "expo-env.d.ts"] },
]);
