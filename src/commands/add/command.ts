/**
 * Add command definition
 */

import { defineCommand } from "citty";
import { runAdd } from "./run.ts";

export default defineCommand({
  meta: {
    name: "add",
    description: "Quick add a Jira ticket",
  },
  args: {
    ticket: {
      type: "positional",
      description: "Ticket key (e.g., AM-123) or Jira URL",
      required: true,
    },
    agent: {
      type: "string",
      description: "AI agent to use (opencode or claude)",
      alias: "a",
    },
  },
  async run({ args }) {
    await runAdd(args.ticket, { agent: args.agent });
  },
});
