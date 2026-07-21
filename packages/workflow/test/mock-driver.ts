// In-memory Driver: a tiny fake sandbox. Files are a map; exec handles the
// exact command shapes the engine emits (mkdir/kill/launch/poll).

import type { Driver, ExecResult } from "../src/driver";

export class MockDriver implements Driver {
  files = new Map<string, string>();
  /** pids the fake sandbox considers alive. */
  alive = new Set<number>();
  nextPid = 1000;
  launches: Array<{ command: string; pid: number }> = [];
  execLog: string[] = [];

  async exec(command: string): Promise<ExecResult> {
    this.execLog.push(command);
    const ok = (stdout = ""): ExecResult => ({ exitCode: 0, stdout, stderr: "" });

    if (command.startsWith("mkdir")) return ok();
    if (command.includes("kill -9")) {
      const pid = Number(command.match(/kill -9 (\d+)/)?.[1]);
      this.alive.delete(pid);
      return ok();
    }
    if (command.includes("kill -0")) {
      const pid = Number(command.match(/kill -0 (\d+)/)?.[1]);
      // Poll loops exit immediately in tests.
      return ok(this.alive.has(pid) ? "ALIVE" : "DEAD");
    }
    if (command.includes("nohup")) {
      const pid = this.nextPid++;
      this.alive.add(pid);
      this.launches.push({ command, pid });
      return ok(`PID=${pid}`);
    }
    if (command.startsWith("for i in $(seq")) {
      // Burst hold: return immediately (pid liveness checked separately).
      return ok();
    }
    return ok();
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  /** Test helper: the fake session finishes, writing its artifacts. */
  finishSession(dir: string, control: Record<string, unknown> | string, analysis = "analysis text"): void {
    const launch = this.launches.at(-1);
    if (launch) this.alive.delete(launch.pid);
    if (typeof control === "string") this.files.set(`${dir}/control.json`, control);
    else this.files.set(`${dir}/control.json`, JSON.stringify(control));
    this.files.set(`${dir}/analysis.md`, analysis);
  }

  /** Test helper: session dies with no artifacts, leaving a log tail. */
  crashSession(dir: string, logTail: string): void {
    const launch = this.launches.at(-1);
    if (launch) this.alive.delete(launch.pid);
    this.files.set(`${dir}/session.log`, logTail);
  }
}
