import enforceBarrelExports from "./rules/enforce-barrel-exports";
import enforceColocatedExports from "./rules/enforce-colocated-exports";
import enforceKebabCaseFilenames from "./rules/enforce-kebab-case-filenames";
import enforceTestColocation from "./rules/enforce-test-colocation";
import maxLinesPerFile from "./rules/max-lines-per-file";
import noIndexImports from "./rules/no-index-imports";
import noReexportChain from "./rules/no-reexport-chain";
import noReexportOutsideBarrel from "./rules/no-reexport-outside-barrel";
import noSectionComments from "./rules/no-section-comments";
import noSingleReferenceFunction from "./rules/no-single-reference-function";
import noSingleUseVariable from "./rules/no-single-use-variable";
import preferExportDirectory from "./rules/prefer-export-directory";
import preferFolderBarrel from "./rules/prefer-folder-barrel";
import preferInlineSingleImport from "./rules/prefer-inline-single-import";
import preferPathAlias from "./rules/prefer-path-alias";
import preferThenChain from "./rules/prefer-then-chain";

const plugin = {
  meta: {
    name: "eslint-plugin-workhorse",
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
    "no-reexport-chain": noReexportChain,
    "no-reexport-outside-barrel": noReexportOutsideBarrel,
    "prefer-export-directory": preferExportDirectory,
    "prefer-folder-barrel": preferFolderBarrel,
    "prefer-inline-single-import": preferInlineSingleImport,
    "prefer-path-alias": preferPathAlias,
    "prefer-then-chain": preferThenChain,
  },
};

export default plugin;
