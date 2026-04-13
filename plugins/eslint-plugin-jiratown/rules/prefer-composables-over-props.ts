const MAX_HANDLER_PROPS = 5;
const CONTEXT_SUGGESTION_THRESHOLD = 8;

// Common UI primitive components that don't count as prop drilling
// These are leaf components that naturally need handler props
const PRIMITIVE_COMPONENTS = new Set([
  "Button",
  "TextInput",
  "Select",
  "Checkbox",
  "Input",
  "Dialog",
  "Modal",
  "ChatBox",
]);

const rule = {
  meta: {
    docs: {
      description:
        "Prefer composables over excessive prop drilling. Warns when components receive too many handler props, suggesting extraction into a composable hook or Context.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const isTestFile = /\.test\.(ts|tsx|js|jsx)$/.test(filename);
    const isSandboxFile = filename.includes("/sandbox/");
    if (isTestFile || isSandboxFile) return {};

    let handlerPropCount = 0;
    // Track which custom components receive handlers (potential prop drilling)
    const componentHandlers = new Map();

    function isHandlerPropName(name) {
      return name.startsWith("on") && name.length > 2 && name[2] === name[2].toUpperCase();
    }

    function getParentComponentName(node) {
      // Walk up to find the JSXOpeningElement
      let current = node.parent;
      while (current) {
        if (current.type === "JSXOpeningElement" && current.name?.type === "JSXIdentifier") {
          return current.name.name;
        }
        current = current.parent;
      }
      return null;
    }

    function isCustomComponent(name) {
      // Custom components start with uppercase and aren't primitives
      return name && name[0] === name[0].toUpperCase() && !PRIMITIVE_COMPONENTS.has(name);
    }

    return {
      JSXAttribute(node) {
        if (node.name?.type === "JSXIdentifier" && isHandlerPropName(node.name.name)) {
          const componentName = getParentComponentName(node);

          // Don't count handlers passed to primitive UI components
          if (componentName && PRIMITIVE_COMPONENTS.has(componentName)) {
            return;
          }

          handlerPropCount++;

          // Track handlers passed to custom components (prop drilling indicators)
          if (isCustomComponent(componentName)) {
            const count = componentHandlers.get(componentName) || 0;
            componentHandlers.set(componentName, count + 1);
          }
        }
      },
      "Program:exit"() {
        if (handlerPropCount > MAX_HANDLER_PROPS) {
          // Check if handlers are being drilled through custom components
          const drilledComponents = Array.from(componentHandlers.entries())
            .filter(([_, count]) => count >= 2)
            .map(([name]) => name);

          let message = `Component has ${handlerPropCount} handler props (max: ${MAX_HANDLER_PROPS}). `;

          if (handlerPropCount >= CONTEXT_SUGGESTION_THRESHOLD || drilledComponents.length > 0) {
            message += "Consider using a Context to share handlers across descendant components, ";
            message += "or extract related handlers into a composable hook.";
            if (drilledComponents.length > 0) {
              message += ` Props are being drilled to: ${drilledComponents.join(", ")}.`;
            }
          } else {
            message += "Extract related handlers into a composable hook to reduce prop count.";
          }

          context.report({
            loc: { line: 1, column: 0 },
            message,
          });
        }
      },
    };
  },
};

export default rule;
