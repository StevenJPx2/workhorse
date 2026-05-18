import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ─── Helpers ─────────────────────────────────────────────────────────────────

// oxlint-disable-next-line workhorse/no-single-reference-function -- test helper
function writeTempToml(dir: string, content: string): void {
  writeFileSync(join(dir, ".workhorse.toml"), content, "utf-8");
}

// Skip bootstrap tests in CI — they depend on MemoryService/L2 (HuggingFace model) which is flaky in CI.
// These tests run reliably locally where the model is cached.
const isCI = process.env["CI"] === "true";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe.skipIf(isCI)("bootstrap", () => {
  let tmpDir: string;
  let tmpDataDir: string;
  let originalXdgData: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "workhorse-bootstrap-"));
    // Create a temp XDG_DATA_HOME with workhorse directory for the database
    tmpDataDir = mkdtempSync(join(tmpdir(), "workhorse-data-"));
    mkdirSync(join(tmpDataDir, "workhorse"), { recursive: true });
    originalXdgData = process.env["XDG_DATA_HOME"];
    // Override XDG_DATA_HOME so resolveConfigPaths() uses the temp directory
    process.env["XDG_DATA_HOME"] = tmpDataDir;
  });

  afterEach(() => {
    if (originalXdgData) {
      process.env["XDG_DATA_HOME"] = originalXdgData;
    } else {
      delete process.env["XDG_DATA_HOME"];
    }
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(tmpDataDir, { recursive: true, force: true });
  });

  it("returns Workhorse instance with config and hooks", async () => {
    const { bootstrap } = await import("../bootstrap.ts");
    const jt = await bootstrap({ repoRoot: tmpDir });

    expect(jt.config).toBeDefined();
    expect(jt.hooks).toBeDefined();
    expect(typeof jt.shutdown).toBe("function");
  });

  it("loads config from project root", async () => {
    const { bootstrap } = await import("../bootstrap.ts");

    writeTempToml(
      tmpDir,
      `
[agent]
harness = "claude-code"
model = "opus-4"

[ui]
theme = "gruvbox"
`,
    );

    const jt = await bootstrap({ repoRoot: tmpDir });

    expect(jt.config.agent.harness).toBe("claude-code");
    expect(jt.config.agent.model).toBe("opus-4");
    expect(jt.config.ui.theme).toBe("gruvbox");
  });

  it("config is frozen (readonly)", async () => {
    const { bootstrap } = await import("../bootstrap.ts");
    const jt = await bootstrap({ repoRoot: tmpDir });

    expect(() => {
      // @ts-expect-error - intentionally testing runtime freeze
      jt.config.agent = { harness: "modified", model: "modified" };
    }).toThrow();
  });

  it("shutdown clears all hook handlers", async () => {
    const { bootstrap } = await import("../bootstrap.ts");
    const jt = await bootstrap({ repoRoot: tmpDir });

    let called = false;
    jt.hooks.on("plugin.loaded", () => {
      called = true;
    });

    await jt.shutdown();

    jt.hooks.emit("plugin.loaded", { name: "test" });
    expect(called).toBe(false);
  });

  it("multiple bootstrap calls get fresh hooks state", async () => {
    const { bootstrap } = await import("../bootstrap.ts");

    const jt1 = await bootstrap({ repoRoot: tmpDir });
    let callCount = 0;
    jt1.hooks.on("plugin.loaded", () => {
      callCount++;
    });

    // Second bootstrap clears previous handlers
    const jt2 = await bootstrap({ repoRoot: tmpDir });
    jt2.hooks.emit("plugin.loaded", { name: "test" });

    expect(callCount).toBe(0);
  });

  it("registers plugins provided in options", async () => {
    const { bootstrap } = await import("../bootstrap.ts");
    const { definePlugin } = await import("../plugins/define.ts");

    let setupCalled = false;
    const testPlugin = definePlugin({
      manifest: { name: "test-plugin", version: "1.0.0" },
      setup() {
        setupCalled = true;
      },
    });

    const jt = await bootstrap({ repoRoot: tmpDir, plugins: [testPlugin] });

    expect(setupCalled).toBe(true);
    expect(jt.plugins.has("test-plugin")).toBe(true);
    await jt.shutdown();
  });

  it.fails("TODO: implement graceful shutdown timeout handling", async () => {
    // This test documents planned behavior that is not yet implemented.
    // When shutdown is called with a timeout, it should reject pending operations
    // after the timeout expires.
    const { bootstrap } = await import("../bootstrap.ts");
    const jt = await bootstrap({ repoRoot: tmpDir });

    // Expected: shutdown(timeout) should return a promise that resolves
    // even if some hooks are still processing, after the timeout
    expect(typeof jt.shutdown).toBe("function");
    // Currently shutdown doesn't support timeout parameter
    expect(true).toBe(false);
  });
});
