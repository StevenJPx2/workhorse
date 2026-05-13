import path from "node:path";

// Check if filename contains uppercase letters (camelCase or PascalCase)
function hasUpperCase(filename: string): boolean {
  // Strip extension and check for uppercase
  const name = filename.replace(/\.[^.]+$/, "");
  return /[A-Z]/.test(name);
}

const ALLOWED_SPECIAL_FILES = new Set(["index.ts", "index.tsx", "index.js", "index.jsx"]);

const rule = {
  meta: {
    docs: {
      description:
        "Enforce kebab-case file naming convention. Workhorse convention: all files must use kebab-case (e.g., my-module.ts).",
    },
  },

  create(context) {
    const filename = path.basename(context.filename);

    if (ALLOWED_SPECIAL_FILES.has(filename)) {
      return {};
    }

    if (hasUpperCase(filename)) {
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
