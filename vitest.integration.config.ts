import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests de integración (*.itest.ts) contra la base Supabase LOCAL.
// Requieren `npm run db:start`. No corren en el CI por defecto.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    include: ["src/**/*.itest.ts"],
    environment: "node",
    testTimeout: 15000,
    fileParallelism: false,
  },
});
