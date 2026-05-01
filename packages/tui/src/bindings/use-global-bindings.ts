/**
 * Global keybindings for the Jiratown TUI.
 * These are always active (but some are conditionally enabled).
 */
import { useBindings, reactiveMatcherFromSignal } from "@opentui/keymap/solid";
import { useRenderer } from "@opentui/solid";
import { Commands } from "../keymap.ts";
import { ui } from "../state/ui.ts";

/**
 * Setup global keybindings for the app.
 * Call this once in the root App component.
 */
export function useGlobalBindings() {
  const renderer = useRenderer();
  const notInputOrModal = () => !ui.inputMode() && !ui.modal();

  useBindings(() => ({
    commands: [
      {
        name: Commands.QUIT,
        title: "Quit",
        desc: "Exit the application",
        run: () => {
          renderer.destroy();
        },
      },
      {
        name: Commands.SHOW_HELP,
        title: "Help",
        desc: "Show help screen",
        run: () => {
          ui.setScreen("help");
        },
      },
      {
        name: Commands.CLOSE_MODAL,
        title: "Close Modal",
        desc: "Close the current modal",
        run: () => {
          ui.closeModal();
        },
      },
      {
        name: Commands.FOCUS_NEXT,
        title: "Focus Next",
        desc: "Move focus to next component",
        run: () => {
          ui.focusNext();
        },
      },
      {
        name: Commands.FOCUS_PREV,
        title: "Focus Previous",
        desc: "Move focus to previous component",
        run: () => {
          ui.focusPrev();
        },
      },
      {
        name: Commands.BACK,
        title: "Back",
        desc: "Go back to overview",
        run: () => {
          ui.backToOverview();
        },
      },
      {
        name: Commands.EXIT_INPUT,
        title: "Exit Input",
        desc: "Exit input mode and return to navigation",
        run: () => {
          ui.exitInputMode();
          // Move focus back to issues list when exiting input
          ui.setFocusedComponent("issues");
        },
      },
    ],
    bindings: [
      {
        key: "q",
        cmd: Commands.QUIT,
        enabled: reactiveMatcherFromSignal(notInputOrModal, (v) => v),
      },
      {
        key: "?",
        cmd: Commands.SHOW_HELP,
        enabled: reactiveMatcherFromSignal(notInputOrModal, (v) => v),
      },
      {
        key: "h",
        cmd: Commands.SHOW_HELP,
        enabled: reactiveMatcherFromSignal(notInputOrModal, (v) => v),
      },
      {
        key: "tab",
        cmd: Commands.FOCUS_NEXT,
        enabled: reactiveMatcherFromSignal(notInputOrModal, (v) => v),
      },
      {
        key: "shift+tab",
        cmd: Commands.FOCUS_PREV,
        enabled: reactiveMatcherFromSignal(notInputOrModal, (v) => v),
      },
      // ESC: close modal (highest priority)
      {
        key: "escape",
        cmd: Commands.CLOSE_MODAL,
        enabled: reactiveMatcherFromSignal(ui.modal, (v) => v !== null),
      },
      // ESC: exit input mode when typing
      {
        key: "escape",
        cmd: Commands.EXIT_INPUT,
        enabled: reactiveMatcherFromSignal(
          () => !ui.modal() && ui.inputMode(),
          (v) => v,
        ),
      },
      // ESC: go back from help/agent screens
      {
        key: "escape",
        cmd: Commands.BACK,
        enabled: reactiveMatcherFromSignal(
          () => !ui.modal() && !ui.inputMode() && ui.screen() !== "overview",
          (v) => v,
        ),
      },
    ],
  }));
}
