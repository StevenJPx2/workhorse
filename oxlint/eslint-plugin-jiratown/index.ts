import maxLinesPerFile from "./rules/max-lines-per-file";
import enforceKebabCaseFilenames from "./rules/enforce-kebab-case-filenames";
import enforceColocatedExports from "./rules/enforce-colocated-exports";
import enforceTestColocation from "./rules/enforce-test-colocation";
import noSingleReferenceFunction from "./rules/no-single-reference-function";

const plugin = {
  meta: {
    name: "eslint-plugin-jiratown",
    version: "1.0.0",
  },
  rules: {
    "max-lines-per-file": maxLinesPerFile,
    "enforce-kebab-case-filenames": enforceKebabCaseFilenames,
    "enforce-colocated-exports": enforceColocatedExports,
    "enforce-test-colocation": enforceTestColocation,
    "no-single-reference-function": noSingleReferenceFunction,
  },
};

export default plugin;
