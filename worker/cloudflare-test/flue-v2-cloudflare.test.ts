import { cloudflareSandbox } from "@flue/runtime-v2/cloudflare";
import { describe, expect, it } from "vitest";

describe("Flue v2 Cloudflare sandbox adapter", () => {
  it("loads in workerd and maps the Sandbox RPC surface", async () => {
    const calls: Array<{ command: string; options?: Record<string, unknown> }> = [];
    const writes: Array<{ path: string; content: string | Uint8Array }> = [];
    const stub = {
      async exec(command: string, options?: Record<string, unknown>) {
        calls.push({ command, options });
        return { success: true, stdout: "ok", stderr: "", exitCode: 0 };
      },
      async readFile(path: string) {
        return { content: `file:${path}` };
      },
      async writeFile(path: string, content: string | Uint8Array) {
        writes.push({ path, content });
      },
      async exists() {
        return { exists: true };
      },
      async mkdir() {},
      async deleteFile() {},
      async getState() {
        return { status: "running" };
      },
    };

    const factory = cloudflareSandbox(stub, { cwd: "/workspace/repo" });
    const env = await factory.createSessionEnv({ id: "ticket-pilot" });
    const result = await env.exec("git status", { timeoutMs: 12_000 });

    expect(result).toMatchObject({ exitCode: 0, stdout: "ok", stderr: "" });
    expect(calls).toEqual([
      { command: "git status", options: { cwd: "/workspace/repo", timeout: 12_000 } },
    ]);
    expect(await env.readFile("README.md")).toBe("file:/workspace/repo/README.md");
    expect(await env.exists("README.md")).toBe(true);
    await env.writeFile("notes.txt", "pilot");
    expect(writes).toEqual([{ path: "/workspace/repo/notes.txt", content: "pilot" }]);
    expect(env.cwd).toBe("/workspace/repo");
  });
});
