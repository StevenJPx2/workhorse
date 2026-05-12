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
var MAX_TEST_RATIO = 0.3;
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
      description: "Enforce test file colocation boundaries. When a folder has >2 files and the test-to-implementation ratio exceeds 30%, move tests to a __tests__/ directory. When a __tests__/ directory already exists, all test files in the same folder must be placed inside it."
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

// rules/no-single-use-variable.ts
var rule6 = {
  meta: {
    docs: {
      description: "Disallow variables that are declared and used exactly once in the same scope. Inline them instead."
    }
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filename)) {
      return {};
    }
    const declarations = new Map;
    const references = new Map;
    const reassigned = new Set;
    const exported = new Set;
    let currentScopeId = 0;
    const scopeStack = [0];
    function enterScope() {
      currentScopeId++;
      scopeStack.push(currentScopeId);
    }
    function exitScope() {
      scopeStack.pop();
    }
    function getCurrentScope() {
      return scopeStack[scopeStack.length - 1];
    }
    function makeKey(scopeId, name) {
      return `${scopeId}:${name}`;
    }
    function isSimpleIdentifier(node) {
      return node?.type === "Identifier";
    }
    function isInLoop(node) {
      let current = node;
      while (current.parent) {
        const parentType = current.parent.type;
        if (parentType === "ForStatement" || parentType === "ForInStatement" || parentType === "ForOfStatement" || parentType === "WhileStatement" || parentType === "DoWhileStatement") {
          return true;
        }
        current = current.parent;
      }
      return false;
    }
    function isExported(node) {
      return node.parent?.type === "ExportNamedDeclaration" || node.parent?.type === "ExportDefaultDeclaration";
    }
    function isDeclarationSite(node) {
      const parentType = node.parent?.type;
      return parentType === "VariableDeclarator" && node.parent?.id === node;
    }
    function isAssignmentTarget(node) {
      const parent = node.parent;
      if (!parent)
        return false;
      if (parent.type === "AssignmentExpression" && parent.left === node) {
        return true;
      }
      if (parent.type === "UpdateExpression") {
        return true;
      }
      return false;
    }
    function findDeclarationKey(name) {
      for (let i = scopeStack.length - 1;i >= 0; i--) {
        const key = makeKey(scopeStack[i], name);
        if (declarations.has(key)) {
          return key;
        }
      }
      return null;
    }
    return {
      FunctionDeclaration() {
        enterScope();
      },
      "FunctionDeclaration:exit"() {
        exitScope();
      },
      FunctionExpression() {
        enterScope();
      },
      "FunctionExpression:exit"() {
        exitScope();
      },
      ArrowFunctionExpression() {
        enterScope();
      },
      "ArrowFunctionExpression:exit"() {
        exitScope();
      },
      VariableDeclaration(node) {
        if (isExported(node)) {
          for (const declarator of node.declarations) {
            if (isSimpleIdentifier(declarator.id)) {
              exported.add(declarator.id.name);
            }
          }
          return;
        }
        if (isInLoop(node))
          return;
        for (const declarator of node.declarations) {
          if (!isSimpleIdentifier(declarator.id))
            continue;
          if (!declarator.init)
            continue;
          const name = declarator.id.name;
          const key = makeKey(getCurrentScope(), name);
          declarations.set(key, {
            node: declarator,
            scopeId: getCurrentScope(),
            name
          });
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
        const declKey = findDeclarationKey(name);
        if (!declKey)
          return;
        if (isDeclarationSite(node))
          return;
        if (isAssignmentTarget(node)) {
          reassigned.add(declKey);
          return;
        }
        if (node.parent?.type === "MemberExpression" && node.parent?.property === node && !node.parent?.computed) {
          return;
        }
        if (node.parent?.type === "Property" && node.parent?.key === node && !node.parent?.computed) {
          return;
        }
        if (node.parent?.type === "CallExpression" && node.parent?.callee === node) {
          return;
        }
        if (!references.has(declKey)) {
          references.set(declKey, []);
        }
        references.get(declKey).push({
          scopeId: getCurrentScope()
        });
      },
      "Program:exit"() {
        for (const [key, decl] of declarations) {
          if (exported.has(decl.name))
            continue;
          if (reassigned.has(key))
            continue;
          const refs = references.get(key) ?? [];
          if (refs.length !== 1)
            continue;
          const ref = refs[0];
          if (ref.scopeId !== decl.scopeId)
            continue;
          context.report({
            node: decl.node,
            message: `Variable "${decl.name}" is only used once. Inline it instead.`
          });
        }
      }
    };
  }
};
var no_single_use_variable_default = rule6;

// rules/enforce-barrel-exports.ts
import path4 from "path";
var rule7 = {
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
var enforce_barrel_exports_default = rule7;

// rules/no-index-imports.ts
var rule8 = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow explicit /index.ts imports. Use directory imports instead."
    },
    fixable: "code",
    messages: {
      noIndexImport: 'Import from directory instead of index file. Use "{{suggested}}" instead of "{{source}}"',
      useDotIndex: 'Use "./index" or "./index.ts" instead of "." for current directory imports'
    }
  },
  create(context) {
    const filename = context.filename;
    if (filename.includes("node_modules") || filename.includes("dist")) {
      return {};
    }
    function checkSource(node) {
      if (!node.source)
        return;
      const source = node.source.value;
      if (source === ".") {
        context.report({
          node: node.source,
          messageId: "useDotIndex",
          fix(fixer) {
            const raw = node.source.raw;
            const quote = raw[0];
            return fixer.replaceText(node.source, `${quote}./index${quote}`);
          }
        });
        return;
      }
      if (/^(?:\.\.\/)+index(\.tsx?|\.jsx?|\.mts|\.mjs)?$/.test(source)) {
        return;
      }
      if (/^\.\/index(\.tsx?|\.jsx?|\.mts|\.mjs)?$/.test(source)) {
        return;
      }
      const indexMatch = source.match(/^(.+)\/index(\.tsx?|\.jsx?|\.mts|\.mjs)?$/);
      if (indexMatch) {
        const suggested = indexMatch[1];
        context.report({
          node: node.source,
          messageId: "noIndexImport",
          data: { source, suggested },
          fix(fixer) {
            const raw = node.source.raw;
            const quote = raw[0];
            return fixer.replaceText(node.source, `${quote}${suggested}${quote}`);
          }
        });
      }
    }
    return {
      ImportDeclaration: checkSource,
      ExportNamedDeclaration: checkSource,
      ExportAllDeclaration: checkSource
    };
  }
};
var no_index_imports_default = rule8;

// rules/no-section-comments.ts
var rule9 = {
  meta: {
    docs: {
      description: "Disallow section divider comments (// --) and numbered step comments (// 1.). Replace with meaningful comments or remove."
    },
    fixable: "code"
  },
  create(context) {
    const sectionDividerPattern = /^-{2,}$/;
    const numberedStepPattern = /^\d+\.\s*/;
    const stepLabelPattern = /^step\s+\d+[:\s-]/i;
    const separatorPattern = /^[=#]{3,}/;
    return {
      Program() {
        const sourceCode = context.sourceCode;
        const comments = sourceCode.getAllComments?.() ?? [];
        for (const comment of comments) {
          if (comment.type !== "Line")
            continue;
          const text = comment.value.trim();
          let message = null;
          if (sectionDividerPattern.test(text)) {
            message = "Remove section divider comment. Use meaningful comments or whitespace instead.";
          } else if (numberedStepPattern.test(text)) {
            message = "Remove numbered step comment. Code should be self-documenting or use descriptive comments.";
          } else if (stepLabelPattern.test(text)) {
            message = "Remove step label comment. Code should be self-documenting or use descriptive comments.";
          } else if (separatorPattern.test(text)) {
            message = "Remove section separator comment. Use whitespace to separate logical sections.";
          }
          if (message) {
            context.report({
              node: comment,
              message,
              fix(fixer) {
                const start = comment.range[0];
                const end = comment.range[1];
                const sourceText = sourceCode.text;
                let removeStart = start;
                let removeEnd = end;
                while (removeStart > 0 && /[ \t]/.test(sourceText[removeStart - 1])) {
                  removeStart--;
                }
                if (sourceText[removeEnd] === `
`) {
                  removeEnd++;
                } else if (sourceText[removeEnd] === "\r" && sourceText[removeEnd + 1] === `
`) {
                  removeEnd += 2;
                }
                return fixer.removeRange([removeStart, removeEnd]);
              }
            });
          }
        }
      }
    };
  }
};
var no_section_comments_default = rule9;

// rules/no-reexport-outside-barrel.ts
import path5 from "path";
var rule10 = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow re-exports outside of barrel (index) files. Re-exports should only be in index.ts files."
    },
    fixable: "code",
    messages: {
      noReexport: 'Re-export from "{{source}}" should be in a barrel file (index.ts), not in {{filename}}. Move this to the nearest index.ts or remove it.',
      noReexportNamespace: 'Namespace re-export from "{{source}}" should be in a barrel file (index.ts), not in {{filename}}.'
    }
  },
  create(context) {
    const filename = context.filename;
    const basename = path5.basename(filename);
    const ext = path5.extname(filename);
    if (ext !== ".ts" && ext !== ".tsx") {
      return {};
    }
    if (filename.includes("node_modules") || filename.includes("dist")) {
      return {};
    }
    const nameWithoutExt = basename.replace(ext, "");
    if (nameWithoutExt === "index") {
      return {};
    }
    if (/\.(test|spec)\.(ts|tsx)$/.test(filename)) {
      return {};
    }
    function checkExport(node) {
      if (!node.source) {
        return;
      }
      const source = node.source.value;
      const specifiers = [];
      let isTypeOnly = false;
      if (node.specifiers) {
        for (const spec of node.specifiers) {
          const name = spec.exported?.name ?? spec.local?.name ?? "unknown";
          specifiers.push(name);
        }
        isTypeOnly = node.exportKind === "type";
      }
      const shortFilename = basename;
      context.report({
        node,
        messageId: "noReexport",
        data: {
          source,
          filename: shortFilename,
          specifiers: specifiers.join(", ")
        },
        fix(fixer) {
          const sourceCode = context.sourceCode ?? context.getSourceCode();
          const sourceText = sourceCode.text;
          let start = node.range[0];
          let end = node.range[1];
          while (start > 0 && /[ \t]/.test(sourceText[start - 1])) {
            start--;
          }
          if (sourceText[end] === `
`) {
            end++;
          } else if (sourceText[end] === "\r" && sourceText[end + 1] === `
`) {
            end += 2;
          }
          if (sourceText[end] === `
`) {
            let checkPos = start - 1;
            while (checkPos >= 0 && /[ \t]/.test(sourceText[checkPos])) {
              checkPos--;
            }
            if (checkPos >= 0 && sourceText[checkPos] === `
`) {
              end++;
            }
          }
          return fixer.removeRange([start, end]);
        }
      });
    }
    function checkExportAll(node) {
      if (!node.source) {
        return;
      }
      const source = node.source.value;
      const shortFilename = basename;
      context.report({
        node,
        messageId: "noReexportNamespace",
        data: {
          source,
          filename: shortFilename
        },
        fix(fixer) {
          const sourceCode = context.sourceCode ?? context.getSourceCode();
          const sourceText = sourceCode.text;
          let start = node.range[0];
          let end = node.range[1];
          while (start > 0 && /[ \t]/.test(sourceText[start - 1])) {
            start--;
          }
          if (sourceText[end] === `
`) {
            end++;
          } else if (sourceText[end] === "\r" && sourceText[end + 1] === `
`) {
            end += 2;
          }
          return fixer.removeRange([start, end]);
        }
      });
    }
    return {
      ExportNamedDeclaration: checkExport,
      ExportAllDeclaration: checkExportAll
    };
  }
};
var no_reexport_outside_barrel_default = rule10;

// rules/utils.ts
import path6 from "path";
function parseFileContext(filename) {
  const basename = path6.basename(filename);
  const ext = path6.extname(filename);
  const nameWithoutExt = basename.replace(ext, "");
  const dirname = path6.dirname(filename);
  return {
    filename,
    basename,
    ext,
    nameWithoutExt,
    dirname
  };
}
function shouldSkipFile(ctx) {
  if (ctx.ext !== ".ts" && ctx.ext !== ".tsx") {
    return true;
  }
  if (ctx.filename.includes("node_modules") || ctx.filename.includes("dist")) {
    return true;
  }
  return false;
}
function isIndexFile(ctx) {
  return ctx.nameWithoutExt === "index";
}

// rules/prefer-folder-barrel.ts
var rule11 = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Suggest converting non-index barrel files to folder structure with index.ts"
    },
    messages: {
      preferFolderBarrel: 'File "{{filename}}" only contains re-exports from sibling files. Convert to folder: {{folderName}}/index.ts with source files moved inside.'
    }
  },
  create(context) {
    const ctx = parseFileContext(context.filename);
    if (isIndexFile(ctx) || shouldSkipFile(ctx)) {
      return {};
    }
    let hasSiblingReExports = false;
    let hasNonSiblingReExports = false;
    let hasOtherStatements = false;
    let programNode = null;
    function isSiblingImport(source) {
      if (!source.startsWith("./"))
        return false;
      const rest = source.slice(2);
      return !rest.includes("/");
    }
    return {
      Program(node) {
        programNode = node;
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          const source = node.source.value;
          if (isSiblingImport(source)) {
            hasSiblingReExports = true;
          } else {
            hasNonSiblingReExports = true;
          }
        } else if (node.declaration) {
          hasOtherStatements = true;
        }
      },
      ExportAllDeclaration(node) {
        const source = node.source?.value ?? "";
        if (isSiblingImport(source)) {
          hasSiblingReExports = true;
        } else {
          hasNonSiblingReExports = true;
        }
      },
      VariableDeclaration(_node) {
        hasOtherStatements = true;
      },
      FunctionDeclaration(_node) {
        hasOtherStatements = true;
      },
      ClassDeclaration(_node) {
        hasOtherStatements = true;
      },
      TSTypeAliasDeclaration(_node) {
        hasOtherStatements = true;
      },
      TSInterfaceDeclaration(_node) {
        hasOtherStatements = true;
      },
      TSEnumDeclaration(_node) {
        hasOtherStatements = true;
      },
      ImportDeclaration(_node) {},
      "Program:exit"(_node) {
        if (hasSiblingReExports && !hasNonSiblingReExports && !hasOtherStatements && programNode) {
          context.report({
            node: programNode,
            messageId: "preferFolderBarrel",
            data: {
              filename: ctx.basename,
              folderName: ctx.nameWithoutExt
            }
          });
        }
      }
    };
  }
};
var prefer_folder_barrel_default = rule11;

// rules/prefer-path-alias.ts
var PATH_ALIASES = {
  "#bootstrap": "src/bootstrap.ts",
  "#config": "src/config/index.ts",
  "#context": "src/context/index.ts",
  "#db": "src/db/index.ts",
  "#lib/git": "src/lib/git/index.ts",
  "#lib/hooks": "src/lib/hooks/index.ts",
  "#plugins": "src/plugins/index.ts",
  "#services/memory": "src/services/memory/index.ts",
  "#services/monitor": "src/services/monitor/index.ts",
  "#workflow/orchestrator": "src/workflow/orchestrator/index.ts",
  "#workflow/steering": "src/workflow/steering/index.ts",
  "#workflow/tracker": "src/workflow/tracker/index.ts"
};
function buildAliasLookup() {
  const lookup = new Map;
  for (const [alias, targetPath] of Object.entries(PATH_ALIASES)) {
    const match = targetPath.match(/^src\/(.+?)(?:\/index)?\.ts$/);
    if (match) {
      lookup.set(match[1], alias);
    }
  }
  return lookup;
}
var ALIAS_LOOKUP = buildAliasLookup();
function countParentTraversals(importPath) {
  const matches = importPath.match(/\.\.\//g);
  return matches ? matches.length : 0;
}
function resolveImportPath(filename, importPath) {
  const srcIndex = filename.indexOf("/src/");
  if (srcIndex === -1)
    return null;
  const relativeToSrc = filename.slice(srcIndex + 5);
  const dirParts = relativeToSrc.split("/").slice(0, -1);
  const importParts = importPath.split("/");
  const resultParts = [...dirParts];
  for (const part of importParts) {
    if (part === "..") {
      if (resultParts.length === 0)
        return null;
      resultParts.pop();
    } else if (part !== ".") {
      resultParts.push(part);
    }
  }
  let result = resultParts.join("/");
  result = result.replace(/\.(tsx?|jsx?|mts|mjs)$/, "");
  result = result.replace(/\/index$/, "");
  return result;
}
function findMatchingAlias(resolvedPath) {
  if (ALIAS_LOOKUP.has(resolvedPath)) {
    return { alias: ALIAS_LOOKUP.get(resolvedPath), suffix: "" };
  }
  const parts = resolvedPath.split("/");
  for (let i = parts.length - 1;i >= 1; i--) {
    const prefix = parts.slice(0, i).join("/");
    if (ALIAS_LOOKUP.has(prefix)) {
      const suffix = parts.slice(i).join("/");
      return { alias: ALIAS_LOOKUP.get(prefix), suffix: "/" + suffix };
    }
  }
  return null;
}
var rule12 = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer path aliases over deep relative imports (2+ parent traversals)"
    },
    fixable: "code",
    messages: {
      preferAlias: 'Use path alias "{{suggested}}" instead of deep relative import "{{source}}"'
    }
  },
  create(context) {
    const filename = context.filename;
    if (!filename.includes("packages/core/src")) {
      return {};
    }
    if (filename.includes("__tests__/fixtures")) {
      return {};
    }
    function checkSource(node) {
      if (!node.source)
        return;
      const source = node.source.value;
      if (!source.startsWith(".")) {
        return;
      }
      const traversals = countParentTraversals(source);
      if (traversals < 2) {
        return;
      }
      const resolvedPath = resolveImportPath(filename, source);
      if (!resolvedPath) {
        return;
      }
      const match = findMatchingAlias(resolvedPath);
      if (!match) {
        return;
      }
      const suggested = match.alias + match.suffix;
      context.report({
        node: node.source,
        messageId: "preferAlias",
        data: { source, suggested },
        fix(fixer) {
          const raw = node.source.raw;
          const quote = raw[0];
          return fixer.replaceText(node.source, `${quote}${suggested}${quote}`);
        }
      });
    }
    return {
      ImportDeclaration: checkSource,
      ExportNamedDeclaration: checkSource,
      ExportAllDeclaration: checkSource
    };
  }
};
var prefer_path_alias_default = rule12;

// rules/prefer-then-chain.ts
var rule13 = {
  meta: {
    docs: {
      description: "Prefer .then() chains over parenthesized await expressions. Use `await foo().then(r => r[0])` instead of `(await foo())[0]`."
    },
    fixable: "code"
  },
  create(context) {
    function getOperationSuffix(parent, childNode) {
      const sourceCode = context.sourceCode;
      switch (parent.type) {
        case "MemberExpression": {
          if (parent.object !== childNode)
            return null;
          if (parent.computed) {
            const propText = sourceCode.getText(parent.property);
            return `[${propText}]`;
          } else {
            const propText = sourceCode.getText(parent.property);
            return `.${propText}`;
          }
        }
        case "TSNonNullExpression": {
          return "!";
        }
        case "TSAsExpression": {
          const typeAnnotation = sourceCode.getText(parent.typeAnnotation);
          return ` as ${typeAnnotation}`;
        }
        case "TSSatisfiesExpression": {
          const typeAnnotation = sourceCode.getText(parent.typeAnnotation);
          return ` satisfies ${typeAnnotation}`;
        }
        default:
          return null;
      }
    }
    function getNullishDefault(parent, childNode) {
      if (parent?.type !== "LogicalExpression")
        return null;
      if (parent.left !== childNode)
        return null;
      if (parent.operator !== "??" && parent.operator !== "||")
        return null;
      const sourceCode = context.sourceCode;
      const rightText = sourceCode.getText(parent.right);
      return ` ${parent.operator} ${rightText}`;
    }
    function buildOperationChain(startNode, awaitNode) {
      let current = startNode;
      let chain = "";
      while (current) {
        const suffix = getOperationSuffix(current, current === startNode ? awaitNode : current);
        if (suffix === null) {
          const parent = current.parent;
          if (!parent)
            break;
          const parentSuffix = getOperationSuffix(parent, current);
          if (parentSuffix === null)
            break;
          chain += parentSuffix;
          if (parent.type === "MemberExpression" && parent.parent?.type === "CallExpression" && parent.parent.callee === parent) {
            const callNode = parent.parent;
            const args = callNode.arguments.map((arg) => context.sourceCode.getText(arg)).join(", ");
            chain += `(${args})`;
            current = callNode;
          } else {
            current = parent;
          }
        } else {
          chain += suffix;
          if (current.type === "MemberExpression" && current.parent?.type === "CallExpression" && current.parent.callee === current) {
            const callNode = current.parent;
            const args = callNode.arguments.map((arg) => context.sourceCode.getText(arg)).join(", ");
            chain += `(${args})`;
            current = callNode;
          }
          const parent = current.parent;
          if (!parent)
            break;
          const nextSuffix = getOperationSuffix(parent, current);
          if (nextSuffix === null)
            break;
          current = parent;
        }
      }
      if (!chain)
        return null;
      const nullishDefault = getNullishDefault(current.parent, current);
      if (nullishDefault) {
        chain += nullishDefault;
        current = current.parent;
      }
      return { chain, outerNode: current };
    }
    function checkAwaitExpression(node) {
      const parent = node.parent;
      if (!parent)
        return;
      const operationTypes = [
        "MemberExpression",
        "TSNonNullExpression",
        "TSAsExpression",
        "TSSatisfiesExpression"
      ];
      if (!operationTypes.includes(parent.type))
        return;
      if (parent.type === "MemberExpression" && parent.object !== node)
        return;
      const result = buildOperationChain(parent, node);
      if (!result)
        return;
      const { chain, outerNode } = result;
      const sourceCode = context.sourceCode;
      const awaitedExpr = sourceCode.getText(node.argument);
      context.report({
        node: outerNode,
        message: `Prefer .then() chain over parenthesized await. Use \`await ${awaitedExpr}.then((r) => r${chain})\` instead.`,
        fix(fixer) {
          const fixedCode = `await ${awaitedExpr}.then((r) => r${chain})`;
          return fixer.replaceText(outerNode, fixedCode);
        }
      });
    }
    return {
      AwaitExpression: checkAwaitExpression
    };
  }
};
var prefer_then_chain_default = rule13;

// rules/no-cascading-ternary.ts
var rule14 = {
  meta: {
    docs: {
      description: "Disallow cascading ternary expressions. Use object maps or switch statements instead for better readability."
    },
    schema: [
      {
        type: "object",
        properties: {
          maxDepth: {
            type: "number",
            minimum: 1,
            default: 1
          }
        },
        additionalProperties: false
      }
    ]
  },
  create(context) {
    const options = context.options[0] ?? {};
    const maxDepth = options.maxDepth ?? 1;
    const reported = new WeakSet;
    function getTernaryDepth(node, depth = 1) {
      if (node.type !== "ConditionalExpression") {
        return depth - 1;
      }
      const consequentDepth = node.consequent?.type === "ConditionalExpression" ? getTernaryDepth(node.consequent, depth + 1) : depth;
      const alternateDepth = node.alternate?.type === "ConditionalExpression" ? getTernaryDepth(node.alternate, depth + 1) : depth;
      return Math.max(consequentDepth, alternateDepth);
    }
    function findRootTernary(node) {
      let current = node;
      while (current.parent?.type === "ConditionalExpression") {
        current = current.parent;
      }
      return current;
    }
    return {
      ConditionalExpression(node) {
        const root = findRootTernary(node);
        if (node !== root)
          return;
        if (reported.has(root))
          return;
        const depth = getTernaryDepth(root);
        if (depth > maxDepth) {
          reported.add(root);
          const suggestion = depth >= 3 ? "Consider using an object map or switch statement for complex conditional logic." : "Consider using an object map or switch statement instead of nested ternaries.";
          context.report({
            node: root,
            message: `Cascading ternary expression (${depth} levels deep). ${suggestion}`
          });
        }
      }
    };
  }
};
var no_cascading_ternary_default = rule14;

// index.ts
var plugin = {
  meta: {
    name: "eslint-plugin-workhorse",
    version: "1.0.0"
  },
  rules: {
    "max-lines-per-file": max_lines_per_file_default,
    "enforce-kebab-case-filenames": enforce_kebab_case_filenames_default,
    "enforce-colocated-exports": enforce_colocated_exports_default,
    "enforce-test-colocation": enforce_test_colocation_default,
    "no-single-reference-function": no_single_reference_function_default,
    "no-single-use-variable": no_single_use_variable_default,
    "enforce-barrel-exports": enforce_barrel_exports_default,
    "no-index-imports": no_index_imports_default,
    "no-section-comments": no_section_comments_default,
    "no-reexport-outside-barrel": no_reexport_outside_barrel_default,
    "prefer-folder-barrel": prefer_folder_barrel_default,
    "prefer-path-alias": prefer_path_alias_default,
    "prefer-then-chain": prefer_then_chain_default,
    "no-cascading-ternary": no_cascading_ternary_default
  }
};
var eslint_plugin_workhorse_default = plugin;
export {
  eslint_plugin_workhorse_default as default
};
