/**
 * PI tool renderers for TUI display.
 *
 * Handles rendering of coding tools: Read, Write, Edit, Bash, Grep, Glob.
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

/**
 * PI tool renderer for TUI display.
 * Handles coding tools (Read, Write, Edit, Bash, Grep, Glob).
 * Returns null for other inputs.
 */
export function piToolRenderer(input: ActivityInput): RenderedActivity | null {
  if (input.kind !== "tool") return null;

  const tool = input.tool.toLowerCase();
  const args = (input.args ?? {}) as Record<string, unknown>;

  // Read tool
  if (tool.includes("read")) {
    const path = getString(args.filePath) || getString(args.path) || "";
    return {
      icon: "📖",
      title: "read",
      subtitle: shortenPath(path),
      style: "inline",
      color: "info",
    };
  }

  // Write tool
  if (tool.includes("write")) {
    const path = getString(args.filePath) || getString(args.file) || getString(args.path) || "";
    return {
      icon: "📄",
      title: "create",
      subtitle: shortenPath(path),
      style: "inline",
      color: "success",
    };
  }

  // Edit tool
  if (tool.includes("edit")) {
    const path = getString(args.filePath) || getString(args.file) || getString(args.path) || "";
    return {
      icon: "✏️",
      title: "edit",
      subtitle: shortenPath(path),
      style: "inline",
      color: "warning",
    };
  }

  // Bash tool
  if (tool.includes("bash")) {
    return {
      icon: "$",
      title: getString(args.description) || getString(args.command) || "",
      style: "inline",
      color: "accent",
    };
  }

  // Grep tool
  if (tool.includes("grep")) {
    const pattern = getString(args.pattern) || "";
    return {
      icon: "🔍",
      title: "grep",
      subtitle: truncate(pattern, 40),
      style: "inline",
      color: "info",
    };
  }

  // Glob tool
  if (tool.includes("glob")) {
    const pattern = getString(args.pattern) || "";
    return {
      icon: "📂",
      title: "glob",
      subtitle: truncate(pattern, 40),
      style: "inline",
      color: "info",
    };
  }

  // Don't handle other tools
  return null;
}

/** Safely extract a string from unknown */
function getString(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}

/** Shorten file path for display */
function shortenPath(path: string): string {
  if (!path) return "?";
  if (path.length <= 35) return path;
  const parts = path.split("/");
  if (parts.length <= 2) return path.slice(-35);
  return `.../${parts.slice(-2).join("/")}`;
}

/** Truncate string to max length */
function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 3) + "...";
}
