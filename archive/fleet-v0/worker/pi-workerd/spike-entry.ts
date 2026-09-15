// fallow-ignore-file unused-file
// C1 spike, phase 2: full pi session with the real opencode-go model —
// verifies the model plane + tool_choice behavior inside workerd.

import { createAgentSession } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.js";
import { ModelRuntime } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.js";
import { SessionManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js";
import { SettingsManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/settings-manager.js";
import { InMemoryCredentialStore } from "../node_modules/@earendil-works/pi-ai/dist/auth/credential-store.js";
import { Type } from "typebox";

export default {
  // Dev-only spike route: never deploy without the SPIKE_KEY gate below.
  // fallow-ignore-next-line complexity
  async fetch(request: Request, env: { SPIKE_KEY?: string }): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/model") return new Response("not found", { status: 404 });
    // Public reach would burn model quota for anyone; require the key.
    if (!env.SPIKE_KEY || request.headers.get("authorization") !== `Bearer ${env.SPIKE_KEY}`) {
      return new Response("unauthorized", { status: 401 });
    }

    const credentials = new InMemoryCredentialStore();
    const modelRuntime = await ModelRuntime.create({ credentials });
    await modelRuntime.setRuntimeApiKey("opencode-go", process.env.OPENCODE_API_KEY ?? "");
    const model = modelRuntime.getModel("opencode-go", "deepseek-v4-flash");
    if (!model) return Response.json({ error: "model not found in catalog" }, { status: 500 });

        const { session } = await createAgentSession({
      model,
      modelRuntime,
      sessionManager: SessionManager.inMemory(),
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
      thinkingLevel: "off",
      tools: ["ping"],
      noTools: "builtin",
      customTools: [
        {
          name: "ping",
          label: "Ping",
          description: "Reply pong",
          parameters: Type.Object({}),
          execute: async () => ({ content: [{ type: "text", text: "pong" }], details: {} }),
        } as never,
      ],
    });

    let settled = false;
    let toolCall: string | undefined;
    let toolResult: string | undefined;
    let text = "";
    const events: string[] = [];
    // fallow-ignore-next-line complexity
    session.subscribe((event: { type: string; toolName?: string; result?: unknown; assistantMessageEvent?: { type?: string; delta?: string } }) => {
      events.push(event.type);
      if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
        text += event.assistantMessageEvent.delta ?? "";
      }
      if (event.type === "tool_execution_end") {
        toolCall = event.toolName;
        toolResult = JSON.stringify(event.result).slice(0, 200);
      }
      if (event.type === "agent_settled") settled = true;
    });

    // prompt() blocks until the loop settles; race a hard timeout so a stalled
    // model call cannot hang the handler past the platform limit.
    try {
      await Promise.race([
        session.prompt("Call the ping tool once and report what it returned. Then stop."),
        new Promise((_, reject) => setTimeout(() => reject(new Error("spike timeout")), 90_000)),
      ]);
    } finally {
      session.dispose();
    }

    return Response.json({ ok: true, settled, toolCall, toolResult, text: text.slice(0, 500), events: events.slice(0, 40) });
  },
};
