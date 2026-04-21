import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── Helpers ─────────────────────────────────────────────────────────────────

// oxlint-disable-next-line jiratown/no-single-reference-function -- test helper
function writeTempToml(dir: string, content: string): void {
  writeFileSync(join(dir, ".jiratown.toml"), content, "utf-8");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("bootstrap", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "jiratown-bootstrap-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns Jiratown instance with config and hooks", async () => {
    const { bootstrap } = await import("./bootstrap.ts");
    const jt = await bootstrap(tmpDir);

    expect(jt.config).toBeDefined();
    expect(jt.hooks).toBeDefined();
    expect(typeof jt.shutdown).toBe("function");
  });

  it("loads config from project root", async () => {
    const { bootstrap } = await import("./bootstrap.ts");

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

    const jt = await bootstrap(tmpDir);

    expect(jt.config.agent.harness).toBe("claude-code");
    expect(jt.config.agent.model).toBe("opus-4");
    expect(jt.config.ui.theme).toBe("gruvbox");
  });

  it("config is frozen (readonly)", async () => {
    const { bootstrap } = await import("./bootstrap.ts");
    const jt = await bootstrap(tmpDir);

    expect(() => {
      // @ts-expect-error - intentionally testing runtime freeze
      jt.config.agent = { harness: "modified", model: "modified" };
    }).toThrow();
  });

  it("shutdown clears all hook handlers", async () => {
    const { bootstrap } = await import("./bootstrap.ts");
    const jt = await bootstrap(tmpDir);

    let called = false;
    jt.hooks.on("plugin.loaded", () => {
      called = true;
    });

    await jt.shutdown();

    jt.hooks.emit("plugin.loaded", { name: "test" });
    expect(called).toBe(false);
  });

  it("multiple bootstrap calls get fresh hooks state", async () => {
    const { bootstrap } = await import("./bootstrap.ts");

    const jt1 = await bootstrap(tmpDir);
    let callCount = 0;
    jt1.hooks.on("plugin.loaded", () => {
      callCount++;
    });

    // Second bootstrap clears previous handlers
    const jt2 = await bootstrap(tmpDir);
    jt2.hooks.emit("plugin.loaded", { name: "test" });

    expect(callCount).toBe(0);
  });
});
