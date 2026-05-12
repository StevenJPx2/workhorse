import { describe, expect, it, vi } from "vitest";
import type { Plugin } from "workhorse-core";
import { checkAllPluginsAuth, checkPluginAuth, getPluginsNeedingAuth } from "./auth";

function mockPlugin(authType: "oauth" | "external" | "none", authenticated: boolean): Plugin {
  let auth: Plugin["auth"];
  if (authType === "none") {
    auth = { type: "none" };
  } else if (authType === "external") {
    auth = {
      type: "external",
      config: {
        authCommand: "test auth",
        statusCommand: "test status",
        instructions: "Run test auth",
      },
      isAuthenticated: vi.fn().mockResolvedValue(authenticated),
    };
  } else {
    auth = {
      type: "oauth",
      callbackPort: 9876,
      createAuthorizationURL: vi.fn(),
      validateAuthorizationCode: vi.fn(),
      isAuthenticated: vi.fn().mockResolvedValue(authenticated),
      saveTokens: vi.fn(),
      clearTokens: vi.fn(),
    };
  }

  return {
    manifest: { name: `test-${authType}`, version: "1.0.0", description: "Test plugin" },
    auth,
    [Symbol.for("workhorse.plugin")]: true,
  } as unknown as Plugin;
}

describe("checkPluginAuth", () => {
  it("returns authenticated for plugins with no auth", async () => {
    const plugin = mockPlugin("none", false);
    const result = await checkPluginAuth(plugin);

    expect(result.authenticated).toBe(true);
    expect(result.provider).toBe("none");
    expect(result.pluginName).toBe("test-none");
  });

  it("returns auth status from oauth provider", async () => {
    const plugin = mockPlugin("oauth", true);
    const result = await checkPluginAuth(plugin);

    expect(result.authenticated).toBe(true);
    expect(result.provider).toBe("oauth");
  });

  it("returns unauthenticated when oauth check fails", async () => {
    const plugin = mockPlugin("oauth", false);
    const result = await checkPluginAuth(plugin);

    expect(result.authenticated).toBe(false);
    expect(result.provider).toBe("oauth");
  });

  it("returns unauthenticated when isAuthenticated throws", async () => {
    const plugin = mockPlugin("oauth", false);
    if (plugin.auth && plugin.auth.type === "oauth") {
      plugin.auth.isAuthenticated = vi.fn().mockRejectedValue(new Error("Keychain locked"));
    }

    const result = await checkPluginAuth(plugin);

    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Keychain locked");
  });
});

describe("checkAllPluginsAuth", () => {
  it("checks all plugins in parallel", async () => {
    const plugins = [
      mockPlugin("none", false),
      mockPlugin("oauth", true),
      mockPlugin("external", false),
    ];
    const results = await checkAllPluginsAuth(plugins);

    expect(results).toHaveLength(3);
    expect(results[0]?.authenticated).toBe(true);
    expect(results[1]?.authenticated).toBe(true);
    expect(results[2]?.authenticated).toBe(false);
  });
});

describe("getPluginsNeedingAuth", () => {
  it("returns empty array when all plugins are authenticated", async () => {
    const plugins = [mockPlugin("none", false), mockPlugin("oauth", true)];
    const needsAuth = await getPluginsNeedingAuth(plugins);

    expect(needsAuth).toHaveLength(0);
  });

  it("returns only plugins that need auth and are not authenticated", async () => {
    const plugins = [
      mockPlugin("none", false),
      mockPlugin("oauth", true),
      mockPlugin("external", false),
    ];
    const needsAuth = await getPluginsNeedingAuth(plugins);

    expect(needsAuth).toHaveLength(1);
    expect(needsAuth[0]?.name).toBe("test-external");
    expect(needsAuth[0]?.auth.type).toBe("external");
  });

  it("includes error in status when auth check fails", async () => {
    const plugin = mockPlugin("oauth", false);
    if (plugin.auth && plugin.auth.type === "oauth") {
      plugin.auth.isAuthenticated = vi.fn().mockRejectedValue(new Error("Network error"));
    }

    const needsAuth = await getPluginsNeedingAuth([plugin]);

    expect(needsAuth).toHaveLength(1);
    expect(needsAuth[0]?.status.error).toBe("Network error");
  });

  it.fails("TODO: test token refresh during isAuthenticated check", () => {
    // OAuth providers may auto-refresh expired tokens during isAuthenticated.
    // This requires mocking time and token expiry states.
    throw new Error("Not implemented");
  });
});
