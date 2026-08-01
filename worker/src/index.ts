// The composition root.
//
// This file exists to answer one question: which concrete plugins does this
// deployment have? Everything else is a package —
//
//   @workhorse/server    the HTTP surface (routes, auth tiers, chat, triggers)
//   @workhorse/intake    filing and healing tickets
//   @workhorse/events    the event bus, steers, notifications
//   @workhorse/sandbox   the container plane and Code Mode
//   @workhorse/workflow  the stage engine
//
// None of them import a plugin. The three things they need from the registry —
// the Core facade, attachment providers, chat tools — are supplied here, which is
// what keeps the dependency arrow pointing one way.
//
// It also exports the classes the platform instantiates by name: the Sandbox DO,
// the ticket WorkflowEntrypoint, and the Code Mode loopback bridge.

import type { Env } from "@workhorse/api";
import { db } from "@workhorse/db";
import { initLogging, log, ticketEvent } from "@workhorse/o11y";
import { healTicket } from "@workhorse/intake";
import { createServer, sweepCronTriggers } from "@workhorse/server";
import { coreFor } from "./core";
import { intake } from "./intake";
import { assembleChatTools, attachmentProviders, pluginFor, routeFor, workflowCatalog } from "./registry";

export { Sandbox } from "@cloudflare/sandbox";
export { healTicket } from "@workhorse/intake";
export { TicketWorkflow } from "./ticket-workflow";
// Loopback entrypoint for Code Mode dynamic workers (ctx.exports.ToolBridge).
export { ToolBridge } from "./codemode";

// Structured logging, configured before the handler is built. Every ticket event
// carries ticketId (+ runId, stage), so one query returns a whole run rather than
// a grep across unstructured lines.
initLogging({ service: "workhorse" });

/** The plugin-derived surface every package receives. */
const deps = {
  core: coreFor,
  attachmentProviders,
  assembleChatTools,
  pluginFor,
  routeFor,
  intake,
  workflows: workflowCatalog,
};

/** Quiet window before a dead ticket is healed — avoids racing a deploy or a human. */
const HEAL_QUIET_MS = 5 * 60 * 1000;

export default {
  fetch: createServer(deps),

  /**
   * Every 15 minutes: re-dispatch errored tickets that still have heal budget,
   * then fire any cron triggers whose window matched.
   */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const sweep = async () => {
      // One query rather than a full KV scan. The quiet window skips anything a
      // human may still be looking at.
      const cutoff = new Date(Date.now() - HEAL_QUIET_MS).toISOString();
      for (const rec of await db(env).tickets.list("errored")) {
        if (rec.updatedAt >= cutoff) continue;

        const res = await healTicket(env, rec.id);
        log.info(
          ticketEvent(
            res.ok
              ? { ticketId: rec.id, repo: rec.repo, event: "healed", instance: res.instance }
              : { ticketId: rec.id, repo: rec.repo, event: "heal-skipped", reason: res.reason },
          ),
        );
      }

      const fired = await sweepCronTriggers(intake, env);
      if (fired.length) log.info({ event: "cron-fired", triggers: fired });
    };

    ctx.waitUntil(sweep());
  },
};
