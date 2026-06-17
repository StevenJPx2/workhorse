import { diagnostics } from "#diagnostics";

import type { ArgSpecT, ScriptInvocation, ScriptT } from "./schema";

function resolveValue(params: {
  given: string | undefined;
  kind: "argument" | "option";
  script: ScriptT;
  spec: ArgSpecT;
}): string | undefined {
  const { given, kind, script, spec } = params;

  if (given !== undefined) {
    return given;
  }

  if (spec.default !== undefined) {
    return spec.default;
  }

  if (spec.required) {
    throw diagnostics.WH_SCRIPT_MISSING_ARG({
      kind,
      name: spec.name,
      script: script.name,
    });
  }
}

export function resolveInvocation(
  script: ScriptT,
  raw: RawInvocation = {},
): ScriptInvocation {
  const { options: givenOptions = {} } = raw;

  for (const name in givenOptions) {
    if (!script.args.options.some((option) => option.name === name)) {
      throw diagnostics.WH_SCRIPT_UNKNOWN_OPTION({ name, script: script.name });
    }
  }

  const options: Record<string, string> = {};

  for (const option of script.args.options) {
    const value = resolveValue({
      given: givenOptions[option.name],
      kind: "option",
      script,
      spec: option,
    });

    if (value !== undefined) {
      options[option.name] = value;
    }
  }

  return {
    options,
    positional: script.args.positional.map(
      (spec, index) =>
        resolveValue({
          given: (raw.positional ?? [])[index],
          kind: "argument",
          script,
          spec,
        }) ?? "",
    ),
  };
}

export interface RawInvocation {
  options?: Record<string, string>;
  positional?: string[];
}
