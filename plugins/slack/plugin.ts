// Slack source plugin: the fleet's conversational surface.
//
// Inbound (Events API → POST /webhooks/slack):
//   - `@workhorse …` mention anywhere → routed to the fleet chat agent,
//     which can file tickets (workhorse_file_ticket), report status, or
//     answer from fleet knowledge. The reply is posted in-thread; if the
//     agent filed a ticket, the thread is mapped to it (mirrors `pr:`).
//   - Replies in a mapped thread → steering for a LIVE run (appendSteer)
//     or a revision event for a PARKED in-review ticket (appendEvents +
//     wake) — same two-path model as PR feedback.
//
// Outbound: the onStatusChange hook posts meaningful transitions into the
// mapped thread — best-effort, silent when Slack isn't configured.
//
// Slack's webhook contract exceeds verify+parse (url_verification
// handshake, 3-second ack, retries), so this plugin uses the `handle`
// override: ack immediately, process in ctx.waitUntil.

import type { Core, Env, TicketRecord, WorkhorsePlugin } from "@workhorse/api";

/** Slack signature: v0=HMAC_SHA256(`v0:${ts}:${rawBody}`, signing secret). */
async function slackSigValid(secret: string, rawBody: string, ts: string, sig: string): Promise<boolean> {
  // Replay guard: reject signatures older than 5 minutes.
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${rawBody}`));
  const expected = "v0=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** Post a message into a Slack channel/thread. Best-effort. */
async function postMessage(
  env: Env,
  channel: string,
  text: string,
  threadTs?: string,
): Promise<void> {
  if (!env.SLACK_BOT_TOKEN) return;
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      text: text.slice(0, 3500),
      ...(threadTs ? { thread_ts: threadTs } : {}),
      unfurl_links: false,
    }),
  }).catch(() => {});
}

/**
 * Outbound status notification: post into the ticket's mapped Slack thread
 * (if any). Driven by the onStatusChange hook.
 */
async function notifyThread(env: Env, ticketId: string, text: string): Promise<void> {
  try {
    if (!env.SLACK_BOT_TOKEN) return;
    const raw = await env.TICKETS.get(`slack-thread:${ticketId}`);
    if (!raw) return;
    const { channel, threadTs } = JSON.parse(raw) as { channel: string; threadTs: string };
    await postMessage(env, channel, text, threadTs);
  } catch {
    /* notifications never fail the caller */
  }
}

interface SlackEvent {
  type: string;
  channel?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
}

/** Strip <@U123> mentions and Slack link markup from a message. */
function cleanText(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/g, "")
    .replace(/<(https?:\/\/[^|>]+)\|[^>]*>/g, "$1")
    .replace(/<(https?:\/\/[^>]+)>/g, "$1")
    .trim();
}

async function processEvent(env: Env, core: Core, e: SlackEvent): Promise<void> {
  const channel = e.channel;
  if (!channel || !e.ts) return;
  const threadTs = e.thread_ts ?? e.ts;
  const text = cleanText(e.text ?? "");
  if (!text) return;

  const mapped = await env.TICKETS.get(`slack:${channel}:${threadTs}`);
  // Unmapped threads only react to explicit @mentions (checked before the
  // dedupe write so a plain `message` twin can't burn the mention's key).
  if (!mapped && e.type !== "app_mention") return;
  // One user message arrives as BOTH app_mention and message events —
  // process each (channel, ts) exactly once.
  const dedupeKey = `slack-ev:${channel}:${e.ts}`;
  if (await env.TICKETS.get(dedupeKey)) return;
  await env.TICKETS.put(dedupeKey, "1", { expirationTtl: 3600 });

  // --- mapped thread: feedback for an existing ticket ---
  if (mapped) {
    const rec = await core.getTicket(mapped);
    if (!rec) return;
    if (["done", "terminated"].includes(rec.status)) {
      await postMessage(env, channel, `Ticket ${mapped} is ${rec.status} — nothing to steer.`, threadTs);
      return;
    }
    // Notification bus: thread replies on a live run are urgent (delivered
    // into the session next turn); parked tickets read at their wake.
    const active = ["queued", "planning", "implementing", "ready-for-review"];
    const urgent = active.includes(rec.status);
    await core.notify({
      ticketId: mapped,
      source: "slack",
      kind: "comment",
      body: text.slice(0, 4000),
      author: e.user,
      urgent,
    });
    if (!urgent) await core.wakeTicket(mapped);
    await postMessage(
      env,
      channel,
      urgent
        ? "Delivered into the live session — the agent sees it at its next turn."
        : "Queued — the agent reads it when it wakes for revision.",
      threadTs,
    );
    return;
  }

  // --- unmapped @mention: trigger syntax first, then the fleet chat agent ---
  // "@workhorse trigger <name> <input…>" fires a registered trigger with
  // the mention text as {{input}} (the slack-mention trigger source).
  const trig = text.match(/^trigger\s+([a-z][a-z0-9-]+)\s*([\s\S]*)$/i);
  if (trig) {
    const fired = await core.fireTrigger(trig[1].toLowerCase(), {
      input: trig[2].trim() || text,
      channel,
      user: e.user ?? "",
    });
    await postMessage(
      env,
      channel,
      fired.ok
        ? `Trigger \`${trig[1]}\` fired → ticket ${fired.ticket.id}. I'll post updates here.`
        : `Trigger \`${trig[1]}\` failed: ${fired.error}`,
      threadTs,
    );
    if (fired.ok) {
      await env.TICKETS.put(`slack:${channel}:${threadTs}`, fired.ticket.id);
      await env.TICKETS.put(`slack-thread:${fired.ticket.id}`, JSON.stringify({ channel, threadTs }));
    }
    return;
  }
  const r = await core.fleetChat([{ role: "user", content: text }]);
  const reply = r.ok ? r.reply : `Fleet agent unavailable: ${r.error}`;
  await postMessage(env, channel, reply, threadTs);
  // If the agent filed a ticket its reply contains the 8-hex id — map the
  // thread so subsequent replies steer/revise that ticket.
  const m = reply.match(/\b[Tt]icket ([0-9a-f]{8})\b/);
  if (m && (await core.getTicket(m[1]))) {
    await env.TICKETS.put(`slack:${channel}:${threadTs}`, m[1]);
    await env.TICKETS.put(`slack-thread:${m[1]}`, JSON.stringify({ channel, threadTs }));
  }
}

export const slackPlugin: WorkhorsePlugin = {
  id: "slack",

  triggers: [
    {
      kind: "slack-mention",
      describe: "@workhorse trigger <name> <input> in any channel the bot can read",
    },
  ],

  attachments: [
    {
      kind: "slack",
      label: "Slack thread",
      icon: "i-lucide-slack",
      match(input) {
        // https://<team>.slack.com/archives/C0123/p1712345678901234
        const m = input.trim().match(/slack\.com\/archives\/([A-Z0-9]+)\/p(\d{16})/);
        return m ? `${m[1]}:${m[2].slice(0, 10)}.${m[2].slice(10)}` : null;
      },
      async resolve(env, _core, ref) {
        if (!env.SLACK_BOT_TOKEN) throw new Error("Slack not configured");
        const [channel, ts] = ref.split(":");
        const r = await fetch(
          `https://slack.com/api/conversations.replies?channel=${channel}&ts=${ts}&limit=20`,
          { headers: { authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } },
        );
        const data = (await r.json()) as {
          ok: boolean;
          error?: string;
          messages?: Array<{ user?: string; text?: string }>;
        };
        if (!data.ok) throw new Error(`Slack fetch failed: ${data.error}`);
        const lines = (data.messages ?? [])
          .map((m) => `- ${m.user ?? "?"}: ${(m.text ?? "").slice(0, 400)}`)
          .join("\n");
        return {
          title: `Slack thread in ${channel}`,
          summary: `${data.messages?.length ?? 0} messages`,
          content: `Slack conversation (${channel} @ ${ts}):\n${lines.slice(0, 3500)}`,
        };
      },
    },
  ],

  webhook: {
    async verify(request, rawBody, env) {
      if (!env.SLACK_SIGNING_SECRET) return false;
      const ts = request.headers.get("x-slack-request-timestamp") ?? "";
      const sig = request.headers.get("x-slack-signature") ?? "";
      if (!ts || !sig) return false;
      return slackSigValid(env.SLACK_SIGNING_SECRET, rawBody, ts, sig);
    },

    async handle(request, payload, env, ctx, core) {
      const p = payload as Record<string, unknown>;
      // Handshake: echo the challenge.
      if (p.type === "url_verification") {
        return Response.json({ challenge: p.challenge });
      }
      if (p.type !== "event_callback") return Response.json({ ok: true });
      // Slack retries when the ack is slow; we ack fast, so a retry means the
      // first delivery is already processing — drop it.
      if (request.headers.get("x-slack-retry-num")) return Response.json({ ok: true });
      const e = p.event as SlackEvent | undefined;
      // Ignore the bot's own messages and non-user noise.
      if (!e || e.bot_id || !e.user) return Response.json({ ok: true });
      if (e.type !== "app_mention" && e.type !== "message") return Response.json({ ok: true });
      ctx.waitUntil(processEvent(env, core, e));
      return Response.json({ ok: true });
    },
  },

  hooks: {
    // Post meaningful status transitions into the ticket's mapped thread.
    async onStatusChange(env, _core, { ticketId, to, record }) {
      const notable: Partial<Record<TicketRecord["status"], string | undefined>> = {
        implementing: "🛠️ Implementing…",
        "ready-for-review": "🔍 Verifying the implementation…",
        "in-review": record.prUrl
          ? `📤 PR is up: ${record.prUrl} — review/merge there; replies here steer revisions.`
          : undefined,
        done: "✅ Done — PR merged.",
        errored: `❌ Errored: ${record.error ?? "unknown"}`,
        terminated: `⏹️ Terminated: ${record.error ?? "stopped"}`,
      };
      const msg = notable[to];
      if (msg) await notifyThread(env, ticketId, msg);
    },
  },
};
