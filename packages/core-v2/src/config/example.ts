// oxlint-disable eslint/sort-keys
import type { ResolvedConfigT } from "./resolved";

/**
 * A complete, hand-built Workhorse config: the `ralph` workflow plus its presets
 * and project defaults — one typed object that satisfies the whole
 * {@link ResolvedConfig} schema.
 *
 * Run the smoke test (`bun run smoke` in this package) to validate it and print
 * the JSON shape.
 */
export const exampleConfig: ResolvedConfigT = {
  // Global/project config: cascade defaults + repo-wide preset patches.
  config: {
    defaults: {
      agent: "claude",
      model: "claude-sonnet-4",
      token_budget: 100_000,
      tool_timeout: 120_000,
      tool_output_limit: 3000,
      retry: 0,
    },
    // "In this repo, the coder uses Codex" — patched without editing the preset.
    presets: {
      coding: { agent: "codex" },
    },
  },

  // Reusable step bodies, referenced by id from a workflow's steps.
  presets: {
    prompt: {
      prologue:
        "You are a prompt engineer. Enrich the issue with codebase context, memory, and relevant skills. Do NOT write code.",
      epilogue: "Output the enriched prompt for the planner.",
      tools: ["fs_read", "fs_grep", "fs_glob"],
      services: ["l2", "memory"],
    },
    planning: {
      prologue:
        "You are a planner. Break the work into small, non-overlapping todos.",
      epilogue: "Confirm the plan is complete.",
      tools: ["fs_read", "fs_grep", "todo_create", "todo_edit", "todo_list"],
      services: ["l2"],
    },
    coding: {
      prologue:
        "You are a senior engineer. Implement the plan; keep diffs small and tested.",
      epilogue: "Summarise what changed and what is left.",
      tools: ["fs_read", "fs_write", "fs_grep", "git_commit", "todo_list"],
      services: ["git", "l2"],
      token_budget: 100_000,
    },
    memory: {
      prologue:
        "You are the memory weaver. Record progress, learnings, and next steps.",
      epilogue: "Output the summary (it feeds the coder's next prompt).",
      tools: ["fs_read", "memory_write"],
      services: ["memory"],
    },
    verify: {
      prologue:
        "You are the verifier. Run the project's checks against the goals.",
      epilogue: "Report pass or fail for each check.",
      tools: ["fs_read", "run_checks"],
      services: ["git", "l2"],
    },
    "review-monitor": {
      prologue:
        "You are the review monitor. Watch for external review signals.",
      epilogue: "Report any open review threads.",
      tools: ["fs_read"],
      services: ["git"],
    },
  },

  // Workflow types: the stage machine plus the step library it references.
  workflows: {
    ralph: {
      name: "ralph",
      version: "1",
      states: [
        {
          name: "planning",
          steps: ["prompt-engineer", "planner"],
          exits: [{ when: "todos_complete", to: "implementing" }],
        },
        {
          name: "implementing",
          steps: ["coder", "memory-weaver"],
          exits: [
            {
              when: "todos_complete",
              to: "ready_for_review",
              // edge-scoped transition handoff (ExitRule.epilogue)
              epilogue:
                "Summarise the finished implementation against the goals, for verification.",
            },
          ],
        },
        {
          name: "ready_for_review",
          steps: ["verifier"],
          exits: [
            { when: 'checks_status == "passed"', to: "in_review" },
            { when: 'checks_status != "passed"', to: "implementing" },
          ],
        },
        {
          name: "in_review",
          steps: ["reviewer"],
          // No other rule → parks until an external hook forces `done`.
          exits: [{ when: "open_review_threads > 0", to: "implementing" }],
        },
      ],
      steps: {
        "prompt-engineer": { preset: "prompt" },
        planner: { preset: "planning" },
        coder: {
          preset: "coding",
          token_budget: 150_000,
          sub_agents: [
            {
              name: "researcher",
              model: "claude-haiku-3",
              write_globs: [],
              tools: ["fs_read", "fs_grep", "fs_glob"],
            },
          ],
        },
        "memory-weaver": { preset: "memory", model: "claude-haiku-3" },
        verifier: { preset: "verify" },
        reviewer: { preset: "review-monitor" },
      },
    },
  },
};
