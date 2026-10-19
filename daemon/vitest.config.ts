import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "anti-slop",
          include: ["tools/oxlint/anti-slop/**/*.test.ts"],
          setupFiles: ["tools/vitest/rule-tester.ts"],
        },
      },
    ],
  },
});
