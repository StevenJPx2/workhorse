/**
 * TextInput component types
 */

export interface TextInputProps {
  /** Unique ID for this input (used by keyboard context) */
  inputId: string;
  /** Current input value */
  value: string;
  /** Called when input changes */
  onChange: (value: string) => void;
  /** Called when user submits (Enter in single-line, Ctrl/Cmd+Enter in multiline) */
  onSubmit?: (value: string) => void;
  /** Called when user exits input mode (Escape) */
  onExit?: () => void;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Label text above input */
  label?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Input width - required for overflow calculation in single-line mode */
  width?: number | `${number}%` | "auto";
  /** Input height - only used in multiline mode. If not set, grows with content. */
  height?: number;
  /** Show border */
  border?: boolean;
  /** Whether the input is focused (from grid context, overrides internal check) */
  focused?: boolean;
  /** Enable multiline mode - text wraps, Enter adds newline, Ctrl/Cmd+Enter submits */
  multiline?: boolean;
  /** Maximum visible width for overflow calculation (characters). Single-line only.
   * When text exceeds this, shows end of text with "…" prefix to keep cursor visible.
   * If not provided and width is a number, auto-calculates from width - padding - border. */
  maxVisibleWidth?: number;
  /** Background color for the input. When border={false}, this is applied to text elements
   * to match the parent container's background. */
  backgroundColor?: string;
}
