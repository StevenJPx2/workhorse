// Reports non-exported functions that are only used in a single place.
// If a function is only called once, it should be inlined at the call site.
//
// Applies to:
//   - function declarations:           function foo() {}
//   - const arrow / function exprs:    const foo = () => {}
//                                      const foo = function() {}
//
// Skips:
//   - exported declarations (export function / export const)
//   - 0-reference functions (handled by no-unused-vars)
//   - functions defined inside other functions (not top-level)
//   - default exports

const rule = {
  meta: {
    docs: {
      description:
        "Disallow non-exported functions that are only referenced in a single place. Inline them instead.",
    },
  },

  create(context) {
    // Map from function name → { declarationNode, referenceCount }
    const functions = new Map<string, { node: unknown; count: number }>();
    // Names that are exported — exempt from the rule
    const exported = new Set<string>();

    function isTopLevelNode(node) {
      return node.parent?.type === "Program";
    }

    function isExported(node) {
      return (
        node.parent?.type === "ExportNamedDeclaration" ||
        node.parent?.type === "ExportDefaultDeclaration"
      );
    }

    return {
      // function foo() {}
      FunctionDeclaration(node) {
        if (!node.id) return;
        const name = node.id.name;
        if (isExported(node)) {
          exported.add(name);
          return;
        }
        // Only track top-level (parent is Program or ExportNamedDeclaration already handled)
        if (node.parent?.type !== "Program") return;
        functions.set(name, { node, count: 0 });
      },

      // const foo = () => {} or const foo = function() {}
      VariableDeclaration(node) {
        if (!isTopLevelNode(node)) return;
        if (isExported(node)) {
          // Mark all declared names as exported
          for (const declarator of node.declarations) {
            if (declarator.id?.type === "Identifier") {
              exported.add(declarator.id.name);
            }
          }
          return;
        }
        for (const declarator of node.declarations) {
          if (
            declarator.id?.type === "Identifier" &&
            (declarator.init?.type === "ArrowFunctionExpression" ||
              declarator.init?.type === "FunctionExpression")
          ) {
            functions.set(declarator.id.name, { node: declarator, count: 0 });
          }
        }
      },

      // export { foo } — mark as exported after the fact
      ExportNamedDeclaration(node) {
        for (const specifier of node.specifiers ?? []) {
          if (specifier.local?.name) exported.add(specifier.local.name);
        }
      },

      // Count every Identifier reference that isn't the declaration itself
      Identifier(node) {
        const name = node.name;
        if (!functions.has(name)) return;

        const parentType = node.parent?.type;

        // Skip: the declaration site itself
        if (parentType === "FunctionDeclaration" && node.parent?.id === node) return;
        if (parentType === "VariableDeclarator" && node.parent?.id === node) return;

        // Skip: property keys (obj.foo — foo is not a reference to the function)
        if (
          parentType === "MemberExpression" &&
          node.parent?.property === node &&
          !node.parent?.computed
        )
          return;
        if (parentType === "Property" && node.parent?.key === node && !node.parent?.computed)
          return;

        const entry = functions.get(name)!;
        entry.count++;
      },

      "Program:exit"() {
        for (const [name, { node, count }] of functions) {
          if (exported.has(name)) continue;
          if (count === 1) {
            context.report({
              node,
              message: `Function "${name}" is only used once. Inline it at the call site.`,
            });
          }
        }
      },
    };
  },
};

export default rule;
