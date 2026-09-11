import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The ageing and property tests run tens of millions of simulated
    // seconds. They are the point of the suite, so they get the time.
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
