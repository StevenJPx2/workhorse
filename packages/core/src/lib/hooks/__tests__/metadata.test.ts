import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  CORE_HOOK_METADATA,
  getAllHookMetadata,
  registerHookMetadata,
  clearPluginHookMetadata,
  generateHooksMarkdown,
  generateHooksReference,
} from "../metadata.ts";

describe("CORE_HOOK_METADATA", () => {
  it("includes all core hook categories", () => {
    const categories = new Set(CORE_HOOK_METADATA.map((h) => h.category));

    expect(categories).toContain("Issues");
    expect(categories).toContain("Prompts");
    expect(categories).toContain("Agent Lifecycle");
    expect(categories).toContain("Agent Events");
    expect(categories).toContain("Notifications");
    expect(categories).toContain("Monitors");
    expect(categories).toContain("Plugins");
    expect(categories).toContain("Skills");
  });

  it("does not include TUI hooks in core", () => {
    const categories = new Set(CORE_HOOK_METADATA.map((h) => h.category));
    expect(categories).not.toContain("TUI");
  });

  it("has required fields for all hooks", () => {
    for (const hook of CORE_HOOK_METADATA) {
      expect(hook.name).toBeTruthy();
      expect(hook.category).toBeTruthy();
      expect(hook.description).toBeTruthy();
      expect(hook.payload).toBeTruthy();
    }
  });

  it("includes prompt.building hook with example", () => {
    const promptHook = CORE_HOOK_METADATA.find((h) => h.name === "prompt.building");

    expect(promptHook).toBeDefined();
    expect(promptHook?.example).toBeTruthy();
    expect(promptHook?.example).toContain("contextBlocks.push");
  });
});

describe("registerHookMetadata", () => {
  beforeEach(() => {
    clearPluginHookMetadata();
  });

  afterEach(() => {
    clearPluginHookMetadata();
  });

  it("registers plugin hooks", () => {
    registerHookMetadata({
      name: "my-plugin.custom",
      category: "Custom",
      description: "A custom hook",
      payload: "{ data: string }",
      plugin: "my-plugin",
    });

    const all = getAllHookMetadata();
    const custom = all.find((h) => h.name === "my-plugin.custom");

    expect(custom).toBeDefined();
    expect(custom?.plugin).toBe("my-plugin");
  });

  it("updates existing hook on re-register", () => {
    registerHookMetadata({
      name: "my-plugin.hook",
      category: "Test",
      description: "First description",
      payload: "{ v1: string }",
    });

    registerHookMetadata({
      name: "my-plugin.hook",
      category: "Test",
      description: "Updated description",
      payload: "{ v2: number }",
    });

    const all = getAllHookMetadata();
    const hooks = all.filter((h) => h.name === "my-plugin.hook");

    expect(hooks).toHaveLength(1);
    expect(hooks[0]?.description).toBe("Updated description");
  });

  it("getAllHookMetadata combines core and plugin hooks", () => {
    registerHookMetadata({
      name: "plugin.test",
      category: "Plugin",
      description: "Test hook",
      payload: "{}",
    });

    const all = getAllHookMetadata();

    // Should have core hooks
    expect(all.some((h) => h.name === "issue.parsed")).toBe(true);
    // Should have plugin hooks
    expect(all.some((h) => h.name === "plugin.test")).toBe(true);
  });
});

describe("generateHooksMarkdown", () => {
  beforeEach(() => {
    clearPluginHookMetadata();
  });

  afterEach(() => {
    clearPluginHookMetadata();
  });

  it("generates markdown with headers", () => {
    const markdown = generateHooksMarkdown();

    expect(markdown).toContain("## Available Hooks");
    expect(markdown).toContain("### Issues");
    expect(markdown).toContain("### Agent Lifecycle");
  });

  it("generates table format", () => {
    const markdown = generateHooksMarkdown();

    expect(markdown).toContain("| Hook | Description | Payload |");
    expect(markdown).toContain("|------|-------------|---------|");
  });

  it("includes hook names in backticks", () => {
    const markdown = generateHooksMarkdown();

    expect(markdown).toContain("`issue.parsed`");
    expect(markdown).toContain("`agent.idle`");
  });

  it("includes plugin hooks when registered", () => {
    registerHookMetadata({
      name: "tui.register_renderer",
      category: "TUI",
      description: "Register a custom renderer",
      payload: "{ id: string }",
      plugin: "tui",
    });

    const markdown = generateHooksMarkdown();

    expect(markdown).toContain("### TUI");
    expect(markdown).toContain("`tui.register_renderer`");
  });
});

describe("generateHooksReference", () => {
  beforeEach(() => {
    clearPluginHookMetadata();
  });

  afterEach(() => {
    clearPluginHookMetadata();
  });

  it("generates detailed reference with headers", () => {
    const reference = generateHooksReference();

    expect(reference).toContain("## Hooks Reference");
    expect(reference).toContain("### Issues");
    expect(reference).toContain("#### `issue.parsed`");
  });

  it("includes payload code blocks", () => {
    const reference = generateHooksReference();

    expect(reference).toContain("**Payload:**");
    expect(reference).toContain("```typescript");
  });

  it("includes examples where available", () => {
    const reference = generateHooksReference();

    expect(reference).toContain("**Example:**");
    expect(reference).toContain("contextBlocks.push");
  });

  it("includes plugin hooks with examples", () => {
    registerHookMetadata({
      name: "custom.hook",
      category: "Custom",
      description: "A custom hook",
      payload: "{ value: number }",
      example: `hooks.on("custom.hook", ({ value }) => {
  console.log(value);
});`,
    });

    const reference = generateHooksReference();

    expect(reference).toContain("### Custom");
    expect(reference).toContain("#### `custom.hook`");
    expect(reference).toContain("console.log(value)");
  });
});
