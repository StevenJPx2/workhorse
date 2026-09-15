// pi adapters shared by the worker stage harness (pi-session) and the fleet
// chat runner (chat.ts). Keeping the bridge here — not in @workhorse/api,
// which stays a types-only contract — means plugins never see pi's dependency
// graph; only the two runtimes that actually drive an agent import it.

import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionAPI,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { AgentExtension, AgentExtensionAPI, WorkhorseTool } from "@workhorse/api";
import { Type, type TProperties, type TSchema } from "typebox";

// Typed pi extension payloads, re-exported for plugin authors who want them
// (the api contract's AgentExtensionAPI is structural and untyped).
export type {
  BeforeAgentStartEvent,
  ToolCallEvent,
  ToolCallEventResult,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";

/**
 * valibot schema → typebox schema (pi tool parameters). The Workhorse tool
 * surface is authored in valibot; pi speaks typebox. The shapes in use are
 * shallow (string/number/boolean/picklist/optional/pipe/array/record/object),
 * so the conversion is a direct walk — no unions, no refinements. `pipe`
 * unwraps to its base schema so pi still enforces the underlying constraint
 * (a pipe's transforms are semantic, not structural).
 */
// fallow-ignore-next-line complexity
export function valibotToTypeBox(s: Record<string, any>): TSchema {
  switch (s?.type) {
    case "string": return Type.String();
    case "number": return Type.Number();
    case "boolean": return Type.Boolean();
    case "picklist": return Type.Union((s.options ?? []).map((o: unknown) => Type.Literal(o as string | number | boolean)));
    case "optional": return Type.Optional(valibotToTypeBox(s.wrapped ?? { type: "unknown" }));
    case "pipe": return valibotToTypeBox((s.pipe?.[0] ?? { type: "unknown" }) as Record<string, any>);
    case "array": return Type.Array(valibotToTypeBox(s.item ?? { type: "unknown" }));
    case "record": return Type.Record(Type.String(), valibotToTypeBox(s.value ?? { type: "string" }));
    case "object": {
      const entries = s.entries ?? {};
      const props: TProperties = Object.fromEntries(
        Object.entries(entries).map(([k, v]) => [k, valibotToTypeBox(v as Record<string, any>)]),
      );
      return Type.Object(props);
    }
    default: return Type.Unknown();
  }
}

/** Workhorse tool → pi custom tool. The run() closure already holds its context. */
export function toPiTool(t: WorkhorseTool): ToolDefinition {
  return {
    name: t.name,
    label: t.name,
    description: t.description,
    parameters: valibotToTypeBox(t.input as never) as never,
    execute: async (_toolCallId, params) => {
      const text = await t.run({ input: params } as never);
      return { content: [{ type: "text", text }], details: {} };
    },
  };
}

/**
 * The ONE model plane: opencode-go (flat-rate subscription) through pi-ai's
 * builtin catalog. A subscription key is static, so 401 is a config defect
 * (fail the stage, don't wait for a re-push); throttling is handled by the
 * caller's backoff loop.
 */
export async function piModelRuntime(apiKey: string) {
  const credentials = new InMemoryCredentialStore();
  const modelRuntime = await ModelRuntime.create({ credentials });
  await modelRuntime.setRuntimeApiKey("opencode-go", apiKey);
  return modelRuntime;
}

/**
 * The stage persona rides the system prompt via the sanctioned extension hook
 * (before_agent_start) rather than a prompt prefix — same semantics as flue's
 * agent instructions, and the same mechanism plugins will use to modify the
 * agent directly.
 */
export function personaExtension(persona: string): AgentExtension {
  return {
    name: "workhorse-persona",
    install(api: AgentExtensionAPI) {
      api.on("before_agent_start", (event) => {
        const e = event as { systemPrompt: string };
        return { systemPrompt: `${e.systemPrompt}\n\n${persona}` };
      });
    },
  };
}

/**
 * Defense-in-depth capability gate: re-validates EVERY tool call at
 * execution time against the stage allowlist. The pi session is created with
 * the allowlist as its active tool set, but extensions can register tools
 * mid-session and a call that slipped through assembly should still fail
 * closed — this is the last line before the tool's own context runs.
 */
export function writeGateExtension(allow: ReadonlySet<string>): AgentExtension {
  return {
    name: "workhorse-write-gate",
    install(api: AgentExtensionAPI) {
      api.on("tool_call", (event) => {
        const name = (event as { toolName?: string }).toolName ?? "";
        if (!allow.has(name)) {
          return { block: true, reason: `tool ${name} is not in this stage's allowlist`, terminate: false };
        }
        return undefined;
      });
    },
  };
}

/**
 * Install extensions into a live pi session; one failure never kills the
 * session. Wraps registerTool to report every tool an extension adds, so the
 * caller can activate it after session creation (pi's `tools` option is both
 * the active list and a registry filter — extension-registered tools land in
 * the registry but stay inactive unless explicitly activated).
 */
// fallow-ignore-next-line complexity
export function installExtensions(api: ExtensionAPI, extensions: AgentExtension[], onRegistered?: (name: string) => void): void {
  const register = api.registerTool?.bind(api);
  const apiWithHook = api as unknown as { registerTool?: (tool: { name?: string }) => void };
  if (register && onRegistered) {
    apiWithHook.registerTool = (tool: { name?: string }) => {
      if (tool?.name) onRegistered(tool.name);
      register(tool as never);
    };
  }
  for (const ext of extensions) {
    try {
      ext.install(api as never);
    } catch (e) {
      console.error(`[pi] extension ${ext.name} failed to install:`, e);
    }
  }
}

export interface PiSessionOptions {
  apiKey: string;
  persona: string;
  customTools: ToolDefinition[];
  /** Model name on the opencode-go provider (default deepseek-v4-flash). */
  modelName?: string;
  /** pi tool allowlist — only these custom tools are exposed to the agent. */
  tools?: string[];
  /** Disable pi's builtin tools (default "builtin" — the fleet ships its own). */
  noTools?: "builtin";
  thinkingLevel?: "off";
  /**
   * Activate every extension-registered tool regardless of the allowlist
   * (fleet chat: the full surface is the policy). Default false — stage
   * sessions only activate registered names that are already allowlisted.
   */
  activateRegisteredTools?: boolean;
  /** Agent extensions installed at session creation (persona is added for you). */
  extensions?: AgentExtension[];
}

/**
 * One in-process pi session: model plane + persona extension + tool surface.
 * Throws if the model is missing from the catalog (a config defect — the
 * caller should fail, not retry).
 */
// fallow-ignore-next-line complexity
export async function piSession(opts: PiSessionOptions) {
  const modelRuntime = await piModelRuntime(opts.apiKey);
  const model = modelRuntime.getModel("opencode-go", opts.modelName ?? "deepseek-v4-flash");
  if (!model) throw new Error(`model opencode-go/${opts.modelName ?? "deepseek-v4-flash"} not in catalog`);

  const extensions = [personaExtension(opts.persona), ...(opts.extensions ?? [])];
  const registered: string[] = [];
  const resourceLoader = new DefaultResourceLoader({
    cwd: "/",
    agentDir: "/",
    extensionFactories: extensions.map((e) => ({
      name: e.name,
      factory: (pi: ExtensionAPI) => installExtensions(pi, [e], (n) => registered.push(n)),
    })),
  });
  await resourceLoader.reload();

  const created = await createAgentSession({
    model,
    modelRuntime,
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
    thinkingLevel: opts.thinkingLevel ?? "off",
    tools: opts.tools,
    noTools: opts.noTools ?? "builtin",
    customTools: opts.customTools,
  });

  // Activate tools that extensions registered at install time (pi's `tools`
  // option is a visibility FILTER, not a registry prune — registered tools
  // land in the registry but stay invisible until enabled). Stage semantics:
  // only names inside the caller's allowlist are activated, so an extension
  // tool outside the allowlist stays invisible AND the write-gate blocks it —
  // the capability boundary holds. Chat (no allowlist) activates all.
  if (registered.length) {
    const allow = opts.tools;
    const active = opts.activateRegisteredTools
      ? [...new Set([...(allow ?? []), ...registered])]
      : [...new Set([...(allow ?? []), ...registered.filter((n) => allow?.includes(n) ?? false)])];
    created.session.setActiveToolsByName(active);
  }

  return created.session;
}
