/**
 * Activity item type definitions and tool categorization logic.
 */

/** Jiratown tool action types */
export type JiratownAction =
  | { action: "status"; status: string }
  | { action: "escalate"; message: string; blocking?: boolean }
  | { action: "acknowledge" };

/** Activity item types */
export type ActivityItem =
  | { type: "text"; content: string; timestamp: Date }
  | { type: "tool_read"; path: string; timestamp: Date }
  | { type: "tool_write"; path: string; action: "create" | "edit"; timestamp: Date }
  | { type: "tool_bash"; command: string; description?: string; timestamp: Date }
  | { type: "tool_grep"; pattern: string; timestamp: Date }
  | { type: "tool_glob"; pattern: string; timestamp: Date }
  | ({ type: "tool_jiratown"; timestamp: Date } & JiratownAction)
  | { type: "tool_other"; tool: string; args: unknown; timestamp: Date }
  | { type: "steering"; reminder: string; timestamp: Date }
  | { type: "idle"; timestamp: Date };

/** Categorize a tool call into a specific activity item type */
export function categorizeToolCall(tool: string, args: unknown, timestamp: Date): ActivityItem {
  const obj = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const lowerTool = tool.toLowerCase();

  // Read tool
  if (lowerTool.includes("read")) {
    return {
      type: "tool_read",
      path: getString(obj.filePath) || getString(obj.path) || "?",
      timestamp,
    };
  }

  // Write/Edit tool
  if (lowerTool.includes("write") || lowerTool.includes("edit")) {
    return {
      type: "tool_write",
      path: getString(obj.filePath) || getString(obj.file) || getString(obj.path) || "?",
      action: lowerTool.includes("write") ? "create" : "edit",
      timestamp,
    };
  }

  // Bash tool
  if (lowerTool.includes("bash")) {
    return {
      type: "tool_bash",
      command: getString(obj.command) || "?",
      description: getString(obj.description),
      timestamp,
    };
  }

  // Grep tool
  if (lowerTool.includes("grep")) {
    return { type: "tool_grep", pattern: getString(obj.pattern) || "?", timestamp };
  }

  // Glob tool
  if (lowerTool.includes("glob")) {
    return { type: "tool_glob", pattern: getString(obj.pattern) || "?", timestamp };
  }

  // Jiratown tools
  if (tool === "jiratown_update_status") {
    return {
      type: "tool_jiratown",
      action: "status",
      status: getString(obj.status) || "?",
      timestamp,
    };
  }
  if (tool === "jiratown_escalate") {
    return {
      type: "tool_jiratown",
      action: "escalate",
      message: getString(obj.message) || "?",
      blocking: obj.blocking === true,
      timestamp,
    };
  }
  if (tool === "jiratown_acknowledge") {
    return { type: "tool_jiratown", action: "acknowledge", timestamp };
  }

  // Default: other tool
  return { type: "tool_other", tool, args, timestamp };
}

/** Safely extract a string from unknown */
function getString(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}
