/**
 * Playwright Plugin — Workhorse plugin for browser automation.
 *
 * Provides:
 * - Browser session management (one session per issue)
 * - Navigation and page interaction tools
 * - Screenshot capture
 * - DOM querying and JavaScript evaluation
 * - TUI rendering for tool activities
 *
 * **External deps:** Node.js with Playwright installed (`npx playwright install`)
 *
 * @module workhorse-plugin-playwright
 */
import { AttachmentService, definePlugin } from "workhorse-core";
import { z } from "zod/v4";

import { registerPlaywrightCrossPluginSync } from "./cross-plugin-sync.ts";
import { registerPlaywrightHookMetadata } from "./hook-metadata.ts";
import { registerPlaywrightPromptHooks } from "./prompt.ts";
import { playwrightRenderer } from "./renderer.ts";
import { PlaywrightSessionManager } from "./session-manager.ts";
import { registerPlaywrightSteering } from "./steering.ts";
import { createPlaywrightTools } from "./tools";

/** Config schema for the Playwright plugin */
export const PlaywrightConfigSchema = z.object({
  /** Default browser type (default: chromium) */
  browserType: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
  /** Default viewport width (default: 1280) */
  viewportWidth: z.number().int().positive().default(1280),
  /** Default viewport height (default: 720) */
  viewportHeight: z.number().int().positive().default(720),
  /** Default navigation timeout in ms (default: 30000) */
  timeout: z.number().int().positive().default(30000),
  /** Whether to run browsers in headless mode (default: true) */
  headless: z.boolean().default(true),
});

export type PlaywrightConfig = z.infer<typeof PlaywrightConfigSchema>;

// Export types for external use
export type {
  BrowserSession,
  BrowserType,
  ConsoleMessage,
  ElementInfo,
  NavigationOptions,
  NetworkRequest,
  PageInfo,
  ScreenshotFormat,
  ScreenshotOptions,
  Viewport,
} from "./types.ts";

// Export plugin hook types for cross-plugin coordination
export type { PageLoadingContext, PlaywrightPluginHooks } from "./hooks.ts";

// Export session manager for advanced usage
export { PlaywrightSessionManager } from "./session-manager.ts";

export const playwrightPlugin = definePlugin({
  manifest: {
    name: "playwright",
    version: "1.0.0",
    description: "Browser automation for Workhorse using Playwright",
    capabilities: {
      tools: [
        "playwright_navigate",
        "playwright_screenshot",
        "playwright_click",
        "playwright_fill",
        "playwright_get_element",
        "playwright_get_page_content",
        "playwright_evaluate",
        "playwright_close_session",
      ],
    },
  },
  configSchema: PlaywrightConfigSchema,
  setup(ctx, config) {
    // Register hook metadata for documentation
    registerPlaywrightHookMetadata();

    // Create session manager with config
    const sessionManager = new PlaywrightSessionManager(
      ctx.hooks,
      config.browserType,
      { width: config.viewportWidth, height: config.viewportHeight },
      config.timeout,
    );

    // Create attachment service for storing screenshots
    const attachmentService = new AttachmentService(ctx.paths.attachmentsDir);

    // Register all Playwright tools with orchestrator
    for (const tool of createPlaywrightTools(
      sessionManager,
      attachmentService,
    )) {
      ctx.orchestrator.registerTool(tool);
    }

    // Clean up browser sessions when agent stops
    ctx.hooks.on("agent.stop.post", async ({ adapter }) => {
      if (sessionManager.hasActiveSession(adapter.issueId)) {
        await sessionManager.closeSession(adapter.issueId);
      }
    });

    // Register renderer with TUI (if TUI plugin is loaded)
    ctx.hooks.emit("tui.register_renderer", {
      id: "playwright",
      renderer: playwrightRenderer,
    });

    // Register cross-plugin sync (screenshots in PRs)
    registerPlaywrightCrossPluginSync(ctx, sessionManager, attachmentService);

    // Register steering rules (screenshot reminders)
    registerPlaywrightSteering(ctx);

    // Register prompt hooks (workflow guidance)
    registerPlaywrightPromptHooks(ctx);
  },
  teardown() {
    // Sessions are cleaned up via agent.stop.post hooks
    // No additional teardown needed
  },
});

// Default export for convenience
export default playwrightPlugin;
