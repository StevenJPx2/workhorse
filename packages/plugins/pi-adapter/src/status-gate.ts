/**
 * Runtime status gating for Pi SDK tools.
 *
 * Wraps destructive tools (Write/Edit/Bash) to check issue status at execution
 * time. This allows agents to gain write access when transitioning from
 * "planning" to "implementing" without needing a session restart.
 *
 * @module workhorse-plugin-pi-adapter/status-gate
 */
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import type { Database, IssueStatus } from "workhorse-core";
import { WRITE_STATUSES } from "workhorse-core";

import { createRestrictedBashOperations } from "./bash-restriction.ts";
import {
  createRestrictedEditOperations,
  createRestrictedReadOperations,
  createRestrictedWriteOperations,
} from "./path-restriction.ts";

// Pi SDK tools have varying parameter schemas. We use `any` for the wrapper
// since we only need to intercept execute() and pass through all other props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = any;

interface StatusGateContext {
  worktreePath: string;
  db: Database;
  externalId: string;
  source: string;
  fallbackStatus: IssueStatus;
}

/**
 * Wrap a tool with a runtime status check.
 * Blocks execution when issue status is not in WRITE_STATUSES.
 */
function wrapWithStatusGate(
  tool: AnyTool,
  getStatus: () => Promise<IssueStatus>,
): AnyTool {
  const originalExecute = tool.execute.bind(tool);

  return {
    ...tool,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (...args: any[]): Promise<any> => {
      const status = await getStatus();
      if (!WRITE_STATUSES.includes(status)) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Tool "${tool.name}" is blocked in status "${status}". ` +
                `Destructive tools are only available in: ${WRITE_STATUSES.join(", ")}. ` +
                `Use workhorse_update_status to transition to "implementing" first.`,
            },
          ],
          isError: true,
        };
      }
      return originalExecute(...args);
    },
  };
}

/**
 * Build custom tools with runtime status gating.
 *
 * All tools are always registered, but Write/Edit/Bash check the current
 * issue status at execution time. This allows agents to gain write access
 * when transitioning from "planning" to "implementing" without restart.
 */
export function buildStatusGatedTools(ctx: StatusGateContext): AnyTool[] {
  const getStatus = (): Promise<IssueStatus> =>
    ctx.db.issues
      .getByExternalId(ctx.externalId, ctx.source)
      .then((issue) => issue?.status ?? ctx.fallbackStatus);

  const pathRestriction = { rootDir: ctx.worktreePath };

  return [
    // Read tool - always available, no gating needed
    createReadTool(ctx.worktreePath, {
      operations: createRestrictedReadOperations(pathRestriction),
    }),
    // Write/Edit/Bash tools - wrapped with runtime status check
    wrapWithStatusGate(
      createWriteTool(ctx.worktreePath, {
        operations: createRestrictedWriteOperations(pathRestriction),
      }),
      getStatus,
    ),
    wrapWithStatusGate(
      createEditTool(ctx.worktreePath, {
        operations: createRestrictedEditOperations(pathRestriction),
      }),
      getStatus,
    ),
    wrapWithStatusGate(
      createBashTool(ctx.worktreePath, {
        operations: createRestrictedBashOperations({
          rootDir: ctx.worktreePath,
          allowTmp: true,
        }),
      }),
      getStatus,
    ),
  ];
}
