// Minimal live-model client for integration tests.
//
// Deliberately NOT flue: a flue harness runs a whole agent loop (sessions,
// sandbox, conversation store), which is far more machinery than "given these
// tools and this prompt, what does the model call?". These tests need one
// request and one answer, so they speak the provider's chat-completions wire
// format directly.
//
// opencode-go is the default provider because it is a flat-rate subscription:
// a few hundred scoring calls cost nothing extra, which is what makes running
// these on every tool change affordable.

import type { ModelTool } from "./surface";

/** Where to send completions. */
export interface Provider {
  name: string;
  url: string;
  /** Env var holding the bearer token. */
  keyEnv: string;
}

export const providers = {
  /** opencode Go — flat-rate subscription over open coding models. */
  go: {
    name: "opencode-go",
    url: "https://opencode.ai/zen/go/v1/chat/completions",
    keyEnv: "OPENCODE_API_KEY",
  },
  /** opencode Zen — pay-per-token, includes frontier models. */
  zen: {
    name: "opencode-zen",
    url: "https://opencode.ai/zen/v1/chat/completions",
    keyEnv: "OPENCODE_API_KEY",
  },
} satisfies Record<string, Provider>;

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface CompletionResult {
  /** Tool calls the model made, in order (empty when it answered in prose). */
  calls: ToolCall[];
  /** Assistant prose, when any. */
  text: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  /** Set when the request failed or the response was unusable. */
  error?: string;
}

export interface ModelClientOptions {
  provider?: Provider | keyof typeof providers;
  model: string;
  /** Deterministic by default — a scoring run should be reproducible. */
  temperature?: number;
  maxTokens?: number;
  /** Retries on 429/5xx, which a shared subscription endpoint does emit. */
  retries?: number;
}

export interface ModelClient {
  readonly model: string;
  readonly provider: string;
  /** One request: system + user prompt + tools → the tool calls it made. */
  complete(input: { system?: string; prompt: string; tools: ModelTool[] }): Promise<CompletionResult>;
}

const resolve = (p: ModelClientOptions["provider"]): Provider =>
  typeof p === "string" ? providers[p] : (p ?? providers.go);

/** Is a live model reachable? Use to skip suites rather than fail them. */
export function modelAvailable(provider: ModelClientOptions["provider"] = "go"): boolean {
  return Boolean(process.env[resolve(provider).keyEnv]);
}

/** The provider's response shape, as much of it as we read. */
interface CompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Extract tool calls, recording unparseable arguments as an empty-args call. */
function parseCalls(response: CompletionResponse): CompletionResult {
  const message = response.choices?.[0]?.message;
  const calls: ToolCall[] = [];

  for (const c of message?.tool_calls ?? []) {
    if (!c.function?.name) continue;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(c.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      // A model that emits unparseable arguments HAS failed. Recording the call
      // with empty args makes scoring count it as wrong rather than missing.
    }
    calls.push({ name: c.function.name, args });
  }

  return { calls, text: message?.content ?? "", usage: response.usage };
}

const backoff = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function modelClient(options: ModelClientOptions): ModelClient {
  const provider = resolve(options.provider);
  const key = process.env[provider.keyEnv];
  const retries = options.retries ?? 2;

  /** One HTTP attempt. `retry` asks the caller to try again. */
  async function attempt(body: string): Promise<CompletionResult & { retry?: boolean }> {
    const res = await fetch(provider.url, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body,
    });

    if (res.ok) return parseCalls((await res.json()) as CompletionResponse);

    const error = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
    // Only transient statuses are worth another attempt; a 400 will stay a 400.
    const retry = res.status === 429 || res.status >= 500;
    return { calls: [], text: "", error, retry };
  }

  return {
    model: options.model,
    provider: provider.name,

    async complete({ system, prompt, tools }) {
      if (!key) return { calls: [], text: "", error: `${provider.keyEnv} is not set` };

      const body = JSON.stringify({
        model: options.model,
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens ?? 1024,
        messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }],
        tools,
        // NOT "required": opencode-go rejects that with an upstream error. "auto"
        // is also the honest test — whether the model DECIDES to call a tool is
        // part of what we are measuring.
        tool_choice: "auto",
      });

      let lastError = "";
      for (let i = 0; i <= retries; i++) {
        try {
          const result = await attempt(body);
          if (!result.retry) return result;
          lastError = result.error ?? "";
          await backoff(1000 * (i + 1));
        } catch (e) {
          lastError = String((e as Error)?.message ?? e).slice(0, 200);
          await backoff(500 * (i + 1));
        }
      }

      return { calls: [], text: "", error: lastError || "request failed" };
    },
  };
}
