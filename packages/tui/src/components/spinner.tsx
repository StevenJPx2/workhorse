import { createSignal, onCleanup } from "solid-js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface SpinnerProps {
  /** Text color for the spinner */
  color?: string;
}

/**
 * Animated spinner component.
 * Cycles through braille dot patterns at ~80ms per frame.
 * Must be placed in a box layout (not inside text elements).
 */
export function Spinner(props: SpinnerProps) {
  const [frameIndex, setFrameIndex] = createSignal(0);

  // Animate spinner at ~80ms per frame
  const interval = setInterval(() => {
    setFrameIndex((i) => (i + 1) % SPINNER_FRAMES.length);
  }, 80);

  onCleanup(() => clearInterval(interval));

  return <text fg={props.color}>{SPINNER_FRAMES[frameIndex()]}</text>;
}
