# 19. Slack Plugin

## Overview

Add a Slack plugin that enables bidirectional communication between Workhorse agents and Slack channels. Agents can post messages to Slack, and the plugin monitors threads for human replies—creating notifications that agents can act on.

## Goals

1. **Outbound messaging** — Agents can send Slack messages via a tool
2. **Thread monitoring** — Poll threads for human replies, convert to notifications
3. **Event-driven notifications** — Auto-post to Slack on PR merge, status changes, etc.
4. **Thread tracking** — Track which threads belong to which issue for proper routing

## Design

### Config Schema

```typescript
export const SlackConfigSchema = z.object({
  botToken: z.string(),              // xoxb-... token for Slack API
  webhookUrl: z.string().url(),      // Incoming webhook (optional fallback)
  channel: z.string().default("#dev"),
  pollInterval: z.number().default(30000), // 30s default
  notifyOnPrMerge: z.boolean().default(true),
});
```

**TOML config:**

```toml
[plugins.slack]
bot_token = "xoxb-your-bot-token"
webhook_url = "https://hooks.slack.com/services/..."
channel = "#dev"
poll_interval = 30000
notify_on_pr_merge = true
```

### Thread Tracking

Track threads per issue so the monitor knows which conversations to poll:

```typescript
// issueId -> thread_ts[]
const issueThreads = new Map<string, string[]>();

// When sending a message, track the thread
const threads = issueThreads.get(ctx.issueId) || [];
threads.push(result.ts);
issueThreads.set(ctx.issueId, threads);
```

### Monitor: `slack-thread-replies`

Polls tracked threads for new human replies:

```typescript
monitors.registerMonitor({
  id: "slack-thread-replies",
  type: "remote",
  interval: config.pollInterval,
  poll: async (ctx) => {
    const threads = issueThreads.get(ctx.issueId);
    if (!threads?.length) return { hasChanges: false, data: null };

    const newReplies: SlackReply[] = [];
    for (const threadTs of threads) {
      const replies = await fetchThreadReplies(config.botToken, config.channel, threadTs);
      newReplies.push(...replies);
    }

    // Create notifications for each new reply
    for (const reply of newReplies) {
      await memory.notifications.create({
        issueId: ctx.issueId,
        source: "slack",
        sourceId: `slack-reply-${reply.ts}`,
        title: `Slack reply from ${reply.user}`,
        body: reply.text,
        priority: "high",
        metadata: { threadTs: reply.threadTs, channel: config.channel },
      });
    }

    return { hasChanges: newReplies.length > 0, data: { replies: newReplies } };
  },
});
```

**Lifecycle:**

- Start on `agent.create.post`
- Stop on `agent.stop.post`
- Self-stops after 5 consecutive errors

### Tool: `send_slack_message`

```typescript
const slackTool: OrchestratorTool = {
  name: "send_slack_message",
  description: "Send a message to Slack. Returns thread_ts for tracking replies.",
  schema: {
    type: "object",
    properties: {
      message: { type: "string", description: "Message text" },
      channel: { type: "string", description: "Channel (defaults to configured)" },
      threadTs: { type: "string", description: "Reply to existing thread" },
    },
    required: ["message"],
  },
  execute: async (args, ctx) => {
    const { message, channel, threadTs } = args as {
      message: string;
      channel?: string;
      threadTs?: string;
    };

    const result = await postSlackMessage(config.botToken, {
      channel: channel || config.channel,
      text: message,
      thread_ts: threadTs,
    });

    // Track the thread for monitoring
    trackThread(ctx.issueId, threadTs || result.ts);

    return { success: true, output: `Message sent. Thread ID: ${result.ts}` };
  },
};
```

### Event Hooks

**Auto-post on PR merge:**

```typescript
hooks.on("github:pr.merged", async ({ issueId, prUrl }) => {
  const result = await postSlackMessage(config.botToken, {
    channel: config.channel,
    text: `✅ PR merged for issue ${issueId}: ${prUrl}`,
  });
  trackThread(issueId, result.ts);
});
```

**Optional: Contribute to PR descriptions:**

```typescript
hooks.on("github:pr.opening", async (event: PROpeningContext) => {
  const threads = issueThreads.get(event.issueId);
  if (threads?.length) {
    event.contributions.push({
      section: "Slack Discussions",
      content: threads.map(ts => 
        `- [Thread](https://slack.com/archives/${config.channel}/p${ts.replace(".", "")})`
      ).join("\n"),
      priority: 40,
    });
  }
});
```

### Slack API Helpers

```typescript
interface SlackReply {
  ts: string;
  threadTs: string;
  user: string;
  text: string;
}

async function fetchThreadReplies(
  botToken: string,
  channel: string,
  threadTs: string
): Promise<SlackReply[]> {
  const response = await fetch(
    `https://slack.com/api/conversations.replies?channel=${channel}&ts=${threadTs}`,
    { headers: { Authorization: `Bearer ${botToken}` } }
  );
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);

  // Filter: skip parent, skip bot messages, skip already-seen
  return data.messages
    .filter((msg) => msg.ts !== threadTs && !msg.bot_id && isNew(msg.ts, threadTs))
    .map((msg) => ({
      ts: msg.ts,
      threadTs,
      user: msg.user,
      text: msg.text,
    }));
}

async function postSlackMessage(
  botToken: string,
  payload: { channel: string; text: string; thread_ts?: string }
): Promise<{ ts: string }> {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return { ts: data.ts };
}
```

## File Structure

```
packages/plugins/slack/
├── package.json
├── README.md
├── src/
│   ├── index.ts          # Plugin entry, definePlugin()
│   ├── config.ts         # SlackConfigSchema
│   ├── api.ts            # Slack API helpers
│   ├── monitor.ts        # Thread reply monitor
│   └── tools/
│       └── send-message.ts
```

## Tasks

- [ ] Create `packages/plugins/slack/` package structure
- [ ] Implement config schema with Zod
- [ ] Implement Slack API helpers (`postMessage`, `conversations.replies`)
- [ ] Implement `send_slack_message` tool with thread tracking
- [ ] Implement `slack-thread-replies` monitor
- [ ] Add deduplication for reply notifications (`lastSeenReply` map)
- [ ] Hook into `agent.create.post` / `agent.stop.post` for monitor lifecycle
- [ ] Hook into `github:pr.merged` for auto-notifications
- [ ] Optional: Add `github:pr.opening` contribution for Slack thread links
- [ ] Optional: Add steering rule for blocked agents waiting on Slack
- [ ] Add README with setup instructions (Slack app, scopes, bot token)
- [ ] Test with real Slack workspace

## Slack App Requirements

The Slack app needs these OAuth scopes:

| Scope | Purpose |
|-------|---------|
| `chat:write` | Post messages |
| `channels:history` | Read public channel messages |
| `groups:history` | Read private channel messages |
| `users:read` | Resolve user IDs to names (optional) |

## Future Enhancements

- **User mention resolution** — Convert `U12345` → `@john.doe` in notifications
- **Channel selection per issue** — Different issues post to different channels
- **Reaction tracking** — Monitor for 👍/👎 reactions as approval signals
- **Slash commands** — `/workhorse status` to check agent state
- **App Home** — Dashboard showing active agents and their status
