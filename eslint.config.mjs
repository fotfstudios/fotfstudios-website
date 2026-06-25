import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** Flat config (ESLint 9 + Next 16). Los presets de Next ya son flat. */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "public/**", ".remember/**", ".screens/**", "coverage/**"],
  },
  // Frontera de capas (hexagonal ligera). El dominio es puro; la aplicación no
  // toca infraestructura concreta. Ver src/README.md.
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/src/application/*", "@/src/infrastructure/*", "@/app/*", "@/components/*"],
              message: "domain es puro: no puede importar capas externas.",
            },
            {
              group: ["next", "next/*", "react", "react-dom", "@supabase/*", "mercadopago", "resend"],
              message: "domain es puro: sin framework ni IO.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/src/infrastructure/*"],
              message: "application usa interfaces (ports), no infraestructura concreta.",
            },
            {
              group: ["next", "next/*", "@supabase/*", "mercadopago", "resend"],
              message: "application no toca IO concreto; eso vive en infrastructure.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
