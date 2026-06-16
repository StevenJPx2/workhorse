import matter from "gray-matter";
import { safeMatter } from "#lib";
import {
  ScriptParseInput,
  type ScriptParseOutputT,
  type ScriptSerializeInputT,
} from "./schema";

function parseFrontMatter(raw: string): ScriptParseOutputT {
  const lines = raw.split("\n");

  const result = safeMatter(
    lines
      .slice(lines[0]?.startsWith("#!") ? 1 : 0)
      .map((line) => line.replace(/^#\s?/u, ""))
      .join("\n"),
  );

  if (!result.success) {
    return {
      args: { options: [], positional: [] },
      command: raw,
      description: undefined,
    };
  }

  return {
    ...ScriptParseInput.parse(result.value.data),
    command: raw,
  };
}

function serializeFrontMatter(spec: ScriptSerializeInputT): string {
  const data: Record<string, unknown> = { description: spec.description };

  if (
    spec.args &&
    (spec.args.positional.length > 0 || spec.args.options.length > 0)
  ) {
    data.args = spec.args;
  }

  // eslint-disable-next-line unicorn/prefer-spread
  return matter
    .stringify("", data)
    .trimEnd()
    .split("\n")
    .map((line) => `# ${line}`)
    .concat([spec.command.trimEnd()])
    .join("\n");
}

export { parseFrontMatter, serializeFrontMatter };
