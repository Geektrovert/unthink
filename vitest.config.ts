import { defineConfig } from "vitest/config";

const consoleGuard = "./test/console-guard.ts";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          environment: "node",
          include: ["src/**/*.test.ts", "test/unit/**/*.test.ts"],
          name: "unit",
          setupFiles: [consoleGuard],
        },
      },
      {
        test: {
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
          name: "convex",
          setupFiles: [consoleGuard],
        },
      },
    ],
  },
});
