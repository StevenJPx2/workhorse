import path from "node:path";

const KEBAB_CASE_PATTERN =
  /^[a-z0-9]+(-[a-z0-9]+)*\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$|^[a-z0-9]+(-[a-z0-9]+)*\.(ts|tsx|js|jsx|mjs|cjs)$/;

const ALLOWED_SPECIAL_FILES = new Set(["index.ts", "index.tsx", "index.js", "index.jsx"]);

const rule = {
  meta: {
    docs: {
      description:
        "Enforce kebab-case file naming convention. Jiratown convention: all files must use kebab-case (e.g., my-module.ts).",
    },
  },

  create(context) {
    const filename = path.basename(context.filename);

    if (ALLOWED_SPECIAL_FILES.has(filename)) {
      return {};
    }

    if (!KEBAB_CASE_PATTERN.test(filename)) {
      const suggested = filename
        .replace(/([A-Z])/g, "-$1")
        .toLowerCase()
        .replace(/^-/, "")
        .replace(/\.+/g, ".");

      context.report({
        loc: { line: 1, column: 0 },
        message: `Filename "${filename}" must use kebab-case. Suggested: "${suggested}"`,
      });
    }

    return {};
  },
};

export default rule;
