// Spike core (variant A): the rules of core/src/lib.rs as plain TypeScript.
// Inputs come from the shell; effects go back to the shell. No I/O, no imports.

export type Stored = { seq: number; key: string; event: string; acked: boolean };

export type Input =
  | { type: "restore"; events: Stored[]; every_ms: number | null }
  | { type: "connect" }
  | { type: "publish"; key: string; event: string }
  | { type: "ack"; seq: number }
  | { type: "every"; interval_ms: number; now_ms: number }
  | { type: "tick"; now_ms: number };

export type Reply =
  | { status: "published"; seq: number }
  | { status: "duplicate" }
  | { status: "acked"; seq: number }
  | { status: "unknown_seq"; seq: number }
  | { status: "scheduled" }
  | { status: "restored"; unacked: number; remembered: number }
  | { status: "connected"; pending: number }
  | { status: "ticked" };

export type Effect =
  | { type: "persist"; seq: number; key: string; event: string }
  | { type: "mark_acked"; seq: number }
  | { type: "deliver"; seq: number; key: string; event: string }
  | { type: "save_task"; interval_ms: number }
  | { type: "set_alarm"; at_ms: number }
  | { type: "reply"; result: Reply };

export class Mailbox {
  private nextSeq = 0;
  private remembered = new Set<string>();
  private unacked = new Map<number, { key: string; event: string }>();
  private everyMs: number | null = null;
  private ticks = 0;

  handle(input: Input): Effect[] {
    switch (input.type) {
      case "restore":
        return this.restore(input.events, input.every_ms);
      case "connect":
        return this.connect();
      case "publish":
        return this.publish(input.key, input.event);
      case "ack":
        return this.ack(input.seq);
      case "every":
        this.everyMs = input.interval_ms;
        return [
          { type: "save_task", interval_ms: input.interval_ms },
          { type: "set_alarm", at_ms: input.now_ms + input.interval_ms },
          { type: "reply", result: { status: "scheduled" } },
        ];
      case "tick":
        return this.tick(input.now_ms);
      default:
        return unreachable(input);
    }
  }

  private restore(events: Stored[], everyMs: number | null): Effect[] {
    this.nextSeq = 0;
    this.remembered = new Set();
    this.unacked = new Map();
    this.ticks = 0;
    this.everyMs = everyMs;
    for (const stored of events) {
      this.nextSeq = Math.max(this.nextSeq, stored.seq);
      this.remembered.add(stored.key);
      if (stored.key.startsWith("tick:")) this.ticks += 1;
      if (!stored.acked) this.unacked.set(stored.seq, { key: stored.key, event: stored.event });
    }
    const result: Reply = {
      status: "restored",
      unacked: this.unacked.size,
      remembered: this.remembered.size,
    };
    return [{ type: "reply", result }];
  }

  private connect(): Effect[] {
    // Map keeps insertion order; sort to match the Rust BTreeMap's seq order.
    const out: Effect[] = [...this.unacked]
      .sort(([a], [b]) => a - b)
      .map(([seq, { key, event }]) => ({ type: "deliver", seq, key, event }));
    out.push({ type: "reply", result: { status: "connected", pending: this.unacked.size } });
    return out;
  }

  private publish(key: string, event: string): Effect[] {
    if (this.remembered.has(key)) return [{ type: "reply", result: { status: "duplicate" } }];
    this.remembered.add(key);
    this.nextSeq += 1;
    const seq = this.nextSeq;
    this.unacked.set(seq, { key, event });
    return [
      { type: "persist", seq, key, event },
      { type: "deliver", seq, key, event },
      { type: "reply", result: { status: "published", seq } },
    ];
  }

  private ack(seq: number): Effect[] {
    if (!this.unacked.delete(seq)) return [{ type: "reply", result: { status: "unknown_seq", seq } }];
    return [
      { type: "mark_acked", seq },
      { type: "reply", result: { status: "acked", seq } },
    ];
  }

  private tick(nowMs: number): Effect[] {
    if (this.everyMs === null) return [{ type: "reply", result: { status: "ticked" } }];
    this.ticks += 1;
    const out = this.publish(`tick:${this.ticks}`, `{"at_ms":${nowMs}}`).filter(
      (effect) => effect.type !== "reply",
    );
    out.push({ type: "set_alarm", at_ms: nowMs + this.everyMs });
    out.push({ type: "reply", result: { status: "ticked" } });
    return out;
  }
}

function unreachable(input: never): never {
  throw new Error(`unhandled input ${JSON.stringify(input)}`);
}
