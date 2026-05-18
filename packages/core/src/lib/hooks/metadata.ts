/**
 * Hook metadata for documentation generation.
 *
 * This file contains the registry and generators for hook documentation.
 * Plugins can register their own hooks via `registerHookMetadata()`.
 *
 * @module lib/hooks/metadata
 */

import { CORE_HOOK_METADATA } from "./core-hooks.ts";

export interface HookMetadata {
  /** Hook event name */
  name: string;
  /** Category for grouping */
  category: string;
  /** Human-readable description */
  description: string;
  /** Payload fields with types */
  payload: string;
  /** Example usage */
  example?: string;
  /** Plugin that registered this hook (undefined = core) */
  plugin?: string;
}

// Re-export for convenience
export { CORE_HOOK_METADATA };

/**
 * Registry of plugin-registered hook metadata.
 * Plugins call `registerHookMetadata()` to add their hooks.
 */
const pluginHooks: HookMetadata[] = [];

/**
 * Register hook metadata from a plugin.
 * Called by plugins to document their custom hooks.
 *
 * @example
 * ```typescript
 * registerHookMetadata({
 *   name: "tui.register_renderer",
 *   category: "TUI",
 *   description: "Register a custom TUI renderer",
 *   payload: "{ id: string, renderer: ActivityRenderer, priority?: number }",
 *   plugin: "tui",
 * });
 * ```
 */
export function registerHookMetadata(metadata: HookMetadata): void {
  const existing = pluginHooks.findIndex((h) => h.name === metadata.name);
  if (existing >= 0) {
    pluginHooks[existing] = metadata;
  } else {
    pluginHooks.push(metadata);
  }
}

/**
 * Get all registered hook metadata (core + plugins).
 */
export function getAllHookMetadata(): HookMetadata[] {
  return [...CORE_HOOK_METADATA, ...pluginHooks];
}

/**
 * Clear plugin-registered hooks (for testing).
 */
export function clearPluginHookMetadata(): void {
  pluginHooks.length = 0;
}

/**
 * Generate markdown documentation for all hooks.
 */
export function generateHooksMarkdown(): string {
  const lines: string[] = ["## Available Hooks", ""];

  // Group by category
  const byCategory = new Map<string, HookMetadata[]>();
  for (const hook of getAllHookMetadata()) {
    const list = byCategory.get(hook.category) ?? [];
    list.push(hook);
    byCategory.set(hook.category, list);
  }

  // Generate markdown for each category
  for (const [category, hooks] of byCategory) {
    lines.push(`### ${category}`, "");
    lines.push("| Hook | Description | Payload |");
    lines.push("|------|-------------|---------|");

    for (const hook of hooks) {
      const payload = hook.payload.replace(/\|/g, "\\|");
      lines.push(`| \`${hook.name}\` | ${hook.description} | \`${payload}\` |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate detailed hooks reference with examples.
 */
export function generateHooksReference(): string {
  const lines: string[] = ["## Hooks Reference", ""];

  // Group by category
  const byCategory = new Map<string, HookMetadata[]>();
  for (const hook of getAllHookMetadata()) {
    const list = byCategory.get(hook.category) ?? [];
    list.push(hook);
    byCategory.set(hook.category, list);
  }

  for (const [category, hooks] of byCategory) {
    lines.push(`### ${category}`, "");

    for (const hook of hooks) {
      lines.push(`#### \`${hook.name}\``, "");
      lines.push(hook.description, "");
      lines.push("**Payload:**", "```typescript", hook.payload, "```", "");

      if (hook.example) {
        lines.push("**Example:**", "```typescript", hook.example, "```", "");
      }
    }
  }

  return lines.join("\n");
}
