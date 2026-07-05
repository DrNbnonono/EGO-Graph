import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    globals: false,
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
