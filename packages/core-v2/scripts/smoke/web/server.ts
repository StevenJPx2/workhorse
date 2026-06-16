#!/usr/bin/env bun
/**
 * Interactive smoke-test runner.
 *
 * Serves a small HTML page that runs each smoke script as a subprocess and
 * streams its combined stdout + stderr back to the browser over SSE.
 *
 *   bun scripts/smoke/web/server.ts            # from packages/core-v2
 *   bun run smoke:web                          # same, via package.json
 *
 * Then open http://localhost:4321 in a browser.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const smokeDir = join(here, "..");
const pkgRoot = join(smokeDir, "..", "..");
const port = Number(process.env.PORT ?? 4321);

/** The smoke scripts this page can run, in display order. */
const SMOKES: Record<string, { file: string; label: string; blurb: string }> = {
  config: {
    blurb: "Validate the in-code example config against the Zod schema.",
    file: "config.ts",
    label: "Config",
  },
  script: {
    blurb: "ScriptService: scan → catalog → write → run → help.",
    file: "script.ts",
    label: "Script",
  },
  skill: {
    blurb:
      "SkillService: discover → diagnose → catalog → load → read → scripts.",
    file: "skill.ts",
    label: "Skill",
  },
  services: {
    blurb: "Compose Script ∪ Skill over one bus, standalone.",
    file: "services.ts",
    label: "Services (all)",
  },
};

function sse(
  controller: ReadableStreamDefaultController,
  event: string,
  data: string,
): void {
  const payload = data
    .split("\n")
    .map((line) => `data: ${line}`)
    .join("\n");
  controller.enqueue(
    new TextEncoder().encode(`event: ${event}\n${payload}\n\n`),
  );
}

function runSmoke(name: string): Response {
  const smoke = SMOKES[name];

  if (!smoke) {
    return new Response("unknown smoke", { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const child = spawn("bun", [join(smokeDir, smoke.file)], {
        cwd: pkgRoot,
        env: { ...process.env, FORCE_COLOR: "1" },
      });

      const onChunk = (buf: Buffer): void =>
        sse(controller, "out", buf.toString());

      child.stdout.on("data", onChunk);
      child.stderr.on("data", onChunk);

      child.on("error", (err) => {
        sse(controller, "out", `\n[spawn error] ${err.message}\n`);
        sse(controller, "done", "1");
        controller.close();
      });

      child.on("close", (code) => {
        sse(controller, "done", String(code ?? 0));
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      connection: "keep-alive",
      "content-type": "text/event-stream",
    },
  });
}

const html = readFileSync(join(here, "index.html"), "utf8").replace(
  "/*__SMOKES__*/",
  JSON.stringify(SMOKES),
);

const server = Bun.serve({
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname.startsWith("/run/")) {
      return runSmoke(url.pathname.slice("/run/".length));
    }

    return new Response("not found", { status: 404 });
  },
  port,
});

process.stderr.write(
  `\nSmoke runner ready → http://localhost:${server.port}\n`,
);
