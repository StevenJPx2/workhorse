// ntfy plugin: push notifications for the transitions an operator actually
// waits on. Pure hook consumer — the notification twin of Slack's outbound
// half with zero inbound surface. Silent when NTFY_URL/NTFY_TOPIC unset.

import type { Env, WorkhorsePlugin } from "@workhorse/api";

type Priority = "min" | "low" | "default" | "high" | "urgent";

async function push(
  env: Env,
  title: string,
  body: string,
  opts: { priority?: Priority; tags?: string[]; click?: string } = {},
): Promise<void> {
  try {
    if (!env.NTFY_URL || !env.NTFY_TOPIC) return;
    const headers: Record<string, string> = {
      title,
      priority: opts.priority ?? "default",
    };
    if (opts.tags?.length) headers.tags = opts.tags.join(",");
    if (opts.click) headers.click = opts.click;
    if (env.NTFY_TOKEN) headers.authorization = `Bearer ${env.NTFY_TOKEN}`;
    await fetch(`${env.NTFY_URL.replace(/\/$/, "")}/${env.NTFY_TOPIC}`, {
      method: "POST",
      headers,
      body,
    });
  } catch {
    /* notifications never fail the caller */
  }
}

export const ntfyPlugin: WorkhorsePlugin = {
  id: "ntfy",

  hooks: {
    async onStatusChange(env, _core, { ticketId, to, record }) {
      const label = `${ticketId} · ${record.title ?? ""}`.trim();
      switch (to) {
        case "in-review":
          await push(env, `PR up — ${label}`, record.prUrl ?? "review ready", {
            priority: "default",
            tags: ["outbox_tray"],
            click: record.prUrl,
          });
          break;
        case "done":
          await push(env, `Done — ${label}`, "PR merged.", {
            priority: "low",
            tags: ["white_check_mark"],
            click: record.prUrl,
          });
          break;
        case "errored":
          await push(env, `Errored — ${label}`, record.error ?? "unknown error", {
            priority: "high",
            tags: ["rotating_light"],
          });
          break;
        case "terminated":
          await push(env, `Terminated — ${label}`, record.error ?? "stopped", {
            priority: "low",
            tags: ["octagonal_sign"],
          });
          break;
        default:
          // planning/implementing/ready-for-review are routine — stay quiet.
          break;
      }
    },

    async onTraceArchived(env, _core, { ticketId, runId, kind, escalations }) {
      // Escalations are the "something needed intervention" signal.
      if (!escalations?.length) return;
      const lines = escalations
        .map((e) => `${e.trigger}${e.stage ? ` @ ${e.stage}` : ""}${e.toModel ? ` → ${e.toModel}` : ""}`)
        .join("\n");
      await push(env, `Escalations — ${ticketId} (${kind} run)`, `${runId}\n${lines}`, {
        priority: "low",
        tags: ["warning"],
      });
    },
  },
};
