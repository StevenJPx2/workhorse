import fs from "node:fs";
import path from "node:path";

const IMPLEMENTATION_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const TEST_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"];
const MIN_FILES_THRESHOLD = 2;
const MAX_TEST_RATIO = 0.3;

function isTestFile(filename: string): boolean {
  return TEST_SUFFIXES.some((suffix) => filename.endsWith(suffix));
}

function isImplementationFile(filename: string): boolean {
  const ext = path.extname(filename);
  if (!IMPLEMENTATION_EXTENSIONS.has(ext)) return false;
  return !isTestFile(filename);
}

const rule = {
  meta: {
    docs: {
      description:
        "Enforce test file colocation boundaries. When a folder has >2 files and the test-to-implementation ratio exceeds 30%, move tests to a __tests__/ directory. When a __tests__/ directory already exists, all test files in the same folder must be placed inside it.",
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

      // If this is a test file and a __tests__/ directory already exists as a
      // sibling, the test must live inside __tests__/ instead.
      if (isTestFile(path.basename(filename))) {
        const hasTestsDir = entries.some(
          (entry) => entry === "__tests__" && fs.statSync(path.join(dirname, entry)).isDirectory(),
        );

        if (hasTestsDir) {
          context.report({
            loc: { line: 1, column: 0 },
            message: `A __tests__/ directory already exists in "${path.basename(dirname)}". Move this test file inside __tests__/ instead.`,
          });
          return {};
        }
      }

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
