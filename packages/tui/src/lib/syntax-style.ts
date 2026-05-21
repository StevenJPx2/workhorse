/**
 * Shared SyntaxStyle configuration for markdown rendering in the TUI.
 *
 * Creates a lazily-initialized singleton SyntaxStyle that can be used
 * across all markdown components in the app.
 */
import { SyntaxStyle } from "@opentui/core";

import { getTheme } from "../theme.ts";

let _syntaxStyle: SyntaxStyle | null = null;

/**
 * Get the shared SyntaxStyle instance for markdown rendering.
 * Creates it lazily on first access with colors from the current theme.
 */
export function getSyntaxStyle(): SyntaxStyle {
  if (_syntaxStyle) {
    return _syntaxStyle;
  }

  const theme = getTheme();

  _syntaxStyle = SyntaxStyle.fromStyles({
    // Headings
    "markup.heading.1": { fg: theme.colors.accent, bold: true },
    "markup.heading.2": { fg: theme.colors.accent, bold: true },
    "markup.heading.3": { fg: theme.colors.info, bold: true },
    "markup.heading.4": { fg: theme.colors.info },
    "markup.heading.5": { fg: theme.colors.info },
    "markup.heading.6": { fg: theme.colors.info },

    // Emphasis
    "markup.bold": { bold: true },
    "markup.italic": { italic: true },
    "markup.underline": { underline: true },

    // Code
    "markup.raw": { fg: theme.colors.warning },
    "markup.raw.block": { fg: theme.colors.text },

    // Lists
    "markup.list": { fg: theme.colors.info },
    "markup.list.numbered": { fg: theme.colors.info },

    // Links
    "markup.link": { fg: theme.colors.accent, underline: true },
    "markup.link.url": { fg: theme.colors.dim },

    // Quotes
    "markup.quote": { fg: theme.colors.dim, italic: true },

    // Default text
    default: { fg: theme.colors.text },
  });

  return _syntaxStyle;
}

/**
 * Reset the syntax style (e.g., when theme changes).
 * The next call to getSyntaxStyle() will create a new instance.
 */
export function resetSyntaxStyle(): void {
  if (_syntaxStyle) {
    _syntaxStyle.destroy();
    _syntaxStyle = null;
  }
}
