// Render a discovered graph as Mermaid.
//
// This is Phase 2's visual-simulation surface, and Mermaid specifically because
// it renders natively in a GitHub PR comment, in the job summary, and in the HTML
// quality report — the three places we already look. A bespoke SVG would need a
// fourth.
//
// The renderer is deliberately dumb: it draws what discovery found. If the picture
// looks wrong, the graph is wrong, and that is the signal worth having.

import type { DiscoveredGraph } from "./discover";

/** Mermaid node ids must be identifier-ish; stage ids are kebab-case. */
function nodeId(stageId: string): string {
  return stageId.replace(/[^A-Za-z0-9_]/g, "_");
}

/** Escape a label for Mermaid's quoted-string form. */
function label(text: string): string {
  return text.replace(/"/g, "&quot;");
}

export interface RenderOptions {
  /** Graph direction. Top-down reads like the pipeline; LR fits wide graphs. */
  direction?: "TD" | "LR";
  /** Annotate each stage with its tool count. Off by default — it clutters. */
  showToolCounts?: boolean;
}

/**
 * A Mermaid `flowchart` for the graph.
 *
 * Stages that discovery saw run more than once in a pass are drawn with a
 * self-loop, because "this stage repeats" is the single most load-bearing fact
 * about a pipeline that a linear diagram hides.
 */
export function renderMermaid(graph: DiscoveredGraph, options: RenderOptions = {}): string {
  const { direction = "TD", showToolCounts = false } = options;
  const lines = [`flowchart ${direction}`];

  if (!graph.stages.length) {
    lines.push("  empty[\"(no stages discovered)\"]");
    return lines.join("\n");
  }

  for (const stage of graph.stages) {
    const parts = [stage.id];
    if (showToolCounts) {
      const count = stage.agent.tools({ input: {} }).length;
      parts.push(`${count} tool${count === 1 ? "" : "s"}`);
    }
    // Rounded for a normal stage, doubled border for a repeating one.
    const shape = stage.repeated ? `[["${label(parts.join("\\n"))}"]]` : `("${label(parts.join("\\n"))}")`;
    lines.push(`  ${nodeId(stage.id)}${shape}`);
  }

  for (const edge of graph.edges) {
    lines.push(`  ${nodeId(edge.from)} --> ${nodeId(edge.to)}`);
  }

  // A self-loop is the honest depiction: discovery knows the stage repeats, but
  // not which downstream verdict sent it back.
  for (const id of graph.loops) {
    lines.push(`  ${nodeId(id)} -. repeats .-> ${nodeId(id)}`);
  }

  return lines.join("\n");
}

/** A plain-text summary, for a terminal or a commit message. */
export function renderText(graph: DiscoveredGraph): string {
  if (!graph.stages.length) return "(no stages discovered)";

  const lines: string[] = [];
  for (const stage of graph.stages) {
    const from = stage.upstream.length ? ` ← ${stage.upstream.join(", ")}` : "";
    const loop = stage.repeated ? " ↺" : "";
    lines.push(`${stage.id}${loop}${from}`);
  }
  return lines.join("\n");
}
