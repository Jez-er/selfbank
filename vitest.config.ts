import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      // `server-only` throws when imported outside an RSC graph; tests import
      // those modules directly, so it is stubbed out here.
      "server-only": path.resolve(root, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each file gets its own worker, so per-file temporary databases and the
    // module-level connection singleton stay isolated.
    isolate: true,
  },
});
