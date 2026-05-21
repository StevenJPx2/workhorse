// Reports variables that are only used once in the same scope.
// If a variable is declared and used exactly once, the value should be inlined.
//
// Applies to:
//   - const declarations: const foo = expr; ... useFoo(foo);
//   - let declarations:   let foo = expr; ... useFoo(foo);
//
// Skips:
//   - Test files (*.test.ts, *.spec.ts) - single-use variables often improve readability
//   - Variables used more than once
//   - Variables used in a different scope (closures)
//   - Destructuring patterns (const { a, b } = obj)
//   - Variables that are reassigned (let x = 1; x = 2; use(x))
//   - Loop variables (for, while)
//   - Exported variables
//   - Function parameters

interface DeclInfo {
  node: unknown;
  scopeId: number;
  name: string;
}

const rule = {
  meta: {
    docs: {
      description:
        "Disallow variables that are declared and used exactly once in the same scope. Inline them instead.",
    },
  },

  create(context) {
    // Skip test files - single-use variables often improve readability in tests
    const filename = context.filename ?? context.getFilename?.() ?? "";
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filename)) {
      return {};
    }

    // Track variable declarations using composite key (scopeId:name)
    const declarations = new Map<string, DeclInfo>();
    // Track all references to variables using composite key
    const references = new Map<string, { scopeId: number }[]>();
    // Track reassigned variables (by composite key)
    const reassigned = new Set<string>();
    // Track exported variable names
    const exported = new Set<string>();
    // Scope tracking
    let currentScopeId = 0;
    const scopeStack: number[] = [0];

    function enterScope() {
      currentScopeId++;
      scopeStack.push(currentScopeId);
    }

    function exitScope() {
      scopeStack.pop();
    }

    function getCurrentScope() {
      return scopeStack[scopeStack.length - 1]!;
    }

    function makeKey(scopeId: number, name: string) {
      return `${scopeId}:${name}`;
    }

    function isSimpleIdentifier(node) {
      return node?.type === "Identifier";
    }

    function isInLoop(node) {
      let current = node;
      while (current.parent) {
        const parentType = current.parent.type;
        if (
          parentType === "ForStatement" ||
          parentType === "ForInStatement" ||
          parentType === "ForOfStatement" ||
          parentType === "WhileStatement" ||
          parentType === "DoWhileStatement"
        ) {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    function isExported(node) {
      return (
        node.parent?.type === "ExportNamedDeclaration" ||
        node.parent?.type === "ExportDefaultDeclaration"
      );
    }

    function isDeclarationSite(node) {
      const parentType = node.parent?.type;
      return parentType === "VariableDeclarator" && node.parent?.id === node;
    }

    function isAssignmentTarget(node) {
      const parent = node.parent;
      if (!parent) return false;

      // Direct assignment: x = value
      if (parent.type === "AssignmentExpression" && parent.left === node) {
        return true;
      }
      // Update expression: x++, ++x
      if (parent.type === "UpdateExpression") {
        return true;
      }
      return false;
    }

    // Find which declaration scope a variable reference belongs to
    function findDeclarationKey(name: string): string | null {
      // Look up the scope stack from current to root
      for (let i = scopeStack.length - 1; i >= 0; i--) {
        const key = makeKey(scopeStack[i]!, name);
        if (declarations.has(key)) {
          return key;
        }
      }
      return null;
    }

    return {
      // Track scope entry
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

      // Track variable declarations
      VariableDeclaration(node) {
        if (isExported(node)) {
          for (const declarator of node.declarations) {
            if (isSimpleIdentifier(declarator.id)) {
              exported.add(declarator.id.name);
            }
          }
          return;
        }

        if (isInLoop(node)) return;

        for (const declarator of node.declarations) {
          // Skip destructuring patterns
          if (!isSimpleIdentifier(declarator.id)) continue;
          // Skip declarations without initializers (let x;)
          if (!declarator.init) continue;

          const name = declarator.id.name;
          const key = makeKey(getCurrentScope(), name);
          declarations.set(key, {
            node: declarator,
            scopeId: getCurrentScope(),
            name,
          });
        }
      },

      // Track export specifiers
      ExportNamedDeclaration(node) {
        for (const specifier of node.specifiers ?? []) {
          if (specifier.local?.name) exported.add(specifier.local.name);
        }
      },

      // Track all identifier references
      Identifier(node) {
        const name = node.name;

        // Find the declaration this identifier refers to
        const declKey = findDeclarationKey(name);
        if (!declKey) return;

        // Skip declaration site
        if (isDeclarationSite(node)) return;

        // Track reassignments
        if (isAssignmentTarget(node)) {
          reassigned.add(declKey);
          return;
        }

        // Skip property access (obj.foo)
        if (
          node.parent?.type === "MemberExpression" &&
          node.parent?.property === node &&
          !node.parent?.computed
        ) {
          return;
        }

        // Skip object property keys
        if (
          node.parent?.type === "Property" &&
          node.parent?.key === node &&
          !node.parent?.computed
        ) {
          return;
        }

        // Skip function callee position (fn() — fn is not a variable reference we care about)
        if (
          node.parent?.type === "CallExpression" &&
          node.parent?.callee === node
        ) {
          return;
        }

        if (!references.has(declKey)) {
          references.set(declKey, []);
        }
        references.get(declKey)!.push({
          scopeId: getCurrentScope(),
        });
      },

      "Program:exit"() {
        for (const [key, decl] of declarations) {
          // Skip exported variables
          if (exported.has(decl.name)) continue;

          // Skip reassigned variables
          if (reassigned.has(key)) continue;

          const refs = references.get(key) ?? [];

          // Must have exactly one reference
          if (refs.length !== 1) continue;

          const ref = refs[0]!;

          // Must be in the same scope
          if (ref.scopeId !== decl.scopeId) continue;

          context.report({
            node: decl.node,
            message: `Variable "${decl.name}" is only used once. Inline it instead.`,
          });
        }
      },
    };
  },
};

export default rule;
