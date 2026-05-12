// Reports section/step comments that should be removed.
// These are typically auto-generated or placeholder comments that add noise.
//
// Patterns matched:
//   - // --          (section dividers)
//   - // ---         (more dashes)
//   - // 1.          (numbered steps)
//   - // 2. Do X     (numbered steps with text)
//   - // Step 1:     (step labels)
//
// These patterns indicate scaffolding comments that should be
// replaced with meaningful comments or removed entirely.

const rule = {
  meta: {
    docs: {
      description:
        "Disallow section divider comments (// --) and numbered step comments (// 1.). Replace with meaningful comments or remove.",
    },
    fixable: "code" as const,
  },

  create(context) {
    // Patterns to match:
    // - Lines that are just dashes: // -- or // ---
    // - Numbered steps: // 1. or // 1. Do something
    // - Step labels: // Step 1: or // Step 1 -
    const sectionDividerPattern = /^-{2,}$/;
    const numberedStepPattern = /^\d+\.\s*/;
    const stepLabelPattern = /^step\s+\d+[:\s-]/i;
    // Section headers with separators: // === or // ###
    const separatorPattern = /^[=#]{3,}/;

    return {
      Program() {
        const sourceCode = context.sourceCode;
        const comments = sourceCode.getAllComments?.() ?? [];

        for (const comment of comments) {
          // Only check line comments (not block comments)
          if (comment.type !== "Line") continue;

          const text = comment.value.trim();

          let message: string | null = null;

          if (sectionDividerPattern.test(text)) {
            message =
              "Remove section divider comment. Use meaningful comments or whitespace instead.";
          } else if (numberedStepPattern.test(text)) {
            message =
              "Remove numbered step comment. Code should be self-documenting or use descriptive comments.";
          } else if (stepLabelPattern.test(text)) {
            message =
              "Remove step label comment. Code should be self-documenting or use descriptive comments.";
          } else if (separatorPattern.test(text)) {
            message =
              "Remove section separator comment. Use whitespace to separate logical sections.";
          }

          if (message) {
            context.report({
              node: comment,
              message,
              fix(fixer) {
                // Remove the entire comment line including the newline
                const start = comment.range[0];
                const end = comment.range[1];

                // Try to also remove the preceding whitespace and trailing newline
                const sourceText = sourceCode.text;
                let removeStart = start;
                let removeEnd = end;

                // Walk back to remove leading whitespace on the line
                while (removeStart > 0 && /[ \t]/.test(sourceText[removeStart - 1])) {
                  removeStart--;
                }

                // Remove trailing newline if present
                if (sourceText[removeEnd] === "\n") {
                  removeEnd++;
                } else if (sourceText[removeEnd] === "\r" && sourceText[removeEnd + 1] === "\n") {
                  removeEnd += 2;
                }

                return fixer.removeRange([removeStart, removeEnd]);
              },
            });
          }
        }
      },
    };
  },
};

export default rule;
