/**
 * GitHub tool renderer for TUI display.
 *
 * @module workhorse-plugin-github/renderer/tool
 */

import type { RenderedActivity } from "./types.ts";

/**
 * Render GitHub tool calls.
 * Returns null for non-GitHub tools.
 */
export function renderGithubTool(
  tool: string,
  args: unknown,
): RenderedActivity | null {
  if (!tool.startsWith("github_")) return null;

  const toolArgs = (args ?? {}) as Record<string, unknown>;

  switch (tool) {
    case "github_open_pr": {
      return {
        icon: "🔀",
        title: toolArgs.draft === true ? "Opening draft PR" : "Opening PR",
        subtitle: [
          truncate(String(toolArgs.title ?? ""), 40),
          toolArgs.base ? `→ ${String(toolArgs.base)}` : null,
        ]
          .filter(Boolean)
          .join(" "),
        style: "box",
        color: "accent",
      };
    }

    case "github_add_comment": {
      const owner = String(toolArgs.owner ?? "");
      const repo = String(toolArgs.repo ?? "");
      const number = toolArgs.number as number | undefined;
      return {
        icon: "💬",
        title: "Adding GitHub comment",
        subtitle:
          owner && repo && number ? `${owner}/${repo}#${number}` : undefined,
        style: "inline",
        color: "accent",
      };
    }

    case "github_get_pr_status": {
      const owner = String(toolArgs.owner ?? "");
      const repo = String(toolArgs.repo ?? "");
      const number = toolArgs.number as number | undefined;
      return {
        icon: "📊",
        title: "Checking PR status",
        subtitle:
          owner && repo && number ? `${owner}/${repo}#${number}` : undefined,
        style: "inline",
        color: "dim",
      };
    }

    case "github_get_ci_check":
      return {
        icon: "⚙️",
        title: "Checking CI status",
        subtitle: String(toolArgs.checkName ?? "") || undefined,
        style: "inline",
        color: "dim",
      };

    case "github_get_pr_reviews": {
      const owner = String(toolArgs.owner ?? "");
      const repo = String(toolArgs.repo ?? "");
      const number = toolArgs.number as number | undefined;
      const state = toolArgs.state as string | undefined;
      return {
        icon: "👀",
        title: "Fetching PR reviews",
        subtitle: [
          owner && repo && number ? `${owner}/${repo}#${number}` : null,
          state && state !== "all" ? state : null,
        ]
          .filter(Boolean)
          .join(" • "),
        style: "inline",
        color: "dim",
      };
    }

    case "github_get_attachments": {
      const owner = String(toolArgs.owner ?? "");
      const repo = String(toolArgs.repo ?? "");
      const number = toolArgs.number as number | undefined;
      return {
        icon: "📎",
        title: "Downloading GitHub attachments",
        subtitle:
          owner && repo && number ? `${owner}/${repo}#${number}` : undefined,
        style: "inline",
        color: "dim",
      };
    }

    default:
      return null;
  }
}

/** Truncate string to max length */
function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + "…";
}
