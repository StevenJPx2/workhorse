/**
 * SyncIndicator component - Shows spinning icons when polling GitHub/Jira
 *
 * Displays animated sync indicators in the terminal using frame-based animation.
 * Icons spin when their respective polling is active.
 */

import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { colors } from "../../theme/colors.ts";
import type { SyncIndicatorProps } from "./types.ts";

// Spinner frames for animation (uses unicode braille patterns for smooth spin)
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL = 80; // ms between frames

/**
 * Animated sync indicator showing GitHub and Jira polling status
 */
export function SyncIndicator(props: SyncIndicatorProps) {
  const [frame, setFrame] = createSignal(0);

  // Only animate when something is polling
  const isAnimating = () => props.isGitHubPolling?.() || props.isJiraPolling?.();

  // Animation timer
  createEffect(() => {
    if (!isAnimating()) return;

    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, FRAME_INTERVAL);

    onCleanup(() => clearInterval(timer));
  });

  const spinnerChar = () => SPINNER_FRAMES[frame()];

  // GitHub icon: spinning when polling, static when idle
  const githubIcon = () => {
    if (props.isGitHubPolling?.()) {
      return spinnerChar();
    }
    return props.showGitHub ? "⬡" : ""; // Hexagon for GitHub
  };

  // Jira icon: spinning when polling, static when idle
  const jiraIcon = () => {
    if (props.isJiraPolling?.()) {
      return spinnerChar();
    }
    return props.showJira ? "◆" : ""; // Diamond for Jira
  };

  const showAny = () => props.showGitHub || props.showJira;

  return (
    <Show when={showAny()}>
      <box flexDirection="row" gap={1}>
        <Show when={props.showGitHub}>
          <text fg={props.isGitHubPolling?.() ? colors.info : colors.text.dim}>
            {githubIcon()} {props.isGitHubPolling?.() ? "syncing" : "GitHub"}
          </text>
        </Show>
        <Show when={props.showJira}>
          <text fg={props.isJiraPolling?.() ? colors.info : colors.text.dim}>
            {jiraIcon()} {props.isJiraPolling?.() ? "syncing" : "Jira"}
          </text>
        </Show>
      </box>
    </Show>
  );
}
