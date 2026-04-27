/**
 * Jira comment poller monitor.
 *
 * Polls for new comments on Jira issues and creates notifications.
 *
 * @module plugins/builtin/jira/monitor
 */

import type { Database } from "#db";
import type { MonitorOptions } from "../../../services/monitor/types.ts";
import type { AtlassianClient } from "./client.ts";
import { mapJiraComment } from "./mapper.ts";

/** Metadata key for storing last seen comment IDs */
const LAST_SEEN_COMMENTS_KEY = "jira_last_seen_comment_ids";

/** Create monitor options for the Jira comment poller */
export function createJiraCommentMonitor(
  client: AtlassianClient,
  interval: number,
  db: Database,
): MonitorOptions {
  return {
    id: "jira-comments",
    type: "remote",
    interval,
    poll: async (ctx) => {
      const issue = db.issues.getById(ctx.issueId);
      if (!issue || issue.source !== "jira") {
        return { hasChanges: false };
      }

      const comments = (await client.fetchIssue(issue.externalId)).fields.comment?.comments ?? [];

      // Get previously seen comment IDs from issue metadata
      const metadata = (issue.metadata ?? {}) as Record<string, unknown>;
      const lastSeenIds = new Set((metadata[LAST_SEEN_COMMENTS_KEY] as string[]) ?? []);

      // Find new comments
      const newComments = comments.filter((c) => !lastSeenIds.has(c.id));

      if (newComments.length === 0) {
        return { hasChanges: false };
      }

      // Create notifications for new comments
      for (const comment of newComments) {
        ctx.memory.notifications.create({
          issueId: ctx.issueId,
          source: "jira",
          sourceId: `jira-comment-${comment.id}`,
          title: `New comment from ${comment.author.displayName}`,
          body: comment.body,
          priority: "normal",
          metadata: {
            commentId: comment.id,
            author: comment.author.displayName,
            jiraKey: issue.externalId,
          },
        });
      }

      // Update metadata with all current comment IDs
      db.issues.update(issue.id, {
        metadata: {
          ...metadata,
          [LAST_SEEN_COMMENTS_KEY]: comments.map((c) => c.id),
        },
      });

      return {
        hasChanges: true,
        data: {
          newComments: newComments.map(mapJiraComment),
          totalComments: comments.length,
        },
      };
    },
  };
}
