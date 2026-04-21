import maxLinesPerFile from "./rules/max-lines-per-file";
import enforceKebabCaseFilenames from "./rules/enforce-kebab-case-filenames";
import enforceColocatedExports from "./rules/enforce-colocated-exports";
import enforceTestColocation from "./rules/enforce-test-colocation";
import noSingleReferenceFunction from "./rules/no-single-reference-function";
import enforceBarrelExports from "./rules/enforce-barrel-exports";
import noIndexImports from "./rules/no-index-imports";

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
    "enforce-barrel-exports": enforceBarrelExports,
    "no-index-imports": noIndexImports,
  },
};

export default plugin;
