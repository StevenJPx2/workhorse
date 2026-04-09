const MAX_HANDLER_PROPS = 5;

const rule = {
  meta: {
    docs: {
      description:
        "Prefer composables over excessive prop drilling. Warns when components receive too many handler props, suggesting extraction into a composable.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const isTestFile = /\.test\.(ts|tsx|js|jsx)$/.test(filename);
    if (isTestFile) return {};

    let handlerPropCount = 0;

    function isHandlerPropName(name) {
      return (
        name.startsWith("on") &&
        name.length > 2 &&
        name[2] === name[2].toUpperCase()
      );
    }

    return {
      JSXAttribute(node) {
        if (
          node.name?.type === "JSXIdentifier" &&
          isHandlerPropName(node.name.name)
        ) {
          handlerPropCount++;
        }
      },
      "Program:exit"() {
        if (handlerPropCount > MAX_HANDLER_PROPS) {
          context.report({
            loc: { line: 1, column: 0 },
            message: `Component receives ${handlerPropCount} handler props (max: ${MAX_HANDLER_PROPS}). Extract into a composable hook to reduce prop drilling.`,
          });
        }
      },
    };
  },
};

export default rule;