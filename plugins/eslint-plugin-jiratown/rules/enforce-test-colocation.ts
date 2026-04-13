import fs from "node:fs";
import path from "node:path";

const IMPLEMENTATION_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const TEST_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"];
const MIN_FILES_THRESHOLD = 2;
const MAX_TEST_RATIO = 0.4;

function isTestFile(filename) {
  return TEST_SUFFIXES.some((suffix) => filename.endsWith(suffix));
}

function isImplementationFile(filename) {
  const ext = path.extname(filename);
  if (!IMPLEMENTATION_EXTENSIONS.has(ext)) return false;
  return !isTestFile(filename);
}

const rule = {
  meta: {
    docs: {
      description:
        "Enforce test file colocation boundaries. When a folder has >2 files and the test-to-implementation ratio exceeds 40%, move tests to a __tests__/ directory.",
    },
  },

  create(context) {
    const filename = context.filename;

    if (
      filename.includes("node_modules") ||
      filename.includes("dist") ||
      filename.includes("__tests__")
    ) {
      return {};
    }

    try {
      const dirname = path.dirname(filename);
      const entries = fs.readdirSync(dirname);

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
          message: `Folder "${path.basename(dirname)}" has ${testFiles.length} test files out of ${totalSourceFiles} total (${Math.round(testRatio * 100)}% test ratio, max: ${Math.round(MAX_TEST_RATIO * 100)}%). Move tests to a __tests__/ directory.`,
        });
      }
    } catch {
      // Directory may not be accessible during linting
    }

    return {};
  },
};

export default rule;
