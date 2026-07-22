// Fleet chat, attachment matching, and the phase-0 debug endpoints.

import { getSandbox } from "@cloudflare/sandbox";
import { runFleetChat } from "../chat";
import { json, type Route } from "../router";

export const miscRoutes: Route[] = [
  {
    // Fleet chat: a Pi session in a dedicated sandbox with workhorse tools.
    method: "POST",
    path: "/chat",
    auth: "master",
    async handler({ request, env, url }) {
      const { messages } = (await request.json()) as {
        messages: Array<{ role: string; content: string }>;
      };
      const r = await runFleetChat(env, url.origin, messages);
      if (!r.ok) return json({ error: r.error }, r.status);
      return json({ reply: r.reply });
    },
  },
  {
    // Attachment surface: match a pasted ref against plugin providers.
    method: "POST",
    path: "/attachments/match",
    auth: "master",
    async handler({ request }) {
      const { input } = (await request.json().catch(() => ({}))) as { input?: string };
      if (!input?.trim()) return json({ match: null });
      const { attachmentProviders } = await import("../plugins");
      for (const [kind, p] of attachmentProviders()) {
        const ref = p.match(input.trim());
        if (ref) return json({ match: { kind, ref, label: p.label, icon: p.icon } });
      }
      return json({ match: null });
    },
  },

  // ---- phase-0 debug endpoints (kept for ops) ----
  {
    method: "*",
    path: "/env",
    auth: "master",
    async handler({ env }) {
      const sandbox = getSandbox(env.Sandbox, "phase0", { sleepAfter: "2m" });
      const result = await sandbox.exec(
        "echo node=$(node --version 2>/dev/null); echo git=$(git --version 2>/dev/null); uname -a",
      );
      return json({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
    },
  },
  {
    method: "POST",
    path: "/exec",
    auth: "master",
    async handler({ request, env }) {
      const { cmd, sandbox: sid } = (await request.json()) as { cmd: string; sandbox?: string };
      const sandbox = getSandbox(env.Sandbox, sid ?? "phase0", { sleepAfter: "2m" });
      const result = await sandbox.exec(cmd, { timeout: 300_000 });
      return json({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr });
    },
  },
];
