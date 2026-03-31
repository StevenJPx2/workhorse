/**
 * Theme type definitions for Jiratown TUI
 */

// Color string type
type Color = string;

// Theme interface matching the color structure
export interface Theme {
  // Primary brand colors
  primary: Color;
  primaryDim: Color;
  secondary: Color;

  // Background colors
  bg: {
    shell: Color;
    base: Color;
    elevated: Color;
    highlight: Color;
    input: Color;
  };

  // Text colors
  text: {
    primary: Color;
    secondary: Color;
    dim: Color;
    inverse: Color;
  };

  // Border colors
  border: {
    default: Color;
    focus: Color;
    dim: Color;
  };

  // Status colors (for ticket states)
  status: {
    pending: Color;
    queued: Color;
    planning: Color;
    implementing: Color;
    blocked: Color;
    pr_created: Color;
    in_review: Color;
    done: Color;
  };

  // Semantic colors
  success: Color;
  successBright: Color;
  warning: Color;
  warningBright: Color;
  error: Color;
  errorBright: Color;
  info: Color;
  infoBright: Color;

  // Agent colors
  agent: {
    opencode: Color;
    claude: Color;
  };
}

// Available theme names
export type ThemeName = "default" | "gruvbox";
