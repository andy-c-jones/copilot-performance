import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "node20",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: "src/main.ts",
      formats: ["cjs"],
      fileName: () => "index.js"
    }
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      all: true,
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
