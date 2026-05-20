import { createSignal, onCleanup } from "solid-js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Full-screen overlay displayed during graceful shutdown.
 * Shows an animated spinner and "Shutting down..." message.
 */
export function ShutdownOverlay() {
  const [frameIndex, setFrameIndex] = createSignal(0);

  // Animate spinner at ~80ms per frame
  const interval = setInterval(() => {
    setFrameIndex((i) => (i + 1) % SPINNER_FRAMES.length);
  }, 80);

  onCleanup(() => clearInterval(interval));

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      backgroundColor="black"
      justifyContent="center"
      alignItems="center"
      zIndex={2000}
    >
      <box
        width={30}
        height={5}
        borderStyle="single"
        borderColor="cyan"
        backgroundColor="black"
        justifyContent="center"
        alignItems="center"
      >
        <text fg="cyan">
          <b>{SPINNER_FRAMES[frameIndex()]} Shutting down...</b>
        </text>
      </box>
    </box>
  );
}
