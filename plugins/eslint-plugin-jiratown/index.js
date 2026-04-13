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
var KEBAB_CASE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$|^[a-z0-9]+(-[a-z0-9]+)*\.(ts|tsx|js|jsx|mjs|cjs)$/;
var ALLOWED_SPECIAL_FILES = new Set(["index.ts", "index.tsx", "index.js", "index.jsx"]);
var rule2 = {
  meta: {
    docs: {
      description: "Enforce kebab-case file naming convention. Jiratown convention: all files must use kebab-case (e.g., ticket-sidebar.tsx)."
    }
  },
  create(context) {
    const filename = path.basename(context.filename);
    if (ALLOWED_SPECIAL_FILES.has(filename)) {
      return {};
    }
    if (!KEBAB_CASE_PATTERN.test(filename)) {
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

// rules/prefer-composables-over-props.ts
var MAX_HANDLER_PROPS = 5;
var CONTEXT_SUGGESTION_THRESHOLD = 8;
var PRIMITIVE_COMPONENTS = new Set([
  "Button",
  "TextInput",
  "Select",
  "Checkbox",
  "Input",
  "Dialog",
  "Modal",
  "ChatBox"
]);
var rule4 = {
  meta: {
    docs: {
      description: "Prefer composables over excessive prop drilling. Warns when components receive too many handler props, suggesting extraction into a composable hook or Context."
    }
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const isTestFile = /\.test\.(ts|tsx|js|jsx)$/.test(filename);
    const isSandboxFile = filename.includes("/sandbox/");
    if (isTestFile || isSandboxFile)
      return {};
    let handlerPropCount = 0;
    const componentHandlers = new Map;
    function isHandlerPropName(name) {
      return name.startsWith("on") && name.length > 2 && name[2] === name[2].toUpperCase();
    }
    function getParentComponentName(node) {
      let current = node.parent;
      while (current) {
        if (current.type === "JSXOpeningElement" && current.name?.type === "JSXIdentifier") {
          return current.name.name;
        }
        current = current.parent;
      }
      return null;
    }
    function isCustomComponent(name) {
      return name && name[0] === name[0].toUpperCase() && !PRIMITIVE_COMPONENTS.has(name);
    }
    return {
      JSXAttribute(node) {
        if (node.name?.type === "JSXIdentifier" && isHandlerPropName(node.name.name)) {
          const componentName = getParentComponentName(node);
          if (componentName && PRIMITIVE_COMPONENTS.has(componentName)) {
            return;
          }
          handlerPropCount++;
          if (isCustomComponent(componentName)) {
            const count = componentHandlers.get(componentName) || 0;
            componentHandlers.set(componentName, count + 1);
          }
        }
      },
      "Program:exit"() {
        if (handlerPropCount > MAX_HANDLER_PROPS) {
          const drilledComponents = Array.from(componentHandlers.entries()).filter(([_, count]) => count >= 2).map(([name]) => name);
          let message = `Component has ${handlerPropCount} handler props (max: ${MAX_HANDLER_PROPS}). `;
          if (handlerPropCount >= CONTEXT_SUGGESTION_THRESHOLD || drilledComponents.length > 0) {
            message += "Consider using a Context to share handlers across descendant components, ";
            message += "or extract related handlers into a composable hook.";
            if (drilledComponents.length > 0) {
              message += ` Props are being drilled to: ${drilledComponents.join(", ")}.`;
            }
          } else {
            message += "Extract related handlers into a composable hook to reduce prop count.";
          }
          context.report({
            loc: { line: 1, column: 0 },
            message
          });
        }
      }
    };
  }
};
var prefer_composables_over_props_default = rule4;

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
var rule5 = {
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
var enforce_test_colocation_default = rule5;

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
    "prefer-composables-over-props": prefer_composables_over_props_default,
    "enforce-test-colocation": enforce_test_colocation_default
  }
};
var eslint_plugin_jiratown_default = plugin;
export {
  eslint_plugin_jiratown_default as default
};
