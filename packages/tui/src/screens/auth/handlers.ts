/**
 * Auth handlers for OAuth, external, and API token flows.
 */

import type { Setter } from "solid-js";
import { startOAuthFlow, type OAuthProvider, type ApiTokenProvider } from "workhorse-core";

import type { PluginAuthRequirement } from "../../setup/auth.ts";
import type { AuthFlowState } from "./types.ts";
import type { useApiTokenForm } from "./use-api-token-form.ts";

export interface AuthHandlersOptions {
  setFlowState: Setter<AuthFlowState>;
  markAuthenticated: (name: string) => void;
  apiTokenForm: ReturnType<typeof useApiTokenForm>;
  setCancelOAuth: (fn: (() => void) | null) => void;
}

export function handleOAuth(plugin: PluginAuthRequirement, opts: AuthHandlersOptions) {
  if (plugin.auth.type !== "oauth") return;
  opts.setFlowState({ phase: "authenticating", pluginName: plugin.name });

  const { authUrl, waitForCallback, cancel } = startOAuthFlow(plugin.auth as OAuthProvider);
  opts.setCancelOAuth(cancel);
  opts.setFlowState({
    phase: "waiting-browser",
    pluginName: plugin.name,
    authUrl: authUrl.toString(),
  });
  Bun.spawn([process.platform === "darwin" ? "open" : "xdg-open", authUrl.toString()]);

  waitForCallback
    .then((result) => {
      opts.setCancelOAuth(null);
      if (result.success) opts.markAuthenticated(plugin.name);
      else opts.setFlowState({ phase: "error", pluginName: plugin.name, error: result.error });
    })
    .catch((error) => {
      opts.setFlowState({
        phase: "error",
        pluginName: plugin.name,
        error: error instanceof Error ? error.message : "OAuth failed",
      });
    });
}

export async function handleExternalAuth(plugin: PluginAuthRequirement, opts: AuthHandlersOptions) {
  if (plugin.auth.type !== "external") return;
  const auth = plugin.auth;

  if (await auth.isAuthenticated()) {
    opts.markAuthenticated(plugin.name);
    return;
  }

  opts.setFlowState({ phase: "waiting-cli", pluginName: plugin.name });
  const checkInterval = setInterval(async () => {
    if (await auth.isAuthenticated()) {
      clearInterval(checkInterval);
      opts.markAuthenticated(plugin.name);
    }
  }, 2000);
  opts.setCancelOAuth(() => clearInterval(checkInterval));
}

export async function handleApiTokenAuth(plugin: PluginAuthRequirement, opts: AuthHandlersOptions) {
  if (plugin.auth.type !== "apitoken") return;
  const auth = plugin.auth as ApiTokenProvider;

  if (await auth.isAuthenticated()) {
    opts.markAuthenticated(plugin.name);
    return;
  }

  // Pre-fill with placeholder values
  const initialValues: Record<string, string> = {};
  for (const field of auth.getFields()) {
    if (field.placeholder) initialValues[field.key] = field.placeholder;
  }
  opts.apiTokenForm.reset(initialValues);
  opts.setFlowState({ phase: "apitoken-form", pluginName: plugin.name });
}

export async function submitApiTokenForm(plugin: PluginAuthRequirement, opts: AuthHandlersOptions) {
  if (plugin.auth.type !== "apitoken") return;
  opts.setFlowState({ phase: "authenticating", pluginName: plugin.name });

  const result = await (plugin.auth as ApiTokenProvider).configure(opts.apiTokenForm.values());
  if (result.success) opts.markAuthenticated(plugin.name);
  else
    opts.setFlowState({
      phase: "error",
      pluginName: plugin.name,
      error: result.error || "Authentication failed",
    });
}
