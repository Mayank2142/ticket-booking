import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      // These effects intentionally initiate async data loads or expiry state changes.
      "react-hooks/set-state-in-effect": "off",
      // The standalone Vite application cannot use next/image.
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "apps/web/dist/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "src/generated/**",
  ]),
]);
