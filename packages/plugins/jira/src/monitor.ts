/**
 * Jira comment poller monitor.
 *
 * Polls for new comments on Jira issues and creates notifications.
 *
 * @module workhorse-plugin-jira/monitor
 */
import {
  type Database,
  type PollingMonitorOptions,
  isWorkhorseGenerated,
} from "workhorse-core";

import type { AtlassianClient } from "./client.ts";
import { mapJiraComment } from "./mapper.ts";

/** Metadata key for storing last seen comment IDs */
const LAST_SEEN_COMMENTS_KEY = "jira_last_seen_comment_ids";

/** Create monitor options for the Jira comment poller */
export function createJiraCommentMonitor(
  client: AtlassianClient,
  interval: number,
  db: Database,
): PollingMonitorOptions {
  return {
    id: "jira-comments",
    type: "polling",
    interval,
    poll: async (ctx) => {
      // ctx.issueId is the internal UUID (monitors are started with issue.id)
      // Only poll for Jira-sourced issues (comments only make sense for Jira tickets)
      const issue = await db.issues.getById(ctx.issueId);
      if (!issue || issue.source !== "jira") {
        return { hasChanges: false };
      }

      const comments = await client
        .fetchIssue(issue.externalId)
        .then((r) => r.fields.comment?.comments ?? []);

      // Get previously seen comment IDs from issue metadata
      const metadata = (issue.metadata ?? {}) as Record<string, unknown>;
      const lastSeenIds = new Set(
        (metadata[LAST_SEEN_COMMENTS_KEY] as string[]) ?? [],
      );

      // Find new comments
      const newComments = comments.filter((c) => !lastSeenIds.has(c.id));

      if (newComments.length === 0) {
        return { hasChanges: false };
      }

      // Create notifications for new comments (skip bot-generated)
      for (const comment of newComments) {
        const mapped = mapJiraComment(comment);
        // Skip comments posted by Workhorse itself to avoid echo
        if (isWorkhorseGenerated(mapped.body as string)) {
          continue;
        }
        ctx.memory.notifications.create({
          issueId: ctx.issueId,
          source: "jira",
          sourceId: `jira-comment-${comment.id}`,
          title: `New comment from ${comment.author.displayName}`,
          body: mapped.body as string,
          priority: "normal",
          metadata: {
            replyToId: comment.parentId ?? comment.id,
            author: comment.author.displayName,
            jiraKey: issue.externalId,
          },
        });
      }

      // Update metadata with all current comment IDs
      await db.issues.update(issue.id, {
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
