// Spike 6: can a Durable Object in plain workerd hold a link to another workerd?
// Each daemon runs this worker. The dialer's Link object opens a WebSocket over TLS to the peer;
// the peer forwards the upgrade to its own Link object, which accepts it. Calls cross both ways.

const HEARTBEAT_MS = Number(globalThis.HEARTBEAT_MS ?? 5000);
const DEADLINE_MS = 2000;
const BACKOFF_MS = [100, 250, 500, 1000, 2000];

export class Link {
  constructor(state, env) {
    this.env = env;
    this.ws = undefined;
    this.pending = new Map();
    this.nextId = 1;
    this.events = [];
    this.reconnects = 0;
    this.lastPong = 0;
    this.born = Date.now();
    this.log("constructed");
  }

  log(event) {
    this.events.push(`${new Date().toISOString()} ${this.env.ROLE} ${event}`);
    if (this.events.length > 200) this.events.shift();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const pair = new WebSocketPair();
      pair[1].accept();
      this.attach(pair[1], "accepted");
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname === "/start") {
      if (this.ws === undefined) await this.dial();
      return Response.json(this.status());
    }

    if (url.pathname === "/call") {
      const started = Date.now();
      const result = await this.call(url.searchParams.get("msg") ?? "");
      return Response.json({ result, ms: Date.now() - started });
    }

    return Response.json(this.status());
  }

  status() {
    return {
      role: this.env.ROLE,
      connected: this.ws !== undefined,
      reconnects: this.reconnects,
      aliveSeconds: Math.round((Date.now() - this.born) / 1000),
      events: this.events.slice(-12),
    };
  }

  async dial() {
    try {
      const response = await this.env.PEER.fetch("https://peer.workhorse/ws", {
        headers: { Upgrade: "websocket" },
      });
      const ws = response.webSocket;
      if (!ws) throw new Error(`no websocket, status ${response.status}`);
      ws.accept();
      this.attach(ws, "dialed");
      this.attempt = 0;
    } catch (error) {
      this.log(`dial failed: ${error}`);
      this.retry();
    }
  }

  retry() {
    if (this.env.ROLE !== "laptop") return;
    const wait = BACKOFF_MS[Math.min(this.attempt ?? 0, BACKOFF_MS.length - 1)];
    this.attempt = (this.attempt ?? 0) + 1;
    setTimeout(() => {
      this.reconnects += 1;
      void this.dial();
    }, wait);
  }

  attach(ws, how) {
    this.ws = ws;
    this.lastPong = Date.now();
    this.log(how);
    ws.addEventListener("message", (event) => this.receive(JSON.parse(event.data)));
    const lost = (why) => {
      if (this.ws !== ws) return;
      this.ws = undefined;
      clearInterval(this.beat);
      this.log(`lost: ${why}`);
      for (const [, settle] of this.pending) settle("unavailable");
      this.pending.clear();
      this.retry();
    };
    ws.addEventListener("close", (event) => lost(`close ${event.code}`));
    ws.addEventListener("error", (event) => lost(`error ${event.message ?? ""}`));
    clearInterval(this.beat);
    this.beat = setInterval(() => {
      if (Date.now() - this.lastPong > HEARTBEAT_MS * 3) {
        lost("heartbeat missed");
        try {
          ws.close(1001, "heartbeat missed");
        } catch {}
        return;
      }
      ws.send(JSON.stringify({ ping: Date.now() }));
    }, HEARTBEAT_MS);
  }

  receive(message) {
    if (message.ping !== undefined) return this.ws?.send(JSON.stringify({ pong: message.ping }));
    if (message.pong !== undefined) return void (this.lastPong = Date.now());
    if (message.call !== undefined)
      return this.ws?.send(JSON.stringify({ id: message.id, result: `${this.env.ROLE} got ${message.call}` }));
    const settle = this.pending.get(message.id);
    this.pending.delete(message.id);
    settle?.(message.result);
  }

  call(msg) {
    if (this.ws === undefined) return Promise.resolve("unavailable");
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve("unavailable (deadline)");
      }, DEADLINE_MS);
      this.pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      this.ws.send(JSON.stringify({ id, call: msg }));
    });
  }
}

export default {
  fetch(request, env) {
    return env.LINK.get(env.LINK.idFromName("peer")).fetch(request);
  },
};
