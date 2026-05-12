import path from "node:path";

interface FileContext {
  filename: string;
  basename: string;
  ext: string;
  nameWithoutExt: string;
  dirname: string;
}

/**
 * Parse context information from a filename
 */
export function parseFileContext(filename: string): FileContext {
  const basename = path.basename(filename);
  const ext = path.extname(filename);
  const nameWithoutExt = basename.replace(ext, "");
  const dirname = path.dirname(filename);

  return {
    filename,
    basename,
    ext,
    nameWithoutExt,
    dirname,
  };
}

/**
 * Check if a file should be skipped from linting (non-TS, node_modules, dist)
 */
export function shouldSkipFile(ctx: FileContext): boolean {
  // Skip non-TypeScript files
  if (ctx.ext !== ".ts" && ctx.ext !== ".tsx") {
    return true;
  }

  // Skip node_modules and dist
  if (ctx.filename.includes("node_modules") || ctx.filename.includes("dist")) {
    return true;
  }

  return false;
}

/**
 * Check if a file is an index file (barrel)
 */
export function isIndexFile(ctx: FileContext): boolean {
  return ctx.nameWithoutExt === "index";
}
