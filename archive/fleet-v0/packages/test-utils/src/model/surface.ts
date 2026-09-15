// Turn REAL Workhorse tools into a model-facing tool surface.
//
// This is what makes a model test an INTEGRATION test rather than a simulation:
// the JSON Schema handed to the model is derived from the actual ToolFactory's
// valibot schema and its actual description. Hand-copying tool definitions into
// a test would drift the moment a tool changed — and then the test would be
// measuring a fiction.

import { toJsonSchema } from "@valibot/to-json-schema";
import type { ToolContext, ToolFactory } from "@workhorse/api";
import { mockToolContext } from "../tools/context";

/** An OpenAI-style function tool, as the chat-completions API wants it. */
export interface ModelTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface SurfaceOptions {
  /**
   * Context used to instantiate the factories. Only the tool's metadata is
   * read, so the doubles are never actually executed — but a factory needs a
   * context to build.
   */
  ctx?: ToolContext;
  /** Drop the auto-injected `help` flag from the schemas (default: keep). */
  omitHelp?: boolean;
}

/**
 * Build the model-facing surface from real tool factories.
 *
 * The returned schemas carry each tool's genuine description (the text the
 * model actually sees in production) and its genuine input schema, including
 * the `help` flag that `tool()` injects.
 */
export function toolSurface(factories: ToolFactory[], options: SurfaceOptions = {}): ModelTool[] {
  const ctx = options.ctx ?? mockToolContext();

  return factories.map((factory) => {
    const definition = factory(ctx);
    const schema = definition.input as never;

    let parameters: Record<string, unknown>;
    try {
      parameters = toJsonSchema(schema, { errorMode: "ignore" }) as Record<string, unknown>;
    } catch {
      // A schema JSON Schema can't express still needs SOME shape, or the model
      // gets no tool at all and the test silently measures nothing.
      parameters = { type: "object", properties: {} };
    }

    if (options.omitHelp) {
      const props = parameters.properties as Record<string, unknown> | undefined;
      if (props && "help" in props) delete props.help;
    }

    return {
      type: "function" as const,
      function: {
        name: definition.name,
        description: definition.description,
        parameters,
      },
    };
  });
}

/** Total characters of tool descriptions + schemas — the per-turn prompt cost. */
export function surfaceWeight(tools: ModelTool[]): { chars: number; tokens: number; tools: number } {
  const chars = tools.reduce(
    (n, t) => n + t.function.name.length + t.function.description.length + JSON.stringify(t.function.parameters).length,
    0,
  );
  return { chars, tokens: Math.round(chars / 4), tools: tools.length };
}
