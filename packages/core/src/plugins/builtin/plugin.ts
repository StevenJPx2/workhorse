/**
 * Core plugin - registers built-in Workhorse tools, local parser, monitors, and skills.
 *
 * @module plugins/builtin/tools/plugin
 */

// oxlint-disable-next-line workhorse/prefer-path-alias -- Vite build doesn't resolve path aliases
import { definePlugin } from "../define.ts";
import { createAgentHealthMonitor } from "./monitors/health.ts";
import { notificationRenderer, skillRenderer, workhorseToolRenderer } from "./renderers.ts";
import { registerBuiltinSkills } from "./skills/register.ts";
import { registerCoreSteering } from "./steering.ts";
import {
  acknowledgeTool,
  escalateTool,
  memorySearchTool,
  memoryWriteTool,
  updateStatusTool,
} from "./tools/definitions";
import { createLocalParserOptions } from "./tools/parser.ts";
import { createLoadSkillTool } from "./tools/skill.ts";

export const corePlugin = definePlugin({
  manifest: {
    name: "builtin-tools",
    version: "1.0.0",
    description: "Core Workhorse agent tools, local issue parser, and development skills",
    capabilities: {
      tools: [
        "workhorse_acknowledge",
        "workhorse_update_status",
        "workhorse_escalate",
        "workhorse_memory_search",
        "workhorse_memory_write",
        "load_skill",
      ],
      parsers: ["local"],
      monitors: ["agent-health"],
      skills: ["builtin:plugin-development", "builtin:skill-development"],
    },
  },
  setup(ctx) {
    // Register tools
    ctx.orchestrator.registerTool(acknowledgeTool);
    ctx.orchestrator.registerTool(updateStatusTool);
    ctx.orchestrator.registerTool(escalateTool);
    ctx.orchestrator.registerTool(memorySearchTool);
    ctx.orchestrator.registerTool(memoryWriteTool);
    ctx.orchestrator.registerTool(createLoadSkillTool(ctx.orchestrator));

    // Register builtin skills
    registerBuiltinSkills(ctx.orchestrator.skillRegistry);

    // Register local parser as fallback (should be last, always matches)
    ctx.tracker.registerParser(createLocalParserOptions());

    // Register agent health monitor (started by Harness when agent spawns)
    ctx.monitors.registerMonitor(
      createAgentHealthMonitor({ interval: ctx.config.behavior.pollInterval }),
    );

    // Register Workhorse tool renderers with TUI (if TUI plugin is loaded)
    ctx.hooks.emit("tui.register_renderer", {
      id: "workhorse-tools",
      renderer: workhorseToolRenderer,
    });

    // Register notification renderer with TUI
    ctx.hooks.emit("tui.register_renderer", {
      id: "workhorse-notifications",
      renderer: notificationRenderer,
    });

    // Register skill loading renderer with TUI
    ctx.hooks.emit("tui.register_renderer", {
      id: "workhorse-skills",
      renderer: skillRenderer,
    });

    // Register core steering rules
    registerCoreSteering(ctx);
  },
});
