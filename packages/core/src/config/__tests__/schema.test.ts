describe("jiratownConfigSchema", () => {
  it("validates a complete config", async () => {
    const { jiratownConfigSchema } = await import("../schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "claude-code", model: "opus-4" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: { custom: "Be helpful" },
      ui: { theme: "tokyonight" },
      plugins: { enabled: ["jira"], directories: [] },
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid harness", async () => {
    const { jiratownConfigSchema } = await import("../schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "invalid-harness" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: {},
      ui: { theme: "tokyonight" },
      plugins: { enabled: [], directories: [] },
    });

    expect(result.success).toBe(false);
  });

  it("allows passthrough for plugin-specific keys", async () => {
    const { jiratownConfigSchema } = await import("../schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "opencode" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: {},
      ui: { theme: "tokyonight" },
      plugins: {
        enabled: ["jira"],
        directories: [],
        jira: { cloudId: "company.atlassian.net" },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data.plugins as Record<string, unknown>)["jira"]).toEqual({
        cloudId: "company.atlassian.net",
      });
    }
  });
});
