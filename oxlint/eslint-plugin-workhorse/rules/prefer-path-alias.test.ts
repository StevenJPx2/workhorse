import { describe, it, expect } from "vitest";
import rule from "./prefer-path-alias.ts";

interface Report {
  node: any;
  messageId: string;
  data?: Record<string, string>;
  fix?: (fixer: any) => any;
}

function createContext(filename: string, source: string) {
  const reports: Report[] = [];
  return {
    filename,
    sourceCode: { getText: () => source },
    report: (report: Report) => reports.push(report),
    reports,
  };
}

function runRule(filename: string, code: string): Report[] {
  const context = createContext(filename, code);
  const visitor = rule.create(context);

  // Simulate import/export nodes
  const importMatches = code.matchAll(
    /(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+(['"])([^'"]+)\1/g,
  );

  for (const match of importMatches) {
    const quote = match[1];
    const source = match[2];
    const node = {
      type: "ImportDeclaration",
      source: {
        value: source,
        raw: `${quote}${source}${quote}`,
      },
    };

    if (visitor.ImportDeclaration) {
      visitor.ImportDeclaration(node);
    }
  }

  return context.reports;
}

describe("prefer-path-alias", () => {
  describe("should flag deep relative imports", () => {
    it("flags ../../config imports", () => {
      const reports = runRule(
        "/project/packages/core/src/workflow/orchestrator/orchestrator.ts",
        'import { getConfig } from "../../config/index.ts";',
      );
      expect(reports).toHaveLength(1);
      expect(reports[0]!.data?.suggested).toBe("#config");
    });

    it("flags ../../services/memory imports", () => {
      const reports = runRule(
        "/project/packages/core/src/workflow/orchestrator/orchestrator.ts",
        'import { memory } from "../../services/memory/index.ts";',
      );
      expect(reports).toHaveLength(1);
      expect(reports[0]!.data?.suggested).toBe("#services/memory");
    });

    it("flags deep workflow imports", () => {
      const reports = runRule(
        "/project/packages/core/src/plugins/builtin/tools/plugin.ts",
        'import { steering } from "../../../workflow/steering/service.ts";',
      );
      expect(reports).toHaveLength(1);
      expect(reports[0]!.data?.suggested).toBe("#workflow/steering/service");
    });

    it("flags 3+ level deep imports", () => {
      const reports = runRule(
        "/project/packages/core/src/plugins/builtin/tools/plugin.ts",
        'import { definePlugin } from "../../define.ts";',
      );
      // This should flag since #plugins maps to src/plugins/index.ts
      // and the import resolves to plugins/define → #plugins/define
      expect(reports).toHaveLength(1);
      expect(reports[0]!.data?.suggested).toBe("#plugins/define");
    });
  });

  describe("should allow shallow relative imports", () => {
    it("allows ./local imports", () => {
      const reports = runRule(
        "/project/packages/core/src/config/index.ts",
        'import { schema } from "./schema.ts";',
      );
      expect(reports).toHaveLength(0);
    });

    it("allows ../sibling imports (1 level up)", () => {
      const reports = runRule(
        "/project/packages/core/src/config/validators/index.ts",
        'import { base } from "../base.ts";',
      );
      expect(reports).toHaveLength(0);
    });

    it("allows ./subdir imports", () => {
      const reports = runRule(
        "/project/packages/core/src/workflow/index.ts",
        'import { orchestrator } from "./orchestrator/index.ts";',
      );
      expect(reports).toHaveLength(0);
    });
  });

  describe("should skip non-applicable files", () => {
    it("skips files outside packages/core/src", () => {
      const reports = runRule(
        "/project/packages/plugins/src/index.ts",
        'import { foo } from "../../core/src/config/index.ts";',
      );
      expect(reports).toHaveLength(0);
    });

    it("skips test fixtures", () => {
      const reports = runRule(
        "/project/packages/core/src/plugins/__tests__/fixtures/plugins/valid-plugin.ts",
        'import { definePlugin } from "../../../define.ts";',
      );
      // Fixtures are skipped
      expect(reports).toHaveLength(0);
    });
  });

  describe("should handle edge cases", () => {
    it("ignores non-relative imports", () => {
      const reports = runRule(
        "/project/packages/core/src/workflow/orchestrator/orchestrator.ts",
        'import { z } from "zod";',
      );
      expect(reports).toHaveLength(0);
    });

    it("ignores path alias imports", () => {
      const reports = runRule(
        "/project/packages/core/src/workflow/orchestrator/orchestrator.ts",
        'import { config } from "#config";',
      );
      expect(reports).toHaveLength(0);
    });

    it("handles imports without extensions", () => {
      const reports = runRule(
        "/project/packages/core/src/workflow/orchestrator/orchestrator.ts",
        'import { getConfig } from "../../config";',
      );
      expect(reports).toHaveLength(1);
      expect(reports[0]!.data?.suggested).toBe("#config");
    });
  });

  describe("autofix", () => {
    it("provides fix for deep relative imports", () => {
      const reports = runRule(
        "/project/packages/core/src/workflow/orchestrator/orchestrator.ts",
        'import { getConfig } from "../../config/index.ts";',
      );
      expect(reports).toHaveLength(1);
      expect(reports[0]!.fix).toBeDefined();

      // Simulate the fixer
      let fixResult: string | undefined;
      const fixer = {
        replaceText: (_node: any, text: string) => {
          fixResult = text;
          return { text };
        },
      };
      reports[0]!.fix!(fixer);
      expect(fixResult).toBe('"#config"');
    });

    it("preserves quote style in fix", () => {
      const context = createContext(
        "/project/packages/core/src/workflow/orchestrator/orchestrator.ts",
        "import { getConfig } from '../../config/index.ts';",
      );
      const visitor = rule.create(context);

      const node = {
        type: "ImportDeclaration",
        source: {
          value: "../../config/index.ts",
          raw: "'../../config/index.ts'",
        },
      };

      if (visitor.ImportDeclaration) {
        visitor.ImportDeclaration(node);
      }

      expect(context.reports).toHaveLength(1);

      let fixResult: string | undefined;
      const fixer = {
        replaceText: (_node: any, text: string) => {
          fixResult = text;
          return { text };
        },
      };
      context.reports[0]!.fix!(fixer);
      expect(fixResult).toBe("'#config'");
    });
  });

  describe("rule metadata", () => {
    it("has correct metadata", () => {
      expect(rule.meta.type).toBe("suggestion");
      expect(rule.meta.fixable).toBe("code");
      expect(rule.meta.messages.preferAlias).toBeDefined();
    });
  });
});
