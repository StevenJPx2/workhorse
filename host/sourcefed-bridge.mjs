// SourceFed → Workhorse bridge (M3d host side).
//
// Subscribes to the local SourceFed daemon's SSE event stream and forwards
// monitor events to the Workhorse worker's /webhooks/sourcefed endpoint so
// parked runs wake with feedback and monitor triggers fire. Runs under
// launchd (com.workhorse.sourcefed-bridge.plist).
//
// Monitor → ticket mapping: a monitor whose name starts with "ticket:<id>"
// routes events to that ticket; anything else is forwarded as a monitor
// frame (trigger path). The daemon's event kinds are mapped to Workhorse's
// ExternalEvent kinds.
//
// Config (env): SOURCEFED_DAEMON_URL (default http://127.0.0.1:18787),
// SOURCEFED_TARGET (json target, default {"kind":"host","id":"workhorse"}),
// WORKHORSE_WEBHOOK_URL (default https://workhorse-sandbox.stevenjpx2.workers.dev/webhooks/sourcefed),
// WORKHORSE_WEBHOOK_SECRET (required — read from ~/.config/sourcefed/worker-webhook-secret
// if not set).

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DAEMON = process.env.SOURCEFED_DAEMON_URL ?? "http://127.0.0.1:18787";
const TARGET = JSON.parse(process.env.SOURCEFED_TARGET ?? JSON.stringify({ kind: "host", id: "workhorse" }));
const WEBHOOK = process.env.WORKHORSE_WEBHOOK_URL ?? "https://workhorse-sandbox.stevenjpx2.workers.dev/webhooks/sourcefed";
const TICKETS_API = process.env.WORKHORSE_TICKETS_URL ?? "https://workhorse-sandbox.stevenjpx2.workers.dev/tickets";

function loadSecret() {
  if (process.env.WORKHORSE_WEBHOOK_SECRET) return process.env.WORKHORSE_WEBHOOK_SECRET;
  const p = join(homedir(), ".config", "sourcefed", "worker-webhook-secret");
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  throw new Error(`WORKHORSE_WEBHOOK_SECRET missing (looked at ${p})`);
}
const SECRET = loadSecret();

function loadMasterToken() {
  if (process.env.WORKHORSE_MASTER_TOKEN) return process.env.WORKHORSE_MASTER_TOKEN;
  const p = join(homedir(), ".config", "sourcefed", "worker-master-token");
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  return null;
}
const MASTER_TOKEN = loadMasterToken();

const targetB64 = Buffer.from(JSON.stringify(TARGET)).toString("base64");
const streamUrl = `${DAEMON}/events?target=${targetB64}`;

/** Daemon event kind → Workhorse ExternalEvent kind. */
function mapKind(kind) {
  switch (kind) {
    case "review":
    case "pr-review":
      return "pr-review";
    case "comment":
    case "review-comment":
    case "pr-comment":
      return "pr-comment";
    case "issue-comment":
      return "issue-comment";
    case "ci":
    case "ci-failed":
      return "ci-failed";
    default:
      return "status";
  }
}

/** Build the worker webhook frame from a daemon event + monitor. */
function toFrame(monitor, event) {
  const base = {
    kind: mapKind(event.kind),
    summary: event.summary ?? `${event.kind} on ${monitor?.detail ?? "monitored source"}`,
    deliveryId: event.id ?? `${event.kind}:${event.at}:${event.summary}`,
    receivedAt: event.at ?? new Date().toISOString(),
    detail: { monitor: monitor?.id ?? "", ...(event.detail ?? {}) },
  };
  const m = monitor?.name?.match(/^ticket:([a-z0-9]+)/i);
  if (m) return { ...base, ticketId: m[1] };
  return { ...base, kind: "monitor", monitor: { name: monitor?.name ?? "sourcefed", payload: { ...(event.detail ?? {}), summary: base.summary } } };
}

let connected = false;
async function forward(event) {
  try {
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sourcefed-secret": SECRET },
      body: JSON.stringify(event),
    });
    if (!res.ok) console.error(`[bridge] forward failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    else console.log(`[bridge] forwarded ${event.kind} (${event.ticketId ?? event.monitor?.name ?? "?"})`);
  } catch (e) {
    console.error(`[bridge] forward threw: ${e.message}`);
  }
}

/** Resolve a monitor record by id via the daemon's /rpc. */
async function resolveMonitor(id) {
  try {
    const res = await fetch(`${DAEMON}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: `bridge-${Date.now()}`, method: "monitor.status", params: { target: TARGET, id } }),
    });
    const body = await res.json();
    return body?.result?.monitor ?? null;
  } catch {
    return null;
  }
}

/** Parse an SSE data line into forwarded frames. */
async function handleData(raw) {
  if (!raw || raw === "[DONE]") return;
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.type === "subscribed" || msg.type === "heartbeat") return;
  if (msg.type === "event" && Array.isArray(msg.events)) {
    for (const rec of msg.events) {
      // rec = { id, monitorID, target, event } — monitor comes by id.
      const monitor = rec.monitorID ? await resolveMonitor(rec.monitorID) : null;
      await forward(toFrame(monitor, rec.event ?? {}));
    }
  }
}

/**
 * Sweep the worker's parked tickets and ensure each has a daemon monitor.
 * A ticket is parked when it is in-review (or implementing) and has an open
 * PR URL; the monitor name ticket:<id> routes its events back to the ticket
 * (the bridge's toFrame mapping). Skips tickets already covered, and skips
 * anything without a PR or without a master token.
 */
async function sweepMonitors() {
  if (!MASTER_TOKEN) return;
  const res = await fetch(`${TICKETS_API}`, {
    headers: { authorization: `Bearer ${MASTER_TOKEN}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`tickets ${res.status}`);
  const body = await res.json();
  // Parked = has an open PR and a live status (implementing while a revision
  // runs, or in-review parked on waitForEvent). The status query param on the
  // API is exact-match and the run moves between statuses, so fetch all and
  // filter here.
  const tickets = (body.tickets ?? []).filter(
    (t) => t && typeof t === "object" && (t.status === "in-review" || t.status === "implementing") && t.prUrl,
  );
  if (!tickets.length) return;

  const listRes = await fetch(`${DAEMON}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: `sweep-${Date.now()}`, method: "monitor.list", params: { target: TARGET } }),
  });
  const listBody = await listRes.json();
  const existing = new Set((listBody?.result?.monitors ?? []).map((m) => m.name));

  for (const t of tickets) {
    const name = `ticket:${t.id}`;
    if (existing.has(name)) continue;
    const pr = t.prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!pr) continue;
    const created = await fetch(`${DAEMON}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `sweep-${Date.now()}`, method: "monitor.create",
        params: { target: TARGET, name, sourceType: "github", repo: `${pr[1]}/${pr[2]}`, prNumber: Number(pr[3]) },
      }),
    });
    const cb = await created.json();
    if (cb?.result?.ok) console.log(`[bridge] sweep: created monitor ${name} for ${pr[1]}/${pr[2]}#${pr[3]}`);
    else console.warn(`[bridge] sweep: create failed for ${name}: ${cb?.error ?? JSON.stringify(cb).slice(0, 120)}`);
  }
}

async function run() {
  console.log(`[bridge] subscribing ${streamUrl}`);
  // Monitor sweeper: parked tickets (in-review, PR open) must ALWAYS have a
  // daemon monitor so feedback wakes them. The worker cannot reach the LAN
  // daemon, so the bridge self-heals coverage from the worker's own ticket
  // list. Runs every 60s, deduped against the daemon's monitor list.
  const sweeper = (async () => {
    for (;;) {
      try {
        await sweepMonitors();
      } catch (e) {
        console.error(`[bridge] sweep failed: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 60_000));
    }
  })();
  void sweeper;
  for (;;) {
    try {
      const res = await fetch(streamUrl, { headers: { accept: "text/event-stream" } });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      if (!connected) {
        connected = true;
        console.log("[bridge] connected");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line.startsWith("data:")) await handleData(line.slice(5).trim());
        }
      }
    } catch (e) {
      connected = false;
      console.error(`[bridge] stream error: ${e.message} — reconnecting in 5s`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

run();
