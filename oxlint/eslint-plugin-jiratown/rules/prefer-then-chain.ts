// Reports parenthesized await expressions that are immediately operated on.
// These should use .then() chains instead for better readability.
//
// Bad:
//   (await this.db.insert(x).returning())[0]!
//   (await fetch(url)).json()
//   (await getUser()).name
//   (await getData()) as MyType
//   (await getArray())!
//   (await getComments()).comments ?? []
//
// Good:
//   await this.db.insert(x).returning().then(r => r[0]!)
//   await fetch(url).then(r => r.json())
//   await getUser().then(r => r.name)
//   await getData().then(r => r as MyType)
//   await getArray().then(r => r!)
//   await getComments().then(r => r.comments ?? [])
//
// The .then() pattern is cleaner because:
//   1. Avoids awkward parentheses around await
//   2. Makes the data transformation explicit
//   3. Keeps the async chain readable left-to-right

const rule = {
  meta: {
    docs: {
      description:
        "Prefer .then() chains over parenthesized await expressions. Use `await foo().then(r => r[0])` instead of `(await foo())[0]`.",
    },
    fixable: "code" as const,
  },

  create(context) {
    // Get the operation suffix for the fix (e.g., "[0]!", ".name", ".json()")
    function getOperationSuffix(parent, childNode): string | null {
      const sourceCode = context.sourceCode;

      switch (parent.type) {
        case "MemberExpression": {
          // (await x)[0] or (await x).foo
          if (parent.object !== childNode) return null;

          if (parent.computed) {
            // (await x)[0] → r[...]
            const propText = sourceCode.getText(parent.property);
            return `[${propText}]`;
          } else {
            // (await x).foo → r.foo
            const propText = sourceCode.getText(parent.property);
            return `.${propText}`;
          }
        }

        case "TSNonNullExpression": {
          // (await x)! → r!
          return "!";
        }

        case "TSAsExpression": {
          // (await x) as Type → r as Type
          const typeAnnotation = sourceCode.getText(parent.typeAnnotation);
          return ` as ${typeAnnotation}`;
        }

        case "TSSatisfiesExpression": {
          // (await x) satisfies Type → r satisfies Type
          const typeAnnotation = sourceCode.getText(parent.typeAnnotation);
          return ` satisfies ${typeAnnotation}`;
        }

        default:
          return null;
      }
    }

    // Check if a node is a nullish coalescing or logical OR with current node as left operand
    function getNullishDefault(parent, childNode): string | null {
      if (parent?.type !== "LogicalExpression") return null;
      if (parent.left !== childNode) return null;
      if (parent.operator !== "??" && parent.operator !== "||") return null;

      const sourceCode = context.sourceCode;
      const rightText = sourceCode.getText(parent.right);
      return ` ${parent.operator} ${rightText}`;
    }

    // Build the full chain of operations
    function buildOperationChain(
      startNode,
      awaitNode,
    ): { chain: string; outerNode: unknown } | null {
      let current = startNode;
      let chain = "";

      while (current) {
        const suffix = getOperationSuffix(current, current === startNode ? awaitNode : current);

        if (suffix === null) {
          // Check if current's parent continues the chain
          const parent = current.parent;
          if (!parent) break;

          const parentSuffix = getOperationSuffix(parent, current);
          if (parentSuffix === null) break;

          chain += parentSuffix;

          // Handle call expressions on member access: (await x).foo()
          if (
            parent.type === "MemberExpression" &&
            parent.parent?.type === "CallExpression" &&
            parent.parent.callee === parent
          ) {
            const callNode = parent.parent;
            const args = callNode.arguments
              .map((arg) => context.sourceCode.getText(arg))
              .join(", ");
            chain += `(${args})`;
            current = callNode;
          } else {
            current = parent;
          }
        } else {
          chain += suffix;

          // Handle call expressions on member access: (await x).foo()
          if (
            current.type === "MemberExpression" &&
            current.parent?.type === "CallExpression" &&
            current.parent.callee === current
          ) {
            const callNode = current.parent;
            const args = callNode.arguments
              .map((arg) => context.sourceCode.getText(arg))
              .join(", ");
            chain += `(${args})`;
            current = callNode;
          }

          // Check if there's more chain
          const parent = current.parent;
          if (!parent) break;

          const nextSuffix = getOperationSuffix(parent, current);
          if (nextSuffix === null) break;

          current = parent;
        }
      }

      if (!chain) return null;

      // Check for trailing nullish coalescing or logical OR: (await x).foo ?? default
      const nullishDefault = getNullishDefault(current.parent, current);
      if (nullishDefault) {
        chain += nullishDefault;
        current = current.parent;
      }

      return { chain, outerNode: current };
    }

    function checkAwaitExpression(node) {
      const parent = node.parent;
      if (!parent) return;

      // Check if the parent is an operation we care about
      const operationTypes = [
        "MemberExpression",
        "TSNonNullExpression",
        "TSAsExpression",
        "TSSatisfiesExpression",
      ];

      if (!operationTypes.includes(parent.type)) return;

      // For MemberExpression, make sure await is the object, not the property
      if (parent.type === "MemberExpression" && parent.object !== node) return;

      // Build the operation chain
      const result = buildOperationChain(parent, node);
      if (!result) return;

      const { chain, outerNode } = result;
      const sourceCode = context.sourceCode;

      // Get the expression being awaited
      const awaitedExpr = sourceCode.getText(node.argument);

      context.report({
        node: outerNode,
        message: `Prefer .then() chain over parenthesized await. Use \`await ${awaitedExpr}.then((r) => r${chain})\` instead.`,
        fix(fixer) {
          const fixedCode = `await ${awaitedExpr}.then((r) => r${chain})`;
          return fixer.replaceText(outerNode, fixedCode);
        },
      });
    }

    return {
      AwaitExpression: checkAwaitExpression,
    };
  },
};

export default rule;
