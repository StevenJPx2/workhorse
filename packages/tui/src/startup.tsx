// ─── Startup Helpers ─────────────────────────────────────────────────────────
// Wrapper components and plugin loaders extracted from index.tsx to keep
// that entry-point file under the max-lines-per-file limit.

import { render, useRenderer } from "@opentui/solid";
import type { Plugin } from "workhorse-core";

import tuiPlugin from "./plugin.ts";
import { Auth, Setup } from "./screens";
import type { SetupPluginConfig, AuthScreenProps } from "./screens";
import { savePluginConfig, setupValuesToConfig } from "./setup";

// ─── Plugin Loaders ───────────────────────────────────────────────────────────

export async function loadPlugins(): Promise<Plugin[]> {
  const [
    { figmaPlugin },
    { githubPlugin },
    { jiraPlugin },
    { piAdapterPlugin },
    { playwrightPlugin },
    { webPlugin },
  ] = await Promise.all([
    import("workhorse-plugin-figma"),
    import("workhorse-plugin-github"),
    import("workhorse-plugin-jira"),
    import("workhorse-plugin-pi-adapter"),
    import("workhorse-plugin-playwright"),
    import("workhorse-plugin-web"),
  ]);

  return [
    tuiPlugin, // TUI plugin (renderer hooks)
    jiraPlugin, // Jira integration
    githubPlugin, // GitHub integration
    figmaPlugin, // Figma design file integration
    playwrightPlugin, // Browser automation
    webPlugin, // Web operations (Jina AI)
    piAdapterPlugin, // Default agent harness
  ];
}

export async function loadAuthPlugins() {
  const [{ jiraPlugin }, { githubPlugin }] = await Promise.all([
    import("workhorse-plugin-jira"),
    import("workhorse-plugin-github"),
  ]);
  return [jiraPlugin, githubPlugin];
}

// ─── Wrapper Components ───────────────────────────────────────────────────────

interface SetupWrapperProps {
  plugins: SetupPluginConfig[];
  configPath: string;
  onComplete: () => void;
  onSkip: () => void;
}

/** Wrapper component for Setup that can access the renderer via useRenderer(). */
function SetupWrapper(props: SetupWrapperProps) {
  const renderer = useRenderer();

  return (
    <Setup
      plugins={props.plugins}
      onComplete={(configs) => {
        savePluginConfig(props.configPath, setupValuesToConfig(configs));
        renderer.destroy();
        props.onComplete();
      }}
      onSkip={() => {
        renderer.destroy();
        props.onSkip();
      }}
    />
  );
}

interface AuthWrapperProps {
  plugins: AuthScreenProps["plugins"];
  onComplete: () => void;
  onSkip?: () => void;
}

/** Wrapper component for Auth that can access the renderer via useRenderer(). */
function AuthWrapper(props: AuthWrapperProps) {
  const renderer = useRenderer();

  return (
    <Auth
      plugins={props.plugins}
      onComplete={() => {
        renderer.destroy();
        props.onComplete();
      }}
      onSkip={() => {
        renderer.destroy();
        props.onSkip?.();
      }}
    />
  );
}

// ─── Setup / Auth Flow Helpers ────────────────────────────────────────────────

/** Shows the setup wizard and returns true if completed, false if skipped. */
export async function runSetupIfNeeded(
  plugins: SetupPluginConfig[],
  configPath: string,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    render(() => (
      <SetupWrapper
        plugins={plugins}
        configPath={configPath}
        onComplete={() => resolve(true)}
        onSkip={() => resolve(false)}
      />
    ));
  });
}

/** Shows the auth screen and returns true if completed, false if skipped. */
export async function runAuthIfNeeded(
  plugins: AuthScreenProps["plugins"],
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    render(() => (
      <AuthWrapper
        plugins={plugins}
        onComplete={() => resolve(true)}
        onSkip={() => resolve(false)}
      />
    ));
  });
}
