const rule = {
  meta: {
    docs: {
      description:
        "Enforce maximum line count per file. Workhorse convention: files must not exceed 200 lines.",
    },
    schema: [
      {
        type: "number",
        default: 200,
      },
    ],
  },

  create(context) {
    const maxLines = context.options?.[0] ?? 200;
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const isTestFile = /\.test\.(ts|tsx|js|jsx)$/.test(filename);
    const effectiveMax = isTestFile ? Math.round(maxLines * 2.5) : maxLines;

    return {
      Program(node) {
        const sourceCode = context.sourceCode;
        const lineCount = sourceCode.lines.length;

        if (lineCount > effectiveMax) {
          context.report({
            node,
            message: `File has ${lineCount} lines (max: ${effectiveMax}${isTestFile ? " for test files" : ""}). Split into smaller modules.`,
          });
        }
      },
    };
  },
};

export default rule;
