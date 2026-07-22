// In-memory Driver: a tiny fake sandbox speaking the engine's exact
// command shapes — pi --mode rpc launch via FIFO, command sends, kills.

import type { Driver, ExecResult } from "../src/driver";

export class MockDriver implements Driver {
  files = new Map<string, string>();
  alive = new Set<number>();
  nextPid = 1000;
  launches: Array<{ command: string; pid: number; dir: string }> = [];
  commands = new Map<string, Array<Record<string, unknown>>>();
  execLog: string[] = [];

  async exec(command: string): Promise<ExecResult> {
    this.execLog.push(command);
    const ok = (stdout = ""): ExecResult => ({ exitCode: 0, stdout, stderr: "" });

    if (command.startsWith("mkdir") || command.startsWith("sleep")) return ok();

    // Launcher: bash <dir>/launcher.sh
    if (command.includes("launcher.sh")) {
      const scriptContent = this.files.get(command.replace("bash ", "")) ?? "";
      const dirMatch = scriptContent.match(/mkfifo (\S+)\/cmd\.fifo/);
      const dir = dirMatch?.[1] ?? "/tmp/unknown";
      const pid = this.nextPid++;
      this.alive.add(pid);
      // Store the launcher script content as the command so tests can
      // check for flags (--tools, --model, etc.) in the script.
      this.launches.push({ command: scriptContent, pid, dir });
      this.files.set(`${dir}/pi.pid`, String(pid));
      return ok("STARTED");
    }

    // ps aux | grep "[p]i.*rpc" — find pi PID
    if (command.includes("ps aux")) {
      const lastLaunch = this.launches[this.launches.length - 1];
      if (lastLaunch && this.alive.has(lastLaunch.pid)) {
        if (command.includes("awk")) return ok(String(lastLaunch.pid));
        return ok(`root ${lastLaunch.pid} 0.0 0.1 pi --mode rpc`);
      }
      return ok(command.includes("awk") ? "0" : "");
    }

    // Command send: printf ... >> cmd.in
    if (command.includes(">>") && command.includes("cmd.in")) {
      const dirMatch = command.match(/>> (\S+)\/cmd\.in/);
      const dir = dirMatch?.[1];
      if (dir) {
        const jsonMatch = command.match(/printf '%s\\n' '(.+)' >>/s);
        if (jsonMatch) {
          try {
            const cmd = JSON.parse(jsonMatch[1].replace(/'\\''/g, "'"));
            const list = this.commands.get(dir) ?? [];
            list.push(cmd);
            this.commands.set(dir, list);
            if (cmd.type === "get_session_stats") {
              this.emit(dir, {
                type: "session_stats",
                tokens: { input: 1000, output: 200, total: 1200 },
                cost: 0.05,
                contextUsage: { percent: 12 },
              });
            }
          } catch { /* ignore */ }
        }
      }
      return ok("SENT");
    }

    // Kill
    if (command.includes("kill -9") || command.match(/\bkill \d+/)) {
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

  emit(dir: string, event: Record<string, unknown>): void {
    const key = `${dir}/events.jsonl`;
    const existing = this.files.get(key) ?? "";
    this.files.set(key, existing + JSON.stringify(event) + "\n");
  }

  finishSession(dir: string, control: Record<string, unknown>, analysis = "done"): void {
    this.files.set(`${dir}/control.json`, JSON.stringify(control));
    this.files.set(`${dir}/analysis.md`, analysis);
    this.emit(dir, { type: "agent_settled", timestamp: new Date().toISOString() });
    for (const l of this.launches) {
      if (l.dir === dir) this.alive.delete(l.pid);
    }
  }

  crashSession(dir: string, error: string): void {
    this.files.set(`${dir}/session.log`, error);
    for (const l of this.launches) {
      if (l.dir === dir) this.alive.delete(l.pid);
    }
  }
}
