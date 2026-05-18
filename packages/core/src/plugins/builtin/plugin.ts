/**
 * Core plugin - registers built-in Workhorse tools, local parser, and skills.
 *
 * @module plugins/builtin/tools/plugin
 */

// oxlint-disable-next-line workhorse/prefer-path-alias -- Vite build doesn't resolve path aliases
import { definePlugin } from "../define.ts";
import { createLocalParserOptions } from "./tools/parser.ts";
import { acknowledgeTool, escalateTool, updateStatusTool } from "./tools/definitions.ts";
import { createLoadSkillTool } from "./tools/skill.ts";
import { notificationRenderer, skillRenderer, workhorseToolRenderer } from "./renderers.ts";
import { registerBuiltinSkills } from "./skills/register.ts";

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
        "load_skill",
      ],
      parsers: ["local"],
      skills: ["builtin:plugin-development", "builtin:skill-development"],
    },
  },
  setup(ctx) {
    // Register tools
    ctx.orchestrator.registerTool(acknowledgeTool);
    ctx.orchestrator.registerTool(updateStatusTool);
    ctx.orchestrator.registerTool(escalateTool);
    ctx.orchestrator.registerTool(createLoadSkillTool(ctx.orchestrator));

    // Register builtin skills
    registerBuiltinSkills(ctx.orchestrator.skillRegistry);

    // Register local parser as fallback (should be last, always matches)
    ctx.tracker.registerParser(createLocalParserOptions());

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
  },
});
