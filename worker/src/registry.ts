// The plugin registry: the ONLY place in the workspace that imports concrete
// plugins. Everything else sees @workhorse/api interfaces.
//
// Split from the Core facade deliberately. When one module held both the list and
// the services, every module the services reached (tickets, refs, chat, triggers)
// imported this file back — five import cycles rooted in one file doing two jobs.
// This half imports NOTHING from its siblings, so it cannot participate in a cycle.

import type { PluginRoute, ToolContext, WorkhorsePlugin, WorkhorseTool } from "@workhorse/api";
import { aftPlugin } from "@workhorse/aft";
import { browserPlugin } from "@workhorse/browser";
import { corePlugin } from "@workhorse/core";
import { githubPlugin } from "@workhorse/github";
import { imgupPlugin } from "@workhorse/imgup";
import { jiraPlugin } from "@workhorse/jira";
import { knowledgePlugin } from "@workhorse/knowledge";
import { ntfyPlugin } from "@workhorse/ntfy";
import { pastePlugin } from "@workhorse/paste";
import { scriptsPlugin } from "@workhorse/scripts";
import { searchPlugin } from "@workhorse/search";
import { slackPlugin } from "@workhorse/slack";
import { ticketsPlugin } from "@workhorse/tickets";
import { todoPlugin } from "@workhorse/todo";
import { coding as codingWorkflow, codingNocode, codingRaw } from "@workhorse/workflow-coding";
import type { WorkflowDefinition } from "@workhorse/workflow";
import type { WorkflowCatalog } from "@workhorse/server";

export const plugins: WorkhorsePlugin[] = [
  // First: the core workspace tools (read/grep/edit/…) every stage draws from.
  // They were worker-inlined closures; as a plugin they need no special case in
  // stage assembly, and an agent can import them like any other tool.
  corePlugin,
  aftPlugin,
  browserPlugin,
  githubPlugin,
  imgupPlugin,
  jiraPlugin,
  knowledgePlugin,
  ntfyPlugin,
  pastePlugin,
  scriptsPlugin,
  searchPlugin,
  slackPlugin,
  ticketsPlugin,
  todoPlugin,
];

export type WorkflowEntry = WorkflowDefinition;

/**
 * Resolve executable workflows at the composition root.
 *
 * The new coding workflow is imported explicitly from its package. The legacy
 * eval variants remain available until their agent equivalents replace them.
 */
export function workflowFor(name: string | undefined): WorkflowEntry | undefined {
  if (name === codingWorkflow.name) return codingWorkflow;
  if (name === codingNocode.name) return codingNocode;
  if (name === codingRaw.name) return codingRaw;
  return undefined;
}

/** Catalog used by the HTTP registry routes. It describes the executable entries. */
export const workflowCatalog: WorkflowCatalog = {
  async list() {
    const codingGraph = await codingWorkflow.graph();
    const codingEntry = catalogEntry(codingWorkflow.name, codingWorkflow.description, codingGraph.stages.length, codingGraph);
    const variantEntries = await Promise.all(
      [codingNocode, codingRaw].map(async (workflow) => {
        const graph = await workflow.graph();
        return catalogEntry(workflow.name, workflow.description, graph.stages.length, graph);
      }),
    );
    return [codingEntry, ...variantEntries];
  },
  async get(name) {
    if (name === codingWorkflow.name) {
      const graph = await codingWorkflow.graph();
      return catalogEntry(codingWorkflow.name, codingWorkflow.description, graph.stages.length, graph);
    }
    if (name === codingNocode.name || name === codingRaw.name) {
      const workflow = name === codingNocode.name ? codingNocode : codingRaw;
      const graph = await workflow.graph();
      return catalogEntry(workflow.name, workflow.description, graph.stages.length, graph);
    }
    return undefined;
  },
};

function catalogEntry(name: string, description: string | undefined, stageCount: number, graph: unknown) {
  const discovered = graph as { stages: Array<{ id: string; upstream: string[]; inputKeys: string[]; repeated: boolean }>; edges: unknown[]; loops: string[] };
  const stages = discovered.stages.map((stage) => stage.id);
  return {
    name,
    description,
    stageCount,
    stages,
    spec: {
      schemaVersion: 2,
      name,
      description,
      artifactGraph: {
        stages: discovered.stages.map((stage) => ({
          id: stage.id,
          type: stage.repeated ? "loop" : "single",
          upstream: stage.upstream,
          inputKeys: stage.inputKeys,
        })),
        edges: discovered.edges,
        loops: discovered.loops,
      },
    },
  };
}

export function pluginFor(id: string): WorkhorsePlugin | undefined {
  return plugins.find((p) => p.id === id);
}

/**
 * Assemble the stage tool registry (flue engine): every plugin's stage-surface
 * tools, intersected by name with the stage allowlist. This is the (agent ∪
 * services) ∩ stage-allowlist gate expressed in the flue world — a stage sees
 * ONLY the tools its spec names, regardless of what plugins offer. The surface
 * + allowlist filter runs BEFORE instantiation (ToolFactory carries toolName +
 * surfaces), so a tool is built only if it's actually exposed.
 */
export function assembleStageTools(ctx: ToolContext, allow: readonly string[]): WorkhorseTool[] {
  const allowed = new Set(allow);
  const out: WorkhorseTool[] = [];
  const seen = new Set<string>();
  for (const p of plugins) {
    for (const f of p.tools ?? []) {
      if (!f.surfaces.includes("stage") || !allowed.has(f.toolName) || seen.has(f.toolName)) continue;
      seen.add(f.toolName);
      out.push(f(ctx));
    }
  }
  return out;
}

/**
 * Assemble the fleet-chat tool registry: every chat-surface tool across
 * plugins (no allowlist — chat gets its full set). The operator agent uses
 * these to command the fleet (file/list/status/diff) + query knowledge.
 */
export function assembleChatTools(ctx: ToolContext): WorkhorseTool[] {
  const out: WorkhorseTool[] = [];
  const seen = new Set<string>();
  for (const p of plugins) {
    for (const f of p.tools ?? []) {
      if (!f.surfaces.includes("chat") || seen.has(f.toolName)) continue;
      seen.add(f.toolName);
      out.push(f(ctx));
    }
  }
  return out;
}

/** All attachment providers across plugins, keyed by kind. */
export function attachmentProviders() {
  const out = new Map<string, NonNullable<WorkhorsePlugin["attachments"]>[number]>();
  for (const p of plugins) {
    for (const a of p.attachments ?? []) out.set(a.kind, a);
  }
  return out;
}

/** Find a plugin route matching this request. */
export function routeFor(method: string, pathname: string): PluginRoute | undefined {
  for (const p of plugins) {
    const r = p.routes?.find((r) => r.method === method && r.path === pathname);
    if (r) return r;
  }
  return undefined;
}
