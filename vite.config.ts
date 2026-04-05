import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    target: "node20",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    ssr: "src/main.ts",
    rollupOptions: {
      output: {
        format: "cjs",
        entryFileNames: "index.js"
      }
    }
  },
  ssr: {
    noExternal: true
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/main.ts",
        "src/application/ports.ts",
        "src/infrastructure/github-pull-request-client.ts"
      ],
      reporter: ["text", "lcov"],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90
      }
    }
  }
});
