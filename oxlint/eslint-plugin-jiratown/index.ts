import maxLinesPerFile from "./rules/max-lines-per-file";
import enforceKebabCaseFilenames from "./rules/enforce-kebab-case-filenames";
import enforceColocatedExports from "./rules/enforce-colocated-exports";
import enforceTestColocation from "./rules/enforce-test-colocation";
import noSingleReferenceFunction from "./rules/no-single-reference-function";
import noSingleUseVariable from "./rules/no-single-use-variable";
import enforceBarrelExports from "./rules/enforce-barrel-exports";
import noIndexImports from "./rules/no-index-imports";
import noSectionComments from "./rules/no-section-comments";
import preferFolderBarrel from "./rules/prefer-folder-barrel";
import preferPathAlias from "./rules/prefer-path-alias";
import preferThenChain from "./rules/prefer-then-chain";

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
    "no-single-use-variable": noSingleUseVariable,
    "enforce-barrel-exports": enforceBarrelExports,
    "no-index-imports": noIndexImports,
    "no-section-comments": noSectionComments,
    "prefer-folder-barrel": preferFolderBarrel,
    "prefer-path-alias": preferPathAlias,
    "prefer-then-chain": preferThenChain,
  },
};

export default plugin;
