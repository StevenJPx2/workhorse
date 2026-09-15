// M5 spike: @cloudflare/computer workspace in a DO + isolate shell.
//
// Proves three claims against the real platform (mirrors the upstream
// examples/worker-shell shape):
//   1. durable VFS — files written to the DO's SQLite survive restarts
//   2. git — workspace.git.clone over the VFS (isomorphic-git, no backend)
//   3. isolate shell — just-bash in a Dynamic Worker sees the same files
// Scratch worker: /fs, /git, /exec. NOT part of the fleet.

import { DurableObject } from "cloudflare:workers";
import { getWorkspace, type DurableObjectStorageLike, withWorkspace } from "@cloudflare/computer";
import { createGitClient } from "@cloudflare/computer/git";
import { WorkerShellBackend } from "@cloudflare/computer/backends/worker-shell";
import curl from "@cloudflare/computer/shell/curl";
import jq from "@cloudflare/computer/shell/jq";

export { WorkspaceServiceProxy } from "@cloudflare/computer";

interface SpikeEnv {
  LOADER: WorkerLoader;
  SpikeDO: DurableObjectNamespace<SpikeDO>;
}

export class SpikeDO extends withWorkspace(class extends DurableObject<SpikeEnv> {}, (self) => {
  const { ctx, env } = self as unknown as { ctx: DurableObjectState; env: SpikeEnv };
  return {
    storage: ctx.storage as unknown as DurableObjectStorageLike,
    git: createGitClient(),
    backends: [
      new WorkerShellBackend({
        loader: env.LOADER as unknown as ConstructorParameters<typeof WorkerShellBackend>[0]["loader"],
        workspace: { binding: "SpikeDO", id: ctx.id.toString() },
        ctx,
        commands: [curl, jq],
      }),
    ],
  };
}) {}

export default {
  async fetch(request: Request, env: SpikeEnv): Promise<Response> {
    const url = new URL(request.url);
    const name = url.searchParams.get("name") ?? "default";
    const id = env.SpikeDO.idFromName(name);
    const ws = await getWorkspace(env.SpikeDO.get(id) as unknown as Parameters<typeof getWorkspace>[0]);

    try {
      if (url.pathname === "/fs") {
        const path = url.searchParams.get("path") ?? "/notes.md";
        if (request.method === "PUT") {
          const body = await request.text();
          await ws.fs.writeFile(path, body);
          return json({ wrote: path, bytes: body.length });
        }
        let content: string | null = null;
        try {
          content = await ws.fs.readFile(path, "utf8");
        } catch {
          content = null;
        }
        const listing = await ws.fs.readdir("/").catch(() => []);
        return json({ path, content: content?.slice(0, 500) ?? null, root: listing });
      }

      if (url.pathname === "/git") {
        const repo = url.searchParams.get("url") ?? "https://github.com/stevenjohn/home_temp";
        const dir = url.searchParams.get("dir") ?? "/repo";
        await ws.git.clone({ url: repo, dir });
        const files = await ws.fs.readdir(dir).catch(() => []);
        const readme = await ws.fs.readFile(`${dir}/README.md`, "utf8").catch(() => null);
        return json({ cloned: repo, dir, files, readmeHead: readme?.slice(0, 300) ?? null });
      }

      if (url.pathname === "/exec") {
        const { command } = (await request.json().catch(() => ({}))) as { command?: string };
        if (!command) return json({ error: "command required" }, 400);
        const handle = await ws.runtime.exec(command, { backend: "shell", encoding: "utf8" });
        const result = (await handle.result()) as { exitCode?: number; stdout?: unknown; stderr?: unknown };
        return json({
          command,
          exitCode: result.exitCode ?? 0,
          stdout: String(result.stdout ?? "").slice(0, 2000),
          stderr: String(result.stderr ?? "").slice(0, 500),
        });
      }

      return json({ surface: "PUT/GET /fs?path=, GET /git?url=&dir=, POST /exec {command}", name });
    } catch (e) {
      return json({ error: String((e as Error)?.message ?? e).slice(0, 1000) }, 500);
    }
  },
} satisfies ExportedHandler<SpikeEnv>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
