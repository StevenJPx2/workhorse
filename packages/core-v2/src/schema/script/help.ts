import type { ArgSpecT, ScriptT } from "./schema";

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

export function renderHelp(script: ScriptT): string {
  const tokens = [
    `Usage: ${script.name}`,
    ...script.args.positional.map((arg) =>
      arg.required ? `<${arg.name}>` : `[${arg.name}]`,
    ),
  ];

  if (script.args.options.length > 0) {
    tokens.push("[options]");
  }

  return [
    tokens.join(" "),

    "",
    script.description,

    "",
    `Arguments: [${script.args.positional.length}]`,
    ...script.args.positional.map(
      (arg) => `  ${arg.name}${metaSuffix(arg)} — ${arg.description}`,
    ),

    "",
    `Options: [${script.args.options.length}]`,
    ...script.args.options.flatMap(
      (option) =>
        `  --${option.name}${option.alias ? `, -${option.alias}` : ""}${metaSuffix(option)} — ${option.description}`,
    ),
  ].join("\n");
}
