/**
 * Webhook HTTP server
 *
 * Bun-based HTTP server for receiving webhooks from GitHub and Jira.
 */

import type { Server } from "bun";
type BunServer = Server<unknown>;
import type { Database } from "bun:sqlite";
import type { WebhookServer, WebhookServerConfig } from "./types.ts";
import { createGitHubHandler } from "./github-handler.ts";
import { createJiraHandler } from "./jira-handler.ts";

export interface CreateWebhookServerOptions extends WebhookServerConfig {
  db: Database;
}

/**
 * Create a webhook server
 */
export function createWebhookServer(options: CreateWebhookServerOptions): WebhookServer {
  let server: BunServer | null = null;
  let serverUrl: string | null = null;

  const githubHandler = createGitHubHandler({
    db: options.db,
    onEvent: options.onWebhookReceived,
  });

  const jiraHandler = createJiraHandler({
    db: options.db,
    onEvent: options.onWebhookReceived,
  });

  const handleRequest = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;

    // Health check endpoint
    if (path === "/health" && req.method === "GET") {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only accept POST requests for webhooks
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const rawBody = await req.text();
      const payload = JSON.parse(rawBody);
      const headers = Object.fromEntries(
        [...req.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]),
      );

      let result;

      if (path === "/webhooks/github") {
        result = await githubHandler(payload, headers, rawBody);
      } else if (path === "/webhooks/jira") {
        result = await jiraHandler(payload, headers, rawBody);
      } else {
        return new Response("Not found", { status: 404 });
      }

      if (!result.success) {
        options.onError?.(new Error(result.error ?? "Unknown error"));
        return new Response(JSON.stringify({ error: result.error }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options.onError?.(err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };

  const start = async (): Promise<void> => {
    if (server) return;

    const host = options.host ?? "localhost";

    server = Bun.serve({
      port: options.port,
      hostname: host,
      fetch: handleRequest,
    });

    serverUrl = `http://${host}:${options.port}`;
    console.log(`[Webhook Server] Listening on ${serverUrl}`);
  };

  const stop = async (): Promise<void> => {
    if (server) {
      server.stop();
      server = null;
      serverUrl = null;
      console.log("[Webhook Server] Stopped");
    }
  };

  const isRunning = (): boolean => server !== null;

  const getUrl = (): string | null => serverUrl;

  return { start, stop, isRunning, getUrl };
}
