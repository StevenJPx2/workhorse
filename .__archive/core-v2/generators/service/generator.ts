import type { NodePlopAPI } from "plop";

function serviceSummary(answers: Record<string, string>): string {
  const name = answers.name ?? "";
  const pascal = name.charAt(0).toUpperCase() + name.slice(1);
  return [
    "",
    `  🟢  ${pascal}Service scaffolded. Next steps:`,
    "",
    `    1. Define ${pascal}T in src/schema/ and re-export from src/schema/index.ts`,
    `    2. Flesh out discover.ts — parse sources into ${pascal}T objects`,
    `    3. Add diagnostic codes (WH_${name.toUpperCase()}_INVALID etc.) in src/diagnostics/`,
    `    4. Add tools: aube run generate tool --service ${name} --name <tool>`,
    `    5. Update src/hooks/hooks.ts if the service needs a *:register hook`,
    `    6. Register ${pascal}Service in GlobalContext / Orchestrator`,
    `    7. Fill out service.test.ts — target 97% line/fn, 95% branch coverage`,
    `    8. Add a smoke script in scripts/smoke/${name}.ts and wire it into scripts/smoke/services.ts`,
    `    9. Run: aube run check`,
    "",
  ].join("\n");
}

function serviceActions() {
  return [
    {
      path: "src/services/{{kebabCase name}}/service.ts",
      templateFile: "generators/service/templates/service.ts.hbs",
      type: "add",
    },
    {
      path: "src/services/{{kebabCase name}}/discover.ts",
      templateFile: "generators/service/templates/discover.ts.hbs",
      type: "add",
    },
    {
      path: "src/services/{{kebabCase name}}/index.ts",
      templateFile: "generators/service/templates/index.ts.hbs",
      type: "add",
    },
    {
      path: "src/services/{{kebabCase name}}/tools/index.ts",
      templateFile: "generators/service/templates/tools/index.ts.hbs",
      type: "add",
    },
    {
      path: "src/services/{{kebabCase name}}/service.test.ts",
      templateFile: "generators/service/templates/service.test.ts.hbs",
      type: "add",
    },
    {
      path: "scripts/smoke/{{kebabCase name}}.ts",
      templateFile: "generators/service/templates/smoke.ts.hbs",
      type: "add",
    },
    {
      path: "src/services/index.ts",
      pattern: /^/u,
      template: 'export * from "./{{kebabCase name}}";\n',
      type: "append",
      unique: true,
    },
    serviceSummary,
  ];
}

export function registerServiceGenerator(plop: NodePlopAPI): void {
  plop.setGenerator("service", {
    actions: serviceActions(),
    description:
      "Scaffold a new core-v2 service (service.ts + discover.ts + tools/ + tests + smoke)",
    prompts: [
      {
        message:
          "Service name (one word, e.g. git, ast, memory — will become GitService, AstService…):",
        name: "name",
        type: "input",
        validate: (input: string) => {
          if (/^[a-z][a-z0-9]*$/u.test(input.trim())) {
            return true;
          }
          return "Name must be a single lowercase word (a-z, 0-9, starting with a letter).";
        },
      },
    ],
  });
}
