/**
 * Preview Image tool definition.
 *
 * @module plugins/builtin/tools/definitions/preview-image
 */

import type { OrchestratorTool } from "#workflow/orchestrator";

import { previewImageToolImpl } from "../implementations";

export const previewImageTool: OrchestratorTool = {
  name: "workhorse_preview_image",
  description:
    "View an image file. Use this to see the contents of image files (screenshots, mockups, diagrams, etc.) " +
    "instead of the Read tool which only shows binary data. " +
    "The image will be displayed directly to you for visual analysis. " +
    "Supports PNG, JPEG, GIF, and WebP formats. " +
    "Path can be absolute or relative to the worktree.",
  schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Path to the image file. Can be absolute or relative to the worktree. " +
          "Example: './screenshots/mockup.png' or '~/.local/share/workhorse/attachments/repo/issue/abc_screenshot.png'",
      },
    },
    required: ["path"],
  },
  execute: previewImageToolImpl,
};
