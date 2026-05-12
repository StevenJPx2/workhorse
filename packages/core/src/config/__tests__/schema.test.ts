describe("workhorseConfigSchema", () => {
  it("validates a complete config", async () => {
    const { workhorseConfigSchema } = await import("../schema.ts");

    const result = workhorseConfigSchema.safeParse({
      agent: { harness: "claude-code", model: "opus-4" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: { custom: "Be helpful" },
      ui: { theme: "tokyonight" },
      plugins: { disabled: [] },
    });

    expect(result.success).toBe(true);
  });

  it("allows any string as harness", async () => {
    const { workhorseConfigSchema } = await import("../schema.ts");

    const result = workhorseConfigSchema.safeParse({
      agent: { harness: "custom-harness" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: {},
      ui: { theme: "tokyonight" },
      plugins: { disabled: [] },
    });

    expect(result.success).toBe(true);
  });

  it("allows passthrough for plugin-specific keys", async () => {
    const { workhorseConfigSchema } = await import("../schema.ts");

    const result = workhorseConfigSchema.safeParse({
      agent: { harness: "opencode" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: {},
      ui: { theme: "tokyonight" },
      plugins: {
        disabled: [],
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
    const { workhorseConfigSchema } = await import("../schema.ts");

    const result = workhorseConfigSchema.safeParse({
      agent: { harness: "claude-code" },
      behavior: { autoResume: true, pollInterval: -1000 },
      prompt: {},
      ui: { theme: "default" },
      plugins: { disabled: [] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects zero pollInterval", async () => {
    const { workhorseConfigSchema } = await import("../schema.ts");

    const result = workhorseConfigSchema.safeParse({
      agent: { harness: "claude-code" },
      behavior: { autoResume: true, pollInterval: 0 },
      prompt: {},
      ui: { theme: "default" },
      plugins: { disabled: [] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-integer pollInterval", async () => {
    const { workhorseConfigSchema } = await import("../schema.ts");

    const result = workhorseConfigSchema.safeParse({
      agent: { harness: "claude-code" },
      behavior: { autoResume: true, pollInterval: 30000.5 },
      prompt: {},
      ui: { theme: "default" },
      plugins: { disabled: [] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-boolean autoResume", async () => {
    const { workhorseConfigSchema } = await import("../schema.ts");

    const result = workhorseConfigSchema.safeParse({
      agent: { harness: "claude-code" },
      behavior: { autoResume: "yes", pollInterval: 30000 },
      prompt: {},
      ui: { theme: "default" },
      plugins: { disabled: [] },
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-array plugins.disabled", async () => {
    const { workhorseConfigSchema } = await import("../schema.ts");

    const result = workhorseConfigSchema.safeParse({
      agent: { harness: "claude-code" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: {},
      ui: { theme: "default" },
      plugins: { disabled: "jira" }, // should be an array, not a string
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid steering config values", async () => {
    const { workhorseConfigSchema } = await import("../schema.ts");

    const result = workhorseConfigSchema.safeParse({
      agent: { harness: "claude-code" },
      behavior: { autoResume: true, pollInterval: 30000 },
      prompt: {},
      ui: { theme: "default" },
      plugins: { disabled: [] },
      steering: { debounceMs: -100, maxReminders: 0, cooldownMs: -1 },
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown harness names", async () => {
    const { workhorseConfigSchema } = await import("../schema.ts");
    const result = workhorseConfigSchema.safeParse({
      agent: { harness: "unknown-harness-xyz" },
    });
    expect(result.success).toBe(false);
  });
});
