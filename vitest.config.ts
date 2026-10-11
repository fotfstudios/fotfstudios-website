import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resuelve "@/..." al root del repo, igual que el alias de tsconfig.
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  // tsconfig deja el JSX en "preserve" (lo compila Next); los tests que renderizan
  // componentes con react-dom/server necesitan que Vite lo transforme.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["src/**/*.test.ts", "lib/**/*.test.ts", "components/**/*.test.ts"],
    environment: "node",
  },
});
