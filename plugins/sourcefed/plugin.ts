// SourceFed channel plugin: the host daemon's event bridge into the fleet.
//
// The daemon (host-side, systemd) owns the monitors — GitHub PR polling,
// Jira comment polling, agent health — and pushes what it sees here as
// DaemonEventFrames. The worker verifies the shared secret, then:
//   - ticket frames  → appendEvents + wakeTicket (parked runs wake with the
//     feedback in context, exactly like the github/jira webhook plugins)
//   - monitor frames → fireTrigger(name, payload) (a monitor firing files a
//     ticket from the trigger's template)
//
// Frames (JSON POST body, one or an array):
//   { ticketId, kind: "pr-comment"|"pr-review"|"issue-comment"|"ci-failed"|"status",
//     summary, actor?, detail? }
//   { kind: "monitor", monitor: { name, payload } }
//
// Auth: `X-SourceFed-Secret` header must equal the SOURCEFED_WEBHOOK_SECRET
// worker secret (constant-time comparison).

import type { Env, ExternalEvent, WorkhorsePlugin } from "@workhorse/api";
import { appendEvents, wakeTicket } from "@workhorse/events";
import { sourcefedTools } from "./tools";

/** One event frame from the host daemon. */
export interface SourcefedFrame {
  /** The ticket this event belongs to — absent for monitor/trigger frames. */
  ticketId?: string;
  /** Event kind (ticket frames) — "monitor" for trigger frames. */
  kind: "pr-comment" | "pr-review" | "issue-comment" | "ci-failed" | "status" | "monitor";
  /** Human-readable summary injected into the revision prompt. */
  summary: string;
  actor?: string;
  detail?: Record<string, string | number | boolean | null | undefined>;
  /** Monitor frames: the trigger name + payload for template interpolation. */
  monitor?: { name: string; payload: Record<string, unknown> };
  /** Daemon-generated idempotency key — a redelivered frame is skipped. */
  deliveryId?: string;
  receivedAt?: string;
}

const HEADER = "x-sourcefed-secret";

function hasSecret(env: Env): env is Env & { SOURCEFED_WEBHOOK_SECRET: string } {
  return typeof (env as { SOURCEFED_WEBHOOK_SECRET?: string }).SOURCEFED_WEBHOOK_SECRET === "string";
}

export const sourcefedPlugin: WorkhorsePlugin = {
  id: "sourcefed",
  tools: sourcefedTools,
  triggers: [
    {
      kind: "monitor",
      describe:
        "A host-side SourceFed monitor fired (GitHub PR state, Jira comment, agent health) — files a ticket from the trigger's template.",
    },
  ],
  webhook: {
    async verify(request, _rawBody, env) {
      if (!hasSecret(env)) return false;
      const presented = request.headers.get(HEADER);
      if (!presented) return false;
      // Constant-time compare (the auth package's safeEqual lives behind
      // @workhorse/auth; a byte-wise compare here keeps the plugin leaf).
      const a = new TextEncoder().encode(presented);
      const b = new TextEncoder().encode(env.SOURCEFED_WEBHOOK_SECRET);
      if (a.length !== b.length) return false;
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      return diff === 0;
    },
    // Bespoke contract: frames split into ticket events (append+wake) and
    // monitor firings (fireTrigger). The daemon needs a FAST ack — the whole
    // payload is queued via waitUntil and this returns immediately; frames
    // carry a deliveryId so a redelivery (ack lost) is skipped, not replayed.
    // fallow-ignore-next-line complexity
    async handle(request, payload, env, ctx, core) {
      const frames = Array.isArray(payload) ? (payload as SourcefedFrame[]) : ([payload] as SourcefedFrame[]);

      ctx.waitUntil(
        // fallow-ignore-next-line complexity
        (async () => {
          let events = 0;
          let fired = 0;
          for (const frame of frames) {
            const deliveryKey = frame.deliveryId ? `sf-delivery:${frame.deliveryId}` : null;
            if (deliveryKey) {
              // Sequential-redelivery dedup (the daemon retries after ITS
              // timeout, so concurrent duplicate deliveries are rare; KV
              // get/put is not atomic, so a concurrent pair could both pass
              // — accepted, and the effect is duplicate feedback/tickets).
              const seen = await env.TICKETS.get(deliveryKey);
              if (seen) continue; // redelivery — already processed
            }
            if (frame.kind === "monitor" && frame.monitor) {
              const r = await core.fireTrigger(frame.monitor.name, frame.monitor.payload as Record<string, string>);
              // Mark only when the firing actually landed: a failed trigger
              // must stay retryable (the daemon redelivers the same id).
              if (r.ok) {
                fired++;
                if (deliveryKey) await env.TICKETS.put(deliveryKey, "1", { expirationTtl: 86_400 }).catch(() => {});
              }
              continue;
            }
            if (frame.ticketId) {
              const ev: ExternalEvent = {
                ticketId: frame.ticketId,
                kind: frame.kind,
                summary: frame.summary,
                ...(frame.actor ? { actor: frame.actor } : {}),
                ...(frame.detail ? { detail: frame.detail } : {}),
                receivedAt: frame.receivedAt ?? new Date().toISOString(),
              };
              events++;
              await appendEvents(env, [ev]);
              await wakeTicket(env, frame.ticketId);
              if (deliveryKey) await env.TICKETS.put(deliveryKey, "1", { expirationTtl: 86_400 }).catch(() => {});
            }
          }
          console.log(`sourcefed: ${events} events, ${fired} trigger firings`);
        })(),
      );

      return Response.json({ ok: true, accepted: frames.length });
    },
  },
};
