describe("jiratownConfigSchema", () => {
  it("validates a complete config", async () => {
    const { jiratownConfigSchema } = await import("../schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "claude-code", model: "opus-4" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: { custom: "Be helpful" },
      ui: { theme: "tokyonight" },
      plugins: { enabled: ["jira"] },
    });

    expect(result.success).toBe(true);
  });

  it("allows any string as harness", async () => {
    const { jiratownConfigSchema } = await import("../schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "custom-harness" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: {},
      ui: { theme: "tokyonight" },
      plugins: { enabled: [] },
    });

    expect(result.success).toBe(true);
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

  // ── Failure cases ──────────────────────────────────────────────────────────

  it("rejects negative pollInterval", async () => {
    const { jiratownConfigSchema } = await import("../schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "claude-code" },
      behavior: { autoResume: true, pollInterval: -1000 },
      prompt: {},
      ui: { theme: "default" },
      plugins: { enabled: [] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects zero pollInterval", async () => {
    const { jiratownConfigSchema } = await import("../schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "claude-code" },
      behavior: { autoResume: true, pollInterval: 0 },
      prompt: {},
      ui: { theme: "default" },
      plugins: { enabled: [] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-integer pollInterval", async () => {
    const { jiratownConfigSchema } = await import("../schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "claude-code" },
      behavior: { autoResume: true, pollInterval: 30000.5 },
      prompt: {},
      ui: { theme: "default" },
      plugins: { enabled: [] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-boolean autoResume", async () => {
    const { jiratownConfigSchema } = await import("../schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "claude-code" },
      behavior: { autoResume: "yes", pollInterval: 30000 },
      prompt: {},
      ui: { theme: "default" },
      plugins: { enabled: [] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-array plugins.enabled", async () => {
    const { jiratownConfigSchema } = await import("../schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "claude-code" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: {},
      ui: { theme: "default" },
      plugins: { enabled: "jira" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid steering config values", async () => {
    const { jiratownConfigSchema } = await import("../schema.ts");

    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "claude-code" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: {},
      ui: { theme: "default" },
      plugins: { enabled: [] },
      steering: { debounceMs: -100, maxReminders: 0, cooldownMs: -1 },
    });

    expect(result.success).toBe(false);
  });

  it.fails("TODO: add validation for known harness names", async () => {
    // Currently any string is accepted as harness, but we may want to
    // validate against a list of known harnesses in the future.
    const { jiratownConfigSchema } = await import("../schema.ts");
    const result = jiratownConfigSchema.safeParse({
      agent: { harness: "unknown-harness-xyz" },
    });
    expect(result.success).toBe(false);
  });
});
