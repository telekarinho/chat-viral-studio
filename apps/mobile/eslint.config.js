const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  { ignores: ["android/*", "ios/*", "node_modules/*", ".expo/*"] },
  { rules: { "no-console": ["error", { allow: ["warn", "error"] }] } },
]);
