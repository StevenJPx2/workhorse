// Tool assembly — the capability gate.
//
// `assembleStageTools` is the (agent ∪ services) ∩ stage-allowlist intersection
// that decides what a stage can actually do. It had no tests, which is why fallow
// scored it at 0% coverage: a stage silently receiving a tool it wasn't granted is
// exactly the failure nothing would have caught.

import { fakeCore, fakeEnv, fakeSandbox } from "@workhorse/test-utils/tools";
import { describe, expect, it } from "vitest";
import { assembleChatTools, assembleStageTools, attachmentProviders, pluginFor, plugins, routeFor } from "../src/registry";
import { toolContext } from "../src/tool-context";

const ctx = () =>
  toolContext(fakeEnv(), fakeCore(), "https://workhorse.test", fakeSandbox(), {
    id: "t1",
    repo: "acme/widgets",
    stage: "implement",
  });

const names = (allow: string[]) => assembleStageTools(ctx(), allow).map((t) => t.name);

describe("the registry", () => {
  it("registers the core plugin FIRST", () => {
    // Core supplies read/grep/edit, the surface every stage draws from. Ordering
    // matters because the first plugin to claim a tool name wins.
    expect(plugins[0].id).toBe("core");
  });

  it("gives every plugin a unique id", () => {
    const ids = plugins.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finds a plugin by id", () => {
    expect(pluginFor("core")?.id).toBe("core");
    expect(pluginFor("nope")).toBeUndefined();
  });

  it("exposes no duplicate tool names across plugins", () => {
    const all = plugins.flatMap((p) => (p.tools ?? []).map((t) => t.toolName));
    const dupes = all.filter((n, i) => all.indexOf(n) !== i);

    // A duplicate would make which implementation a stage gets depend on
    // registration order — silently.
    expect(dupes).toEqual([]);
  });
});

describe("stage tool gating", () => {
  it("grants exactly the allowlisted tools", () => {
    expect(names(["read", "grep"]).sort()).toEqual(["grep", "read"]);
  });

  it("grants NOTHING for an empty allowlist", () => {
    // The gate's most important property: a stage that names no tools gets none,
    // rather than everything the plugins happen to offer.
    expect(names([])).toEqual([]);
  });

  it("ignores an allowlisted name no plugin provides", () => {
    // A typo in a workflow must not throw at assembly; the stage simply lacks it.
    expect(names(["read", "no_such_tool"])).toEqual(["read"]);
  });

  it("never grants a tool outside the allowlist", () => {
    const granted = names(["read"]);

    expect(granted).not.toContain("write");
    expect(granted).not.toContain("bash");
    expect(granted).not.toContain("browser_open");
  });

  it("draws across plugins in one assembly", () => {
    // Core and plugin tools come from one pass now that the builtins are a plugin.
    const granted = names(["read", "todo_read", "gh_pr"]);

    expect(granted).toContain("read");
    expect(granted).toContain("todo_read");
    expect(granted).toContain("gh_pr");
  });

  it("excludes chat-only tools from a stage", () => {
    // workhorse_* are fleet-operator tools; a stage agent must not be able to file
    // tickets or read the whole fleet.
    expect(names(["workhorse_list_tickets", "read"])).toEqual(["read"]);
  });

  it("deduplicates a name granted twice", () => {
    const granted = names(["read", "read"]);
    expect(granted).toEqual(["read"]);
  });
});

describe("chat tool gating", () => {
  it("grants chat-surface tools with no allowlist", () => {
    const granted = assembleChatTools(ctx()).map((t) => t.name);

    expect(granted.length).toBeGreaterThan(0);
    expect(granted.some((n) => n.startsWith("workhorse_"))).toBe(true);
  });

  it("excludes stage-only tools from chat", () => {
    const granted = assembleChatTools(ctx()).map((t) => t.name);

    // Fleet chat has no ticket sandbox, so a container tool there would act on the
    // chat container — which is not the repo anyone is asking about.
    expect(granted).not.toContain("write");
    expect(granted).not.toContain("edit");
  });

  it("produces no duplicates", () => {
    const granted = assembleChatTools(ctx()).map((t) => t.name);
    expect(new Set(granted).size).toBe(granted.length);
  });
});

describe("routes and attachments", () => {
  it("finds a plugin route by method and path", () => {
    const withRoutes = plugins.find((p) => p.routes?.length);
    if (!withRoutes?.routes?.[0]) return;

    const r = withRoutes.routes[0];
    expect(routeFor(r.method, r.path)?.path).toBe(r.path);
  });

  it("returns undefined for an unrouted path", () => {
    expect(routeFor("GET", "/definitely/not/a/route")).toBeUndefined();
  });

  it("keys attachment providers by kind", () => {
    const providers = attachmentProviders();

    for (const [kind, provider] of providers) expect(provider.kind).toBe(kind);
  });
});
