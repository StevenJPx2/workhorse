import { readFileSync, writeFileSync } from "node:fs";
import type { NodePlopAPI } from "plop";

function toolCamelCase(name: string): string {
  return name
    .split("-")
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("");
}

function pascalCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function toolSummary(answers: Record<string, string>): string {
  const service = answers.service ?? "";
  const name = answers.name ?? "";
  return [
    "",
    `  🟢  ${pascalCase(toolCamelCase(name))}Tool added to ${pascalCase(service)}Service.`,
    `      File: src/services/${service}/tools/${name}.ts`,
    "",
  ].join("\n");
}

function wireToolIntoIndex(answers: Record<string, string>): string {
  const service = answers.service ?? "";
  const name = answers.name ?? "";
  const camel = toolCamelCase(name);

  const indexPath = `src/services/${service}/tools/index.ts`;
  const source = readFileSync(indexPath, "utf8");

  const importLine = `import type { ${pascalCase(service)}Service } from "../service";`;
  const newImport = `${importLine}\nimport { ${camel}Tool } from "./${name}";`;

  const withImport = source.includes(newImport)
    ? source
    : source.replace(importLine, newImport);

  const entry = `${camel}Tool(service.list.bind(service))`;
  const wired = withImport.replace(
    /return \[\n([\s\S]*?)\n\s*\];/u,
    (match, body: string) => {
      if (body.includes(entry)) {
        return match;
      }
      const cleaned = body
        .split("\n")
        .filter((line) => !line.includes("TODO: add tools"))
        .join("\n")
        .trimEnd();
      return `return [\n${cleaned ? `${cleaned},\n    ${entry}` : `    ${entry}`}\n  ];`;
    },
  );

  writeFileSync(indexPath, wired);
  return `wired ${camel}Tool into ${indexPath}`;
}

export function registerToolGenerator(plop: NodePlopAPI): void {
  plop.setGenerator("tool", {
    actions: [
      {
        path: "src/services/{{service}}/tools/{{kebabCase name}}.ts",
        templateFile: "generators/tool/templates/tool.ts.hbs",
        type: "add",
      },
      wireToolIntoIndex,
      toolSummary,
    ],
    description: "Add a tool to an existing core-v2 service",
    prompts: [
      {
        message: "Target service directory (e.g. git, script, skill):",
        name: "service",
        type: "input",
        validate: (input: string) => {
          if (/^[a-z][a-z0-9]*$/u.test(input.trim())) {
            return true;
          }
          return "Service must be a single lowercase word.";
        },
      },
      {
        message:
          "Tool name (kebab-case, e.g. read-config — becomes read_config tool ID):",
        name: "name",
        type: "input",
        validate: (input: string) => {
          if (/^[a-z][a-z0-9-]*$/u.test(input.trim())) {
            return true;
          }
          return "Tool name must be kebab-case (a-z, 0-9, hyphens).";
        },
      },
    ],
  });
}
