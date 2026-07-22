// In-memory Driver: a tiny fake sandbox speaking the engine's exact
// command shapes — RPC session launch (fifo + holder + pi), verb sends,
// event tailing, kills.

import type { Driver, ExecResult } from "../src/driver";

export class MockDriver implements Driver {
  files = new Map<string, string>();
  /** pids the fake sandbox considers alive. */
  alive = new Set<number>();
  nextPid = 1000;
  launches: Array<{ command: string; pid: number; holderPid: number; dir: string }> = [];
  /** RPC commands written to each session's fifo. */
  rpcSent = new Map<string, Array<Record<string, unknown>>>();
  execLog: string[] = [];

  async exec(command: string): Promise<ExecResult> {
    this.execLog.push(command);
    const ok = (stdout = ""): ExecResult => ({ exitCode: 0, stdout, stderr: "" });

    if (command.startsWith("mkdir") || command.startsWith("sleep")) return ok();

    // RPC launch: mkfifo && holder && pi --mode rpc && prompt && echo pids
    if (command.includes("--mode rpc") && command.includes("mkfifo")) {
      const dir = command.match(/mkfifo (\S+)\/cmd\.fifo/)![1];
      const pid = this.nextPid++;
      const holderPid = this.nextPid++;
      this.alive.add(pid).add(holderPid);
      this.launches.push({ command, pid, holderPid, dir });
      this.files.set(`${dir}/cmd.fifo`, ""); // fifo exists
      // The initial prompt command lands in the fifo log.
      const prompt = this.files.get(`${dir}/prompt.md`) ?? "";
      this.push(dir, { type: "prompt", message: prompt });
      return ok(`PI=${pid} HOLDER=${holderPid}`);
    }

    // Verb send: [ -p fifo ] && printf '%s\n' '<json>' > fifo && echo SENT
    if (command.includes("cmd.fifo ] && printf")) {
      const dir = command.match(/\[ -p (\S+)\/cmd\.fifo/)![1];
      if (!this.files.has(`${dir}/cmd.fifo`)) return ok("NOFIFO");
      const json = command.match(/printf '%s\\n' '(.+)' > /s)![1].replace(/'\\''/g, "'");
      this.push(dir, JSON.parse(json));
      return ok("SENT");
    }

    // Event tail: tail -c +N <dir>/events.jsonl
    if (command.includes("tail -c +")) {
      const m = command.match(/tail -c \+(\d+) (\S+)\/events\.jsonl/)!;
      const content = this.files.get(`${m[2]}/events.jsonl`) ?? "";
      return ok(content.slice(Number(m[1]) - 1));
    }

    // Burst hold: grep for settled / kill -0 loop — return immediately.
    if (command.startsWith("for i in $(seq")) return ok();

    if (command.includes("kill -9")) {
      for (const m of command.matchAll(/kill -9 (\d+)/g)) this.alive.delete(Number(m[1]));
      const fifo = command.match(/rm -f (\S+)\/cmd\.fifo/)?.[1];
      if (fifo) this.files.delete(`${fifo}/cmd.fifo`);
      return ok();
    }
    if (command.includes("kill -0")) {
      const pid = Number(command.match(/kill -0 (\d+)/)?.[1]);
      return ok(this.alive.has(pid) ? "ALIVE" : "DEAD");
    }
    return ok();
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  private push(dir: string, cmd: Record<string, unknown>): void {
    const list = this.rpcSent.get(dir) ?? [];
    list.push(cmd);
    this.rpcSent.set(dir, list);
    // Command responses echo into events.jsonl like the real session.
    if (cmd.type === "get_session_stats") {
      this.emit(dir, {
        type: "response",
        command: "get_session_stats",
        success: true,
        data: {
          tokens: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0, total: 1200 },
          cost: 0.05,
          contextUsage: { percent: 12 },
        },
      });
    }
  }

  /** Test helper: append an event line to a session's events.jsonl. */
  emit(dir: string, event: Record<string, unknown>): void {
    const prev = this.files.get(`${dir}/events.jsonl`) ?? "";
    this.files.set(`${dir}/events.jsonl`, prev + JSON.stringify(event) + "\n");
  }

  /** Test helper: the fake session finishes — artifacts + settled + exit. */
  finishSession(dir: string, control: Record<string, unknown> | string, analysis = "analysis text"): void {
    const launch = this.launches.findLast((l) => l.dir === dir) ?? this.launches.at(-1);
    if (launch) {
      this.alive.delete(launch.pid);
      this.alive.delete(launch.holderPid);
    }
    if (typeof control === "string") this.files.set(`${dir}/control.json`, control);
    else this.files.set(`${dir}/control.json`, JSON.stringify(control));
    this.files.set(`${dir}/analysis.md`, analysis);
    this.emit(dir, { type: "agent_settled" });
  }

  /** Test helper: session dies with no artifacts, leaving a log tail. */
  crashSession(dir: string, logTail: string): void {
    const launch = this.launches.findLast((l) => l.dir === dir) ?? this.launches.at(-1);
    if (launch) {
      this.alive.delete(launch.pid);
      this.alive.delete(launch.holderPid);
    }
    this.files.set(`${dir}/session.log`, logTail);
  }
}
