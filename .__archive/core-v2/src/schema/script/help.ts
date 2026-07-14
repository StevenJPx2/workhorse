import type { ArgSpecT, ScriptUsageT } from "./schema";

function metaSuffix(arg: ArgSpecT): string {
  const parts: string[] = [];

  if (arg.required) {
    parts.push("required");
  }

  if (arg.default !== undefined) {
    parts.push(`default: ${arg.default}`);
  }

  if (parts.length === 0) {
    return "";
  }

  return ` (${parts.join(", ")})`;
}

export function renderHelp(usage: ScriptUsageT): string {
  const tokens = [
    `Usage: ${usage.name}`,
    ...usage.args.positional.map((arg) =>
      arg.required ? `<${arg.name}>` : `[${arg.name}]`,
    ),
  ];

  if (usage.args.options.length > 0) {
    tokens.push("[options]");
  }

  return [
    tokens.join(" "),

    "",
    usage.description,

    "",
    `Arguments: [${usage.args.positional.length}]`,
    ...usage.args.positional.map(
      (arg) => `  ${arg.name}${metaSuffix(arg)} — ${arg.description}`,
    ),

    "",
    `Options: [${usage.args.options.length}]`,
    ...usage.args.options.flatMap(
      (option) =>
        `  --${option.name}${option.alias ? `, -${option.alias}` : ""}${metaSuffix(option)} — ${option.description}`,
    ),
  ].join("\n");
}
