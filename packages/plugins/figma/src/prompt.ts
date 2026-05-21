/** Figma prompt enrichment - hooks `prompt.building` to inject design context. */

import type { WorkhorseContext } from "workhorse-core";

import type { FigmaClient } from "./client.ts";
import { buildLinkedDesignContextBlocks } from "./cross-plugin.ts";
import type { FigmaFile, FigmaNode } from "./types.ts";

/** Register prompt enrichment hooks */
export function registerPromptHooks(
  ctx: WorkhorseContext,
  client: FigmaClient,
): void {
  ctx.hooks.on("prompt.building", async (buildingCtx) => {
    const issue = await ctx.db.issues.getById(buildingCtx.issueId);
    if (!issue) return;

    // If this is a Figma-sourced issue, add full file context
    if (issue.source === "figma") {
      const fileKey = issue.externalId.split("#")[0];

      if (fileKey) {
        try {
          buildingCtx.contextBlocks.push(
            ...buildFigmaContextBlocks(
              await client.fetchFile(fileKey, 2),
              issue.externalId.includes("#")
                ? issue.externalId.split("#")[1]
                : undefined,
            ),
          );
        } catch {
          // Silently skip if Figma API fails
        }
      }
    }

    // Always check for linked Figma designs from other sources (e.g., Jira tickets)
    // This adds context for any Figma URLs found in the issue description/comments
    const linkedBlocks = buildLinkedDesignContextBlocks(issue.externalId);
    if (linkedBlocks.length > 0) {
      buildingCtx.contextBlocks.push(...linkedBlocks);
    }
  });
}

/** Build context blocks to inject into the agent prompt */
function buildFigmaContextBlocks(
  file: FigmaFile,
  focusNodeId: string | undefined,
) {
  const blocks = [];

  // --- File overview ---
  const pages = file.document.children ?? [];

  blocks.push({
    id: "figma-file",
    title: "Figma File",
    priority: 10,
    content: [
      `**Name:** ${file.name}`,
      `**Last Modified:** ${file.lastModified}`,
      `**Version:** ${file.version}`,
      `**Components:** ${Object.keys(file.components ?? {}).length}`,
      `**Styles:** ${Object.keys(file.styles ?? {}).length}`,
      `**Pages:**\n${pages.map((p) => `- ${p.name}`).join("\n") || "None"}`,
    ].join("\n"),
  });

  // --- Focused node (if URL pointed at a specific frame) ---
  if (focusNodeId) {
    const node = findNodeById(file.document, focusNodeId);
    if (node) {
      blocks.push({
        id: "figma-node",
        title: "Focused Design Frame",
        priority: 12,
        content: buildNodeSummary(node),
      });
    }
  }

  // --- Top-level frames from the first page ---
  const firstPage = pages[0];
  if (firstPage?.children && firstPage.children.length > 0) {
    const frames = firstPage.children
      .filter((n) => n.type === "FRAME" || n.type === "COMPONENT")
      .slice(0, 10);

    if (frames.length > 0) {
      blocks.push({
        id: "figma-frames",
        title: `Top Frames — ${firstPage.name}`,
        priority: 15,
        content: frames
          .map(
            (f) =>
              `- **${f.name}** (${f.type})${f.description ? `: ${f.description}` : ""}`,
          )
          .join("\n"),
      });
    }
  }

  // --- Components ---
  const componentEntries = Object.values(file.components ?? {}).slice(0, 15);
  if (componentEntries.length > 0) {
    blocks.push({
      id: "figma-components",
      title: "Components",
      priority: 20,
      content: componentEntries
        .map(
          (c) => `- **${c.name}**${c.description ? `: ${c.description}` : ""}`,
        )
        .join("\n"),
    });
  }

  // --- Styles ---
  const styleEntries = Object.values(file.styles ?? {}).slice(0, 20);
  if (styleEntries.length > 0) {
    blocks.push({
      id: "figma-styles",
      title: "Design Tokens / Styles",
      priority: 25,
      content: styleEntries
        .map(
          (s) =>
            `- **${s.name}** (${s.styleType})${s.description ? `: ${s.description}` : ""}`,
        )
        .join("\n"),
    });
  }

  // --- Workflow instructions ---
  blocks.push({
    id: "figma-workflow",
    title: "Figma Workflow",
    priority: 50,
    content: [
      "Use `figma_*` tools to inspect and interact with the Figma file:",
      "- `figma_get_file` — fetch the full file structure with components and styles",
      "- `figma_get_comments` — read designer comments and feedback threads",
      "- `figma_post_comment` — post implementation questions or status updates",
      "- Check notifications for design update alerts from the Figma monitor",
    ].join("\n"),
  });

  return blocks;
}

/** Recursively search for a node by ID in the document tree */
// oxlint-disable-next-line workhorse/no-single-reference-function -- recursive function
function findNodeById(root: FigmaNode, id: string): FigmaNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

/** Build a short markdown summary for a single Figma node */
function buildNodeSummary(node: FigmaNode): string {
  const lines: string[] = [
    `**Name:** ${node.name}`,
    `**Type:** ${node.type}`,
    `**ID:** ${node.id}`,
  ];

  if (node.description) {
    lines.push(`**Description:** ${node.description}`);
  }

  if (node.characters) {
    lines.push(`**Text content:** ${node.characters.slice(0, 200)}`);
  }

  const childCount = node.children?.length ?? 0;
  if (childCount > 0) {
    lines.push(`**Direct children:** ${childCount}`);
    lines.push(
      `  ${(node.children ?? [])
        .slice(0, 8)
        .map((c) => c.name)
        .join(", ")}${childCount > 8 ? ", …" : ""}`,
    );
  }

  return lines.join("\n");
}
