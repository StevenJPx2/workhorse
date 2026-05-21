/**
 * Minimal terminal spinner that shows instantly before heavy imports.
 * Uses raw stdout to avoid any dependencies.
 */

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

let frameIndex = 0;
let interval: ReturnType<typeof setInterval> | null = null;
let message = "Starting Workhorse...";

/** Start the preloader spinner. Call this before any imports. */
export function startPreloader(initialMessage = "Starting Workhorse...") {
  message = initialMessage;
  frameIndex = 0;

  // Hide cursor
  process.stdout.write("\x1B[?25l");

  // Start spinner animation
  interval = setInterval(() => {
    process.stdout.write(
      `\r${SPINNER_FRAMES[frameIndex++ % SPINNER_FRAMES.length]} ${message}`,
    );
  }, 80);
}

/** Update the preloader message. */
export function updatePreloader(newMessage: string) {
  message = newMessage;
}

/** Stop the preloader and clear the line. */
export function stopPreloader() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }

  // Clear line and show cursor
  process.stdout.write("\r\x1B[K");
  process.stdout.write("\x1B[?25h");
}
