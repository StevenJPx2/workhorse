/**
 * Auth screen for authenticating plugins.
 * Shown when plugins require authentication before starting.
 */

import { createSignal, For, onCleanup } from "solid-js";
import { useKeyboard, useRenderer } from "@opentui/solid";
import { startOAuthFlow, type OAuthProvider } from "@stevenjpx2/jiratown-core";
import { getTheme } from "../../theme.ts";
import type { PluginAuthRequirement } from "../../setup/auth.ts";
import type { AuthFlowState, AuthScreenProps } from "./types.ts";
import { AuthHeader } from "./auth-header.tsx";
import { AuthPluginCard } from "./auth-plugin-card.tsx";
import { AuthStatusBar } from "./auth-status-bar.tsx";

export function Auth(props: AuthScreenProps) {
  const theme = getTheme();
  const renderer = useRenderer();
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [flowState, setFlowState] = createSignal<AuthFlowState>({ phase: "idle" });
  const [authenticatedPlugins, setAuthenticatedPlugins] = createSignal<Set<string>>(new Set());

  let cancelOAuth: (() => void) | null = null;
  onCleanup(() => cancelOAuth?.());

  const remainingPlugins = () => props.plugins.filter((p) => !authenticatedPlugins().has(p.name));
  const currentPlugin = () => remainingPlugins()[selectedIndex()];
  const isAuthenticating = () => flowState().phase !== "idle" && flowState().phase !== "success";

  async function handleOAuth(plugin: PluginAuthRequirement) {
    if (plugin.auth.type !== "oauth") return;
    setFlowState({ phase: "authenticating", pluginName: plugin.name });

    try {
      const { authUrl, waitForCallback, cancel } = startOAuthFlow(plugin.auth as OAuthProvider);
      cancelOAuth = cancel;
      setFlowState({
        phase: "waiting-browser",
        pluginName: plugin.name,
        authUrl: authUrl.toString(),
      });
      Bun.spawn([process.platform === "darwin" ? "open" : "xdg-open", authUrl.toString()]);

      const result = await waitForCallback;
      cancelOAuth = null;

      if (result.success) {
        setFlowState({ phase: "success", pluginName: plugin.name });
        setAuthenticatedPlugins((prev) => new Set([...prev, plugin.name]));
        setTimeout(() => checkCompletion(), 500);
      } else {
        setFlowState({ phase: "error", pluginName: plugin.name, error: result.error });
      }
    } catch (error) {
      setFlowState({
        phase: "error",
        pluginName: plugin.name,
        error: error instanceof Error ? error.message : "OAuth failed",
      });
    }
  }

  async function handleExternalAuth(plugin: PluginAuthRequirement) {
    if (plugin.auth.type !== "external") return;
    const auth = plugin.auth;

    // Check immediately first - maybe user already authenticated
    if (await auth.isAuthenticated()) {
      setFlowState({ phase: "success", pluginName: plugin.name });
      setAuthenticatedPlugins((prev) => new Set([...prev, plugin.name]));
      setTimeout(() => checkCompletion(), 500);
      return;
    }

    // Not authenticated - show waiting state with instructions
    setFlowState({ phase: "waiting-cli", pluginName: plugin.name });

    // Poll for authentication status
    const checkInterval = setInterval(async () => {
      if (await auth.isAuthenticated()) {
        clearInterval(checkInterval);
        setFlowState({ phase: "success", pluginName: plugin.name });
        setAuthenticatedPlugins((prev) => new Set([...prev, plugin.name]));
        setTimeout(() => checkCompletion(), 500);
      }
    }, 2000);

    cancelOAuth = () => clearInterval(checkInterval);
  }

  function checkCompletion() {
    if (remainingPlugins().length === 0) {
      props.onComplete();
    } else {
      setFlowState({ phase: "idle" });
      setSelectedIndex(0);
    }
  }

  function authenticate() {
    const plugin = currentPlugin();
    if (!plugin) return;
    if (plugin.auth.type === "oauth") handleOAuth(plugin);
    else if (plugin.auth.type === "external") handleExternalAuth(plugin);
  }

  function cancelAuth() {
    cancelOAuth?.();
    cancelOAuth = null;
    setFlowState({ phase: "idle" });
  }

  useKeyboard((event) => {
    if (event.name === "escape" && isAuthenticating()) {
      cancelAuth();
      return;
    }
    if (isAuthenticating()) return;

    switch (event.name) {
      case "up":
      case "k":
        setSelectedIndex((i) => Math.max(0, i - 1));
        break;
      case "down":
      case "j":
        setSelectedIndex((i) => Math.min(remainingPlugins().length - 1, i + 1));
        break;
      case "return":
        authenticate();
        break;
      case "s":
        if (props.onSkip) props.onSkip();
        break;
      case "q":
        renderer.destroy();
        process.exit(1);
    }
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.colors.background}
    >
      <AuthHeader />
      <box flexDirection="column" paddingTop={2} paddingLeft={2} paddingRight={2} flexGrow={1}>
        <For each={remainingPlugins()}>
          {(plugin, index) => (
            <AuthPluginCard
              plugin={plugin}
              isSelected={index() === selectedIndex()}
              flowState={flowState()}
            />
          )}
        </For>
        {remainingPlugins().length === 0 && (
          <box paddingTop={2}>
            <text fg={theme.colors.success}>
              <b>✓ All plugins authenticated!</b>
            </text>
          </box>
        )}
      </box>
      <AuthStatusBar showSkip={!!props.onSkip} isAuthenticating={isAuthenticating()} />
    </box>
  );
}
