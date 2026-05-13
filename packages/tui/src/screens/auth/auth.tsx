import { createSignal, onCleanup } from "solid-js";
import { useKeyboard, useRenderer } from "@opentui/solid";
import type { ApiTokenProvider } from "workhorse-core";
import { getTheme } from "../../theme.ts";
import type { AuthFlowState, AuthScreenProps } from "./types.ts";
import { AuthHeader } from "./auth-header.tsx";
import { AuthStatusBar } from "./auth-status-bar.tsx";
import { AuthContent } from "./auth-content.tsx";
import { useApiTokenForm } from "./use-api-token-form.ts";
import {
  handleOAuth,
  handleExternalAuth,
  handleApiTokenAuth,
  submitApiTokenForm,
} from "./auth-handlers.ts";

export function Auth(props: AuthScreenProps) {
  const renderer = useRenderer();
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [flowState, setFlowState] = createSignal<AuthFlowState>({ phase: "idle" });
  const [authenticatedPlugins, setAuthenticatedPlugins] = createSignal<Set<string>>(new Set());
  const apiTokenForm = useApiTokenForm();
  let cancelOAuth: (() => void) | null = null;
  onCleanup(() => cancelOAuth?.());

  const remainingPlugins = () => props.plugins.filter((p) => !authenticatedPlugins().has(p.name));
  const currentPlugin = () => remainingPlugins()[selectedIndex()];
  const isAuthenticating = () => flowState().phase !== "idle" && flowState().phase !== "success";
  const isApiTokenForm = () => flowState().phase === "apitoken-form";
  const getApiTokenFields = () => {
    const plugin = currentPlugin();
    return plugin?.auth.type === "apitoken" ? (plugin.auth as ApiTokenProvider).getFields() : [];
  };

  function checkCompletion() {
    if (remainingPlugins().length === 0) props.onComplete();
    else {
      setFlowState({ phase: "idle" });
      setSelectedIndex(0);
    }
  }

  function markAuthenticated(pluginName: string) {
    setFlowState({ phase: "success", pluginName });
    setAuthenticatedPlugins((prev) => new Set([...prev, pluginName]));
    setTimeout(() => checkCompletion(), 500);
  }

  const handlerOpts = {
    setFlowState,
    markAuthenticated,
    apiTokenForm,
    setCancelOAuth: (fn: (() => void) | null) => {
      cancelOAuth = fn;
    },
  };

  function authenticate() {
    const plugin = currentPlugin();
    if (!plugin) return;
    if (plugin.auth.type === "oauth") handleOAuth(plugin, handlerOpts);
    else if (plugin.auth.type === "external") handleExternalAuth(plugin, handlerOpts);
    else if (plugin.auth.type === "apitoken") handleApiTokenAuth(plugin, handlerOpts);
  }

  function cancelAuth() {
    cancelOAuth?.();
    cancelOAuth = null;
    apiTokenForm.reset();
    setFlowState({ phase: "idle" });
  }

  useKeyboard((event) => {
    if (isApiTokenForm()) {
      apiTokenForm.handleKeyboard(
        event,
        getApiTokenFields(),
        cancelAuth,
        () => currentPlugin() && submitApiTokenForm(currentPlugin()!, handlerOpts),
      );
      return;
    }
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
      backgroundColor={getTheme().colors.background}
    >
      <AuthHeader />
      <AuthContent
        isApiTokenForm={isApiTokenForm()}
        remainingPlugins={remainingPlugins()}
        selectedIndex={selectedIndex()}
        flowState={flowState()}
        currentPluginName={currentPlugin()?.name || ""}
        apiTokenFields={getApiTokenFields()}
        apiTokenValues={apiTokenForm.values()}
        fieldIndex={apiTokenForm.fieldIndex()}
        inputMode={apiTokenForm.inputMode()}
        inputBuffer={apiTokenForm.inputBuffer()}
        formError={apiTokenForm.error() || ""}
      />
      <AuthStatusBar showSkip={!!props.onSkip} isAuthenticating={isAuthenticating()} />
    </box>
  );
}
