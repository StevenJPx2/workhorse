/**
 * Preview Image tool implementation.
 *
 * Reads an image file and returns it as base64 for vision-capable models.
 *
 * @module plugins/builtin/tools/implementations/preview-image
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, isAbsolute } from "node:path";

import type { ToolExecutionContext, ToolResult, ImageContent } from "#workflow";

/** Supported image extensions and their MIME types */
const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** Maximum file size for images (10MB) */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * Preview an image file for vision-capable models.
 *
 * Reads the image from disk and returns it as base64-encoded content
 * that can be displayed directly to the model.
 */
export async function previewImageToolImpl(
  args: unknown,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  try {
    const {
      path: inputPath,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      maxWidth: _maxWidth,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      maxHeight: _maxHeight,
    } = args as {
      path: string;
      maxWidth?: number;
      maxHeight?: number;
    };

    if (!inputPath) {
      return { success: false, error: "Path is required" };
    }

    // Resolve the path (relative to worktree or absolute)
    const absolutePath = isAbsolute(inputPath) ? inputPath : resolve(ctx.worktreePath, inputPath);

    // Check if file exists
    if (!existsSync(absolutePath)) {
      return { success: false, error: `File not found: ${inputPath}` };
    }

    // Validate extension
    const ext = extname(absolutePath).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[ext];

    if (!mimeType) {
      return {
        success: false,
        error: `Unsupported image format: ${ext}. Supported: ${Object.keys(IMAGE_MIME_TYPES).join(", ")}`,
      };
    }

    // Read the file
    const buffer = await readFile(absolutePath);

    // Check file size
    if (buffer.length > MAX_IMAGE_SIZE) {
      return {
        success: false,
        error: `Image too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`,
      };
    }

    // Return with both text description and image
    return {
      success: true,
      output: `Image loaded: ${inputPath} (${buffer.length} bytes, ${mimeType})`,
      images: [
        {
          type: "image",
          data: buffer.toString("base64"),
          mimeType,
        } as ImageContent,
      ],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
