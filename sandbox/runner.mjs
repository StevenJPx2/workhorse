#!/usr/bin/env node
/**
 * Workhorse SDK runner — replaces pi --mode rpc + FIFO + nohup.
 *
 * Runs as: node runner.mjs <dir> <prompt-file> [--tools <tools>] [--thinking <level>]
 *
 * Uses pi-coding-agent's programmatic SDK (createAgentSession + prompt).
 * Extensions are loaded from the standard location. Tool gating is done
 * by the engine (the runner just loads whatever extensions are installed).
 *
 * Outputs:
 *   <dir>/events.jsonl   — agent session events (append-only)
 *   <dir>/control.json   — stage control (written by submit_work)
 *   <dir>/analysis.md    — stage analysis (written by submit_work)
 *   <dir>/session.log    — stderr for debugging
 */

import { readFileSync, appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const promptFile = process.argv[3];
const flags = Object.fromEntries(
  process.argv.slice(4).reduce((acc, arg, i, arr) => {
    if (arg.startsWith("--")) acc.push([arg.slice(2), arr[i + 1] ?? ""]);
    return acc;
  }, []),
);

if (!dir || !promptFile) {
  console.error("usage: runner.mjs <dir> <prompt-file> [--tools <tools>] [--thinking <level>]");
  process.exit(1);
}

const prompt = readFileSync(promptFile, "utf8");

// Write events as JSONL (the engine tails this file).
function emit(event) {
  appendFileSync(join(dir, "events.jsonl"), JSON.stringify(event) + "\n");
}

try {
  // Dynamic import so the script works whether pi-coding-agent is installed
  // globally or in /opt/agent/node_modules.
  const {
    createAgentSession,
    discoverAndLoadExtensions,
    ExtensionRunner,
    wrapRegisteredTools,
  } = await import("@earendil-works/pi-coding-agent");

  // Load extensions from the standard location.
  const agentDir = process.env.PI_AGENT_DIR || "/opt/agent";
  const extDir = join(agentDir, "extensions");
  let extensionTools = [];
  try {
    const { extensions } = await discoverAndLoadExtensions({
      extensionDirs: [extDir],
      cwd: "/workspace/repo",
    });
    if (extensions.length > 0) {
      const runner = new ExtensionRunner(extensions);
      extensionTools = wrapRegisteredTools(runner.getTools(), { extensionRunner: runner });
    }
  } catch (e) {
    // Extensions are optional — proceed without them.
    emit({ type: "extension_load_error", error: String(e).slice(0, 300) });
  }

  // Create the session.
  const session = await createAgentSession({
    cwd: "/workspace/repo",
    agentDir,
    model: flags.model || undefined,
    thinkingLevel: flags.thinking || undefined,
  });

  // Subscribe to events → events.jsonl.
  session.subscribe((event) => {
    emit(event);
  });

  // Send the prompt and wait for completion.
  emit({ type: "agent_start", timestamp: new Date().toISOString() });
  await session.prompt(prompt);
  emit({ type: "agent_settled", timestamp: new Date().toISOString() });

  // Collect session stats.
  const stats = session.getSessionStats?.();
  if (stats) emit({ type: "session_stats", ...stats });

  await session.dispose?.();
  process.exit(0);
} catch (e) {
  emit({ type: "runner_error", error: String(e).slice(0, 500) });
  writeFileSync(join(dir, "session.log"), String(e) + "\n");
  process.exit(1);
}
