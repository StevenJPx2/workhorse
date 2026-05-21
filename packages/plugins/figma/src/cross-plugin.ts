/**
 * Cross-plugin integration for Figma.
 *
 * Listens for issue.links.discovered events and:
 * 1. Filters for Figma URLs
 * 2. Fetches file structure for each linked design
 * 3. Stores context for prompt enrichment
 *
 * @module workhorse-plugin-figma/cross-plugin
 */
import type {
  DiscoveredLink,
  HookEmitter,
  PromptContextBlock,
} from "workhorse-core";

import type { FigmaClient } from "./client.ts";
import { canParseFigma, extractFigmaRef } from "./parser.ts";
import type { FigmaRef } from "./types.ts";

/**
 * Cached design context for an issue.
 * Maps issueId -> array of Figma design summaries.
 */
const linkedDesignCache = new Map<string, LinkedDesignContext[]>();

export interface LinkedDesignContext {
  /** Original URL from the Jira ticket */
  url: string;
  /** Parsed Figma reference */
  ref: FigmaRef;
  /** File name */
  name: string;
  /** Last modified timestamp */
  lastModified: string;
  /** Top-level page names */
  pages: string[];
  /** Component names (if any) */
  components: string[];
  /** Where the link was found */
  source: "description" | "comment";
}

/**
 * Register cross-plugin handlers for Figma link discovery.
 * When another plugin (e.g., Jira) discovers a Figma URL in an issue,
 * we fetch the design context and make it available for prompt enrichment.
 */
export function registerCrossPluginHandlers(
  hooks: HookEmitter,
  client: FigmaClient,
): () => void {
  return hooks.on("issue.links.discovered", async ({ issue, links }) => {
    // Filter for Figma URLs
    const figmaLinks = links.filter((link: DiscoveredLink) =>
      canParseFigma(link.href),
    );

    if (figmaLinks.length === 0) return;

    const contexts: LinkedDesignContext[] = [];

    for (const link of figmaLinks) {
      try {
        const ref = extractFigmaRef(link.href);
        if (!ref) continue;

        // Fetch file metadata (shallow — just top-level info)
        const file = await client.fetchFile(ref.fileKey, 1);

        contexts.push({
          url: link.href,
          ref,
          name: file.name,
          lastModified: file.lastModified,
          pages: Object.values(file.document.children ?? {}).map(
            (p: any) => p.name,
          ),
          components: Object.values(file.components ?? {}).map(
            (c: any) => c.name,
          ),
          source: link.source,
        });
      } catch (err) {
        // Log but don't fail — design might be inaccessible
        console.warn(
          `[figma] Failed to fetch linked design ${link.href}:`,
          err,
        );
      }
    }

    if (contexts.length > 0) {
      linkedDesignCache.set(issue.externalId, contexts);
    }
  });
}

/**
 * Build prompt context blocks for linked Figma designs.
 * Called during prompt.building to inject design context.
 */
export function buildLinkedDesignContextBlocks(
  externalId: string,
): PromptContextBlock[] {
  const contexts = linkedDesignCache.get(externalId);
  if (!contexts || contexts.length === 0) return [];

  const blocks: PromptContextBlock[] = [];

  for (const ctx of contexts) {
    const lines: string[] = [
      `**${ctx.name}**`,
      `- URL: ${ctx.url}`,
      `- Last modified: ${ctx.lastModified}`,
    ];

    if (ctx.pages.length > 0) {
      lines.push(`- Pages: ${ctx.pages.join(", ")}`);
    }

    if (ctx.components.length > 0) {
      lines.push(
        `- Components: ${ctx.components.slice(0, 10).join(", ")}${ctx.components.length > 10 ? ` (+${ctx.components.length - 10} more)` : ""}`,
      );
    }

    if (ctx.ref.nodeId) {
      lines.push(`- Linked node: ${ctx.ref.nodeId}`);
    }

    blocks.push({
      id: `figma-linked-${ctx.ref.fileKey}`,
      title: "Linked Figma Design",
      content: lines.join("\n"),
      priority: 25, // After Jira context (20), before general context
      metadata: {
        fileKey: ctx.ref.fileKey,
        nodeId: ctx.ref.nodeId,
        source: ctx.source,
      },
    });
  }

  return blocks;
}

/**
 * Get cached linked design contexts for an issue.
 */
export function getLinkedDesigns(externalId: string): LinkedDesignContext[] {
  return linkedDesignCache.get(externalId) ?? [];
}

/**
 * Clear cached linked design context for an issue.
 */
export function clearLinkedDesigns(externalId: string): void {
  linkedDesignCache.delete(externalId);
}
