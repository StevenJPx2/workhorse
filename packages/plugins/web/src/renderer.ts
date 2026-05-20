/**
 * TUI renderer for web plugin tools.
 *
 * @module workhorse-plugin-web/renderer
 */

/**
 * Activity input type for the unified renderer system.
 * Matches TUI's ActivityInput discriminated union.
 */
type ActivityInput =
  | { kind: "notification"; notification: unknown }
  | { kind: "tool"; tool: string; args: unknown };

/**
 * Rendered activity output for TUI display.
 */
interface RenderedActivity {
  icon: string;
  title: string;
  subtitle?: string;
  body?: string;
  style: "box" | "inline";
  color?: "info" | "success" | "warning" | "error" | "dim" | "accent";
}

/** Renderer for web plugin activities */
export const webRenderer = (input: ActivityInput): RenderedActivity | null => {
  if (input.kind !== "tool") return null;

  const args = (input.args ?? {}) as Record<string, unknown>;

  switch (input.tool) {
    case "web_read": {
      const url = String(args.url ?? "");
      const domain = url ? new URL(url).hostname : "unknown";
      return {
        icon: "🌐",
        title: "Reading URL",
        subtitle: domain,
        style: "inline",
        color: "accent",
      };
    }
    case "web_search": {
      const query = String(args.query ?? "");
      return {
        icon: "🔍",
        title: "Web Search",
        subtitle: query.length > 40 ? `${query.slice(0, 40)}...` : query,
        style: "inline",
        color: "accent",
      };
    }
    case "web_screenshot": {
      const url = String(args.url ?? "");
      const domain = url ? new URL(url).hostname : "unknown";
      return {
        icon: "📸",
        title: "Screenshot",
        subtitle: domain,
        style: "inline",
        color: "accent",
      };
    }
    default:
      return null;
  }
};
