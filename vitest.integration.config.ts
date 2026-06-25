import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests de integración (*.itest.ts) contra la base Supabase LOCAL + sandbox MP.
// Requieren `npm run db:start` y credenciales en .env.local. No corren en el CI.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    include: ["src/**/*.itest.ts"],
    environment: "node",
    testTimeout: 20000,
    fileParallelism: false,
    setupFiles: ["tests/setup.integration.ts"],
  },
});
