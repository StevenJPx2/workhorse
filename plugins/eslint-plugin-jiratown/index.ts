import maxLinesPerFile from "./rules/max-lines-per-file";
import enforceKebabCaseFilenames from "./rules/enforce-kebab-case-filenames";
import enforceColocatedExports from "./rules/enforce-colocated-exports";
import preferComposablesOverProps from "./rules/prefer-composables-over-props";
import enforceTestColocation from "./rules/enforce-test-colocation";

const plugin = {
  meta: {
    name: "eslint-plugin-jiratown",
    version: "1.0.0",
  },
  rules: {
    "max-lines-per-file": maxLinesPerFile,
    "enforce-kebab-case-filenames": enforceKebabCaseFilenames,
    "enforce-colocated-exports": enforceColocatedExports,
    "prefer-composables-over-props": preferComposablesOverProps,
    "enforce-test-colocation": enforceTestColocation,
  },
};

export default plugin;
