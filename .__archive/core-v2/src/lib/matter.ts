import matter, { type GrayMatterFile } from "gray-matter";

type Result =
  | {
      success: true;
      value: GrayMatterFile<string>;
    }
  | {
      success: false;
      error: string;
    };

export function safeMatter(value: string): Result {
  try {
    return { success: true, value: matter(value) };
  } catch {
    return { error: "unparseable frontmatter", success: false };
  }
}
