import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Its own project, its own tooling — see the note in tsconfig.json
    "video/**",
    "workers/**",
    // Built bundles, not source: a Studio build from March kept in dist/, and
    // other sessions' checkouts with their own builds. Linting those ran
    // `npm run lint` out of memory.
    "dist/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
