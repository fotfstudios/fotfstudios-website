import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** Flat config (ESLint 9 + Next 16). Los presets de Next ya son flat. */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "public/**", ".remember/**", ".screens/**"],
  },
];

export default eslintConfig;
