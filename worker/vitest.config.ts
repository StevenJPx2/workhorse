import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./test/flue-v2-wrangler.toml" },
      miniflare: { isolatedStorage: true },
    }),
  ],
  test: {
    name: "worker-cloudflare",
    include: ["cloudflare-test/**/*.test.ts"],
  },
});
