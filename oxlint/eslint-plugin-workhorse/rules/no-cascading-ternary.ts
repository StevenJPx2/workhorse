// Reports cascading/nested ternary expressions.
// These should be refactored to use maps or switch statements for better readability.
//
// Bad:
//   s === "a" ? 1 : s === "b" ? 2 : s === "c" ? 3 : 4
//
// Good:
//   const map = { a: 1, b: 2, c: 3 };
//   return map[s] ?? 4;
//
// Or:
//   switch (s) {
//     case "a": return 1;
//     case "b": return 2;
//     case "c": return 3;
//     default: return 4;
//   }
//
// Configuration:
//   - maxDepth (default: 1): Maximum nesting depth before reporting
//     - 1 = disallow any nested ternary (a ? b : c ? d : e)
//     - 2 = allow one level of nesting, report deeper

interface RuleOptions {
  maxDepth?: number;
}

const rule = {
  meta: {
    docs: {
      description:
        "Disallow cascading ternary expressions. Use object maps or switch statements instead for better readability.",
    },
    schema: [
      {
        type: "object" as const,
        properties: {
          maxDepth: {
            type: "number" as const,
            minimum: 1,
            default: 1,
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options: RuleOptions = context.options[0] ?? {};
    const maxDepth = options.maxDepth ?? 1;

    // Track which ConditionalExpression nodes we've already reported
    // to avoid duplicate reports on the same chain
    const reported = new WeakSet();

    function getTernaryDepth(node, depth = 1): number {
      if (node.type !== "ConditionalExpression") {
        return depth - 1;
      }

      // Check consequent and alternate for nested ternaries
      const consequentDepth =
        node.consequent?.type === "ConditionalExpression"
          ? getTernaryDepth(node.consequent, depth + 1)
          : depth;

      const alternateDepth =
        node.alternate?.type === "ConditionalExpression"
          ? getTernaryDepth(node.alternate, depth + 1)
          : depth;

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
        // Find the root of this ternary chain
        const root = findRootTernary(node);

        // Only process from the root to avoid duplicate reports
        if (node !== root) return;

        // Skip if already reported
        if (reported.has(root)) return;

        const depth = getTernaryDepth(root);

        if (depth > maxDepth) {
          reported.add(root);

          const suggestion =
            depth >= 3
              ? "Consider using an object map or switch statement for complex conditional logic."
              : "Consider using an object map or switch statement instead of nested ternaries.";

          context.report({
            node: root,
            message: `Cascading ternary expression (${depth} levels deep). ${suggestion}`,
          });
        }
      },
    };
  },
};

export default rule;
