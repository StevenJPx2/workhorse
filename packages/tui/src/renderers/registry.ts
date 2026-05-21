/**
 * Unified activity renderer registry.
 *
 * Plugins register renderers via the tui.register_renderer hook.
 * Renderers are tried in priority order (highest first).
 * First renderer to return non-null wins; fallback to defaultRenderer.
 */

import type {
  ActivityInput,
  ActivityRenderer,
  RenderedActivity,
} from "./types.ts";

interface RegisteredRenderer {
  id: string;
  renderer: ActivityRenderer;
  priority: number;
}

const renderers: RegisteredRenderer[] = [];

/**
 * Register a renderer with the given id and priority.
 * If a renderer with the same id already exists, it is replaced.
 * Renderers are sorted by priority (highest first).
 */
export function registerRenderer(
  id: string,
  renderer: ActivityRenderer,
  priority = 0,
): void {
  // Remove existing renderer with same id
  const idx = renderers.findIndex((r) => r.id === id);
  if (idx !== -1) renderers.splice(idx, 1);

  // Insert sorted by priority (highest first)
  const insertIdx = renderers.findIndex((r) => r.priority < priority);
  if (insertIdx === -1) {
    renderers.push({ id, renderer, priority });
  } else {
    renderers.splice(insertIdx, 0, { id, renderer, priority });
  }
}

/**
 * Render an activity input using registered renderers.
 * Returns the first successful render, or a default fallback.
 */
export function render(input: ActivityInput): RenderedActivity {
  for (const { renderer } of renderers) {
    const result = renderer(input);
    if (result) return result;
  }

  // Default fallback
  return defaultRenderer(input);
}

/**
 * Default renderer for unhandled activity inputs.
 */
function defaultRenderer(input: ActivityInput): RenderedActivity {
  if (input.kind === "notification") {
    return {
      icon: "🔔",
      title: input.notification.title,
      body: input.notification.body ?? undefined,
      style: "box",
    };
  }

  if (input.kind === "tool") {
    return {
      icon: "⚡",
      title: input.tool,
      subtitle: formatArgs(input.args),
      style: "inline",
      color: "dim",
    };
  }

  // Future-proof: unknown kind (should never happen with TypeScript)
  return {
    icon: "?",
    title: "Unknown activity",
    style: "inline",
    color: "dim",
  };
}

/**
 * Format tool args for display (truncated JSON).
 */
function formatArgs(args: unknown): string {
  if (!args) return "";
  try {
    const str = JSON.stringify(args);
    return str.length > 40 ? str.slice(0, 37) + "..." : str;
  } catch {
    return "[...]";
  }
}

/**
 * Get all registered renderer IDs (for debugging).
 */
export function getRegisteredIds(): string[] {
  return renderers.map((r) => r.id);
}

/**
 * Clear all registered renderers (useful for testing).
 */
export function clearRenderers(): void {
  renderers.length = 0;
}
