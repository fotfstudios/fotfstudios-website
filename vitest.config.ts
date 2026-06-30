import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resuelve "@/..." al root del repo, igual que el alias de tsconfig.
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    include: ["src/**/*.test.ts", "lib/**/*.test.ts"],
    environment: "node",
  },
});
