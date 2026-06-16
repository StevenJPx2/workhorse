import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";

import { diagnostics } from "#diagnostics";
import { safeMatter } from "#lib";
import { defineSkill, type SkillT } from "#schema";

import { parseMetadata, parseResources, parseScripts } from "./utils";

const MAX_NAME = 64;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

// eslint-disable-next-line max-statements
function parseSkill(path: string): SkillT | undefined {
  const parsed = safeMatter(readFileSync(path, "utf8"));
  const dir = dirname(path);
  const expected = basename(dir);

  if (!parsed.success) {
    diagnostics.WH_SKILL_FRONTMATTER({ path }, { method: "error" });

    return undefined;
  }

  const { content, data } = parsed.value;

  const description = asString(data.description);
  const name = asString(data.name) ?? expected;

  if (description === undefined) {
    diagnostics.WH_SKILL_NO_DESCRIPTION({ path }, { method: "error" });

    return undefined;
  }

  if (name !== expected) {
    diagnostics.WH_SKILL_NAME_MISMATCH({ expected, name });
  }

  if (name.length > MAX_NAME) {
    diagnostics.WH_SKILL_NAME_TOO_LONG({ max: MAX_NAME, name });
  }

  return defineSkill({
    allowed_tools: asString(data["allowed-tools"]),
    compatibility: asString(data.compatibility),
    description,
    dir,
    instructions: content.trim(),
    license: asString(data.license),
    metadata: parseMetadata(data.metadata),
    name,
    resources: parseResources(dir),
    scope: expected,
    scripts: parseScripts(dir),
  });
}

export { parseSkill };
