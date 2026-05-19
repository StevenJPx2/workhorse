/**
 * figma_get_file tool — fetches the full Figma file structure.
 *
 * Lets the agent inspect the live design document at any point during
 * implementation without leaving the terminal.
 *
 * @module workhorse-plugin-figma/tools/get-file
 */

import type { OrchestratorTool } from "workhorse-core";
import type { FigmaClient } from "../client.ts";

/** Tool: Fetch a Figma file's structure, components, and styles */
export function createGetFileTool(client: FigmaClient): OrchestratorTool {
  return {
    name: "figma_get_file",
    description:
      "Fetch the structure, components, and styles of the Figma file linked to this issue. " +
      "Returns page names, top-level frames, component definitions, and design tokens. " +
      "Only works for Figma-sourced issues.",
    schema: {
      type: "object",
      properties: {
        depth: {
          type: "number",
          description:
            "Node tree depth to fetch (1 = top-level only, 2 = pages + frames, " +
            "3+ = deeper hierarchy). Defaults to 2.",
        },
      },
      required: [],
    },
    execute: async (args, ctx) => {
      const { depth = 2 } = (args ?? {}) as { depth?: number };

      try {
        const issue = await ctx.db.issues.getByExternalId(ctx.issueId, "figma");
        if (!issue) {
          return { success: false, error: "This tool only works for Figma-sourced issues." };
        }

        const fileKey = issue.externalId.split("#")[0];
        if (!fileKey) {
          return { success: false, error: "Could not determine Figma file key." };
        }

        const file = await client.fetchFile(fileKey, depth);

        // Build a compact summary the agent can read without overwhelming the context
        const pages = (file.document.children ?? []).map((page) => {
          const frames = (page.children ?? [])
            .filter((n) => n.type === "FRAME" || n.type === "COMPONENT")
            .slice(0, 20)
            .map((f) => ({
              id: f.id,
              name: f.name,
              type: f.type,
              description: f.description,
              childCount: f.children?.length ?? 0,
            }));
          return { id: page.id, name: page.name, type: page.type, frames };
        });

        const components = Object.entries(file.components ?? {}).map(([id, c]) => ({
          id,
          key: c.key,
          name: c.name,
          description: c.description,
        }));

        const styles = Object.entries(file.styles ?? {}).map(([id, s]) => ({
          id,
          key: s.key,
          name: s.name,
          description: s.description,
          styleType: s.styleType,
        }));

        return {
          success: true,
          output: JSON.stringify(
            {
              name: file.name,
              lastModified: file.lastModified,
              version: file.version,
              pages,
              components,
              styles,
            },
            null,
            2,
          ),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
