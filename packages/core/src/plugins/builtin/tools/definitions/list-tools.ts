/**
 * List tools tool definition.
 *
 * Lists all tools available in the current status context.
 *
 * @module plugins/builtin/tools/definitions/list-tools
 */
import type {
  HarnessOrchestrator,
  OrchestratorTool,
  ToolExecutionContext,
} from "#workflow";

/**
 * Create the list tools tool.
 * Requires orchestrator reference to access registered tools.
 */
export function createListToolsTool(
  orchestrator: HarnessOrchestrator,
): OrchestratorTool {
  return {
    name: "workhorse_list_tools",
    description:
      "List all tools available in your current workflow status. " +
      "Use this to discover what actions you can take. " +
      "Tools may be restricted based on the issue status (e.g., destructive tools " +
      "are only available during 'implementing' or 'in_review').",
    schema: {
      type: "object",
      properties: {
        includeSchema: {
          type: "boolean",
          description:
            "Include full JSON schema for each tool (default: false)",
        },
      },
    },
    execute: async (
      args: unknown,
      ctx: ToolExecutionContext,
    ): Promise<{ success: boolean; output?: string; error?: string }> => {
      const { includeSchema } = (args ?? {}) as { includeSchema?: boolean };

      try {
        const issue = await ctx.db.issues.getByExternalId(
          ctx.issueId,
          ctx.source,
        );
        if (!issue) {
          return { success: false, error: "Issue not found" };
        }

        const currentStatus = issue.status;
        const allTools = orchestrator.getTools();
        const sourceFilter = (t: OrchestratorTool) =>
          !t.sources?.length || t.sources.includes(issue.source);

        // Also find tools that are blocked in current status
        const blockedTools = allTools
          .filter(sourceFilter)
          .filter((t) => t.status?.length && !t.status.includes(currentStatus));

        // Format output
        const lines: string[] = [
          `## Available Tools (status: ${currentStatus})`,
          "",
        ];

        // Filter tools by source and status (same logic as AgentAdapter.tools getter)
        for (const tool of allTools
          .filter(sourceFilter)
          .filter(
            (t) => !t.status?.length || t.status.includes(currentStatus),
          )) {
          lines.push(`### ${tool.name}`);
          lines.push(tool.description);
          if (includeSchema) {
            lines.push("```json");
            lines.push(JSON.stringify(tool.schema, null, 2));
            lines.push("```");
          }
          lines.push("");
        }

        if (blockedTools.length > 0) {
          lines.push("---");
          lines.push("");
          lines.push("## Blocked Tools (not available in current status)");
          lines.push("");
          for (const tool of blockedTools) {
            const allowedStatuses = tool.status?.join(", ") ?? "none";
            lines.push(`- **${tool.name}** — available in: ${allowedStatuses}`);
          }
          lines.push("");
          lines.push(
            "_Use `workhorse_update_status` to change status and unlock these tools._",
          );
        }

        return {
          success: true,
          output: lines.join("\n"),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
