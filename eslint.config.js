// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions are Deno code, deployed from the Supabase Dashboard:
    // npm: specifiers and the Deno global are not this app's to lint.
    ignores: ["dist/*", "supabase/functions/**"],
  }
]);
