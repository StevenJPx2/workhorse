// In-memory Driver: a tiny fake sandbox speaking the engine's exact
// command shapes — SDK session launch (node runner.mjs), event tailing, kills.

import type { Driver, ExecResult } from "../src/driver";

export class MockDriver implements Driver {
  files = new Map<string, string>();
  /** pids the fake sandbox considers alive. */
  alive = new Set<number>();
  nextPid = 1000;
  launches: Array<{ command: string; pid: number; dir: string }> = [];
  /** commands written to each session. */
  commands = new Map<string, Array<Record<string, unknown>>>();
  execLog: string[] = [];

  async exec(command: string): Promise<ExecResult> {
    this.execLog.push(command);
    const ok = (stdout = ""): ExecResult => ({ exitCode: 0, stdout, stderr: "" });

    if (command.startsWith("mkdir") || command.startsWith("sleep")) return ok();

    // ps aux | grep — find runner.mjs PID (must check BEFORE the runner.mjs check).
    if (command.includes("ps aux")) {
      const lastLaunch = this.launches[this.launches.length - 1];
      if (lastLaunch && this.alive.has(lastLaunch.pid)) {
        // If awk is in the pipeline, return just the PID number.
        if (command.includes("awk")) return ok(String(lastLaunch.pid));
        return ok(`root ${lastLaunch.pid} 0.0 0.1 node /opt/agent/runner.mjs`);
      }
      return ok(command.includes("awk") ? "0" : "");
    }

    // SDK launch: node /opt/agent/runner.mjs <dir> <prompt> ...
    if (command.includes("runner.mjs")) {
      const dirMatch = command.match(/runner\.mjs (\S+)/);
      const dir = dirMatch?.[1] ?? "/tmp/unknown";
      const pid = this.nextPid++;
      this.alive.add(pid);
      this.launches.push({ command, pid, dir });
      // The SDK runner emits agent_start immediately.
      this.emit(dir, { type: "agent_start", timestamp: new Date().toISOString() });
      return ok();
    }

    // ps aux | grep runner.mjs — find the running node process PID.
    if (command.includes("runner.mjs") && command.includes("grep")) {
      const lastLaunch = this.launches[this.launches.length - 1];
      return lastLaunch ? ok(String(lastLaunch.pid)) : ok("0");
    }

    // Kill: kill <pid> / kill -9 <pid>
    if (command.includes("kill -9") || command.match(/kill \d+/)) {
      for (const m of command.matchAll(/kill(?: -9)? (\d+)/g)) this.alive.delete(Number(m[1]));
      return ok();
    }
    if (command.includes("kill -0")) {
      const pid = Number(command.match(/kill -0 (\d+)/)?.[1]);
      return ok(this.alive.has(pid) ? "alive" : "dead");
    }

    return ok();
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  // ---- Test helpers ----

  /** Simulate the SDK runner writing an event to events.jsonl. */
  emit(dir: string, event: Record<string, unknown>): void {
    const key = `${dir}/events.jsonl`;
    const existing = this.files.get(key) ?? "";
    this.files.set(key, existing + JSON.stringify(event) + "\n");
  }

  /** Finish a session: write control + analysis, emit agent_settled, kill PID. */
  finishSession(
    dir: string,
    control: Record<string, unknown>,
    analysis = "done",
  ): void {
    this.files.set(`${dir}/control.json`, JSON.stringify(control));
    this.files.set(`${dir}/analysis.md`, analysis);
    this.emit(dir, { type: "agent_settled", timestamp: new Date().toISOString() });
    // Mark all PIDs for this dir as dead.
    for (const l of this.launches) {
      if (l.dir === dir) this.alive.delete(l.pid);
    }
  }

  /** Crash a session: write to session.log, kill PID, no control.json. */
  crashSession(dir: string, error: string): void {
    this.files.set(`${dir}/session.log`, error);
    for (const l of this.launches) {
      if (l.dir === dir) this.alive.delete(l.pid);
    }
  }
}
