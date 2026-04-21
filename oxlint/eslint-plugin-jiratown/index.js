// @bun
// rules/max-lines-per-file.ts
var rule = {
  meta: {
    docs: {
      description: "Enforce maximum line count per file. Jiratown convention: files must not exceed 200 lines."
    },
    schema: [
      {
        type: "number",
        default: 200
      }
    ]
  },
  create(context) {
    const maxLines = context.options?.[0] ?? 200;
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const isTestFile = /\.test\.(ts|tsx|js|jsx)$/.test(filename);
    const effectiveMax = isTestFile ? 500 : maxLines;
    return {
      Program(node) {
        const sourceCode = context.sourceCode;
        const lineCount = sourceCode.lines.length;
        if (lineCount > effectiveMax) {
          context.report({
            node,
            message: `File has ${lineCount} lines (max: ${effectiveMax}${isTestFile ? " for test files" : ""}). Split into smaller modules.`
          });
        }
      }
    };
  }
};
var max_lines_per_file_default = rule;

// rules/enforce-kebab-case-filenames.ts
import path from "path";
function hasUpperCase(filename) {
  const name = filename.replace(/\.[^.]+$/, "");
  return /[A-Z]/.test(name);
}
var ALLOWED_SPECIAL_FILES = new Set(["index.ts", "index.tsx", "index.js", "index.jsx"]);
var rule2 = {
  meta: {
    docs: {
      description: "Enforce kebab-case file naming convention. Jiratown convention: all files must use kebab-case (e.g., my-module.ts)."
    }
  },
  create(context) {
    const filename = path.basename(context.filename);
    if (ALLOWED_SPECIAL_FILES.has(filename)) {
      return {};
    }
    if (hasUpperCase(filename)) {
      const suggested = filename.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "").replace(/\.+/g, ".");
      context.report({
        loc: { line: 1, column: 0 },
        message: `Filename "${filename}" must use kebab-case. Suggested: "${suggested}"`
      });
    }
    return {};
  }
};
var enforce_kebab_case_filenames_default = rule2;

// rules/enforce-colocated-exports.ts
import fs from "fs";
import path2 from "path";
var SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
var rule3 = {
  meta: {
    docs: {
      description: "Enforce colocated folder structure. Folders with multiple source files must have an index.ts for re-exports."
    }
  },
  create(context) {
    const filename = context.filename;
    const dirname = path2.dirname(filename);
    if (filename.includes("node_modules") || filename.includes("dist")) {
      return {};
    }
    const basename = path2.basename(filename);
    if (basename !== "index.ts" && basename !== "index.tsx") {
      return {};
    }
    try {
      const entries = fs.readdirSync(dirname);
      const sourceFiles = entries.filter((e) => SOURCE_EXTENSIONS.has(path2.extname(e)) && !e.endsWith(".test.ts") && !e.endsWith(".test.tsx"));
      const hasIndex = entries.includes("index.ts") || entries.includes("index.tsx");
      if (sourceFiles.length > 1 && !hasIndex) {
        context.report({
          loc: { line: 1, column: 0 },
          message: `Folder "${path2.basename(dirname)}" has ${sourceFiles.length} source files but no index.ts. Add an index.ts for colocated exports.`
        });
      }
    } catch {}
    return {};
  }
};
var enforce_colocated_exports_default = rule3;

// rules/enforce-test-colocation.ts
import fs2 from "fs";
import path3 from "path";
var IMPLEMENTATION_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
var TEST_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"];
var MIN_FILES_THRESHOLD = 2;
var MAX_TEST_RATIO = 0.4;
function isTestFile(filename) {
  return TEST_SUFFIXES.some((suffix) => filename.endsWith(suffix));
}
function isImplementationFile(filename) {
  const ext = path3.extname(filename);
  if (!IMPLEMENTATION_EXTENSIONS.has(ext))
    return false;
  return !isTestFile(filename);
}
var rule4 = {
  meta: {
    docs: {
      description: "Enforce test file colocation boundaries. When a folder has >2 files and the test-to-implementation ratio exceeds 40%, move tests to a __tests__/ directory. When a __tests__/ directory already exists, all test files in the same folder must be placed inside it."
    }
  },
  create(context) {
    const filename = context.filename;
    if (filename.includes("node_modules") || filename.includes("dist") || filename.includes("__tests__")) {
      return {};
    }
    try {
      const dirname = path3.dirname(filename);
      const entries = fs2.readdirSync(dirname);
      if (isTestFile(path3.basename(filename))) {
        const hasTestsDir = entries.some((entry) => entry === "__tests__" && fs2.statSync(path3.join(dirname, entry)).isDirectory());
        if (hasTestsDir) {
          context.report({
            loc: { line: 1, column: 0 },
            message: `A __tests__/ directory already exists in "${path3.basename(dirname)}". Move this test file inside __tests__/ instead.`
          });
          return {};
        }
      }
      const implFiles = entries.filter(isImplementationFile);
      const testFiles = entries.filter(isTestFile);
      const totalSourceFiles = implFiles.length + testFiles.length;
      if (totalSourceFiles <= MIN_FILES_THRESHOLD) {
        return {};
      }
      if (testFiles.length === 0) {
        return {};
      }
      const testRatio = testFiles.length / totalSourceFiles;
      if (testRatio > MAX_TEST_RATIO) {
        context.report({
          loc: { line: 1, column: 0 },
          message: `Folder "${path3.basename(dirname)}" has ${testFiles.length} test files out of ${totalSourceFiles} total (${Math.round(testRatio * 100)}% test ratio, max: ${Math.round(MAX_TEST_RATIO * 100)}%). Move tests to a __tests__/ directory.`
        });
      }
    } catch {}
    return {};
  }
};
var enforce_test_colocation_default = rule4;

// rules/no-single-reference-function.ts
var rule5 = {
  meta: {
    docs: {
      description: "Disallow non-exported functions that are only referenced in a single place. Inline them instead."
    }
  },
  create(context) {
    const functions = new Map;
    const exported = new Set;
    function isTopLevelNode(node) {
      return node.parent?.type === "Program";
    }
    function isExported(node) {
      return node.parent?.type === "ExportNamedDeclaration" || node.parent?.type === "ExportDefaultDeclaration";
    }
    function isDeclarationSite(node) {
      const parentType = node.parent?.type;
      return parentType === "FunctionDeclaration" && node.parent?.id === node || parentType === "VariableDeclarator" && node.parent?.id === node;
    }
    function isPropertyAccess(node) {
      const parentType = node.parent?.type;
      if (parentType === "MemberExpression" && node.parent?.property === node && !node.parent?.computed) {
        return true;
      }
      if (parentType === "Property" && node.parent?.key === node && !node.parent?.computed) {
        return true;
      }
      return false;
    }
    return {
      FunctionDeclaration(node) {
        if (!node.id)
          return;
        const name = node.id.name;
        if (isExported(node)) {
          exported.add(name);
          return;
        }
        if (node.parent?.type !== "Program")
          return;
        functions.set(name, { node, count: 0 });
      },
      VariableDeclaration(node) {
        if (!isTopLevelNode(node))
          return;
        if (isExported(node)) {
          for (const declarator of node.declarations) {
            if (declarator.id?.type === "Identifier") {
              exported.add(declarator.id.name);
            }
          }
          return;
        }
        for (const declarator of node.declarations) {
          if (declarator.id?.type === "Identifier" && (declarator.init?.type === "ArrowFunctionExpression" || declarator.init?.type === "FunctionExpression")) {
            functions.set(declarator.id.name, { node: declarator, count: 0 });
          }
        }
      },
      ExportNamedDeclaration(node) {
        for (const specifier of node.specifiers ?? []) {
          if (specifier.local?.name)
            exported.add(specifier.local.name);
        }
      },
      Identifier(node) {
        const name = node.name;
        if (!functions.has(name))
          return;
        if (isDeclarationSite(node))
          return;
        if (isPropertyAccess(node))
          return;
        const entry = functions.get(name);
        entry.count++;
      },
      "Program:exit"() {
        for (const [name, { node, count }] of functions) {
          if (exported.has(name))
            continue;
          if (count === 1) {
            context.report({
              node,
              message: `Function "${name}" is only used once. Inline it at the call site.`
            });
          }
        }
      }
    };
  }
};
var no_single_reference_function_default = rule5;

// rules/enforce-barrel-exports.ts
import path4 from "path";
var rule6 = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce that index files re-exporting other barrels use `export *` instead of selective exports"
    },
    messages: {
      useExportStar: 'Use `export * from "{{source}}"` when re-exporting from another barrel (index file)'
    }
  },
  create(context) {
    const filename = context.filename;
    const basename = path4.basename(filename);
    if (basename !== "index.ts" && basename !== "index.tsx") {
      return {};
    }
    if (filename.includes("node_modules") || filename.includes("dist")) {
      return {};
    }
    return {
      ExportNamedDeclaration(node) {
        if (!node.source)
          return;
        const source = node.source.value;
        if (isBarrelImport(source)) {
          context.report({
            node,
            messageId: "useExportStar",
            data: { source }
          });
        }
      }
    };
  }
};
function isBarrelImport(source) {
  if (/\/index(\.tsx?|\.jsx?)?$/.test(source)) {
    return true;
  }
  if (source.endsWith("/")) {
    return true;
  }
  return false;
}
var enforce_barrel_exports_default = rule6;

// index.ts
var plugin = {
  meta: {
    name: "eslint-plugin-jiratown",
    version: "1.0.0"
  },
  rules: {
    "max-lines-per-file": max_lines_per_file_default,
    "enforce-kebab-case-filenames": enforce_kebab_case_filenames_default,
    "enforce-colocated-exports": enforce_colocated_exports_default,
    "enforce-test-colocation": enforce_test_colocation_default,
    "no-single-reference-function": no_single_reference_function_default,
    "enforce-barrel-exports": enforce_barrel_exports_default
  }
};
var eslint_plugin_jiratown_default = plugin;
export {
  eslint_plugin_jiratown_default as default
};
